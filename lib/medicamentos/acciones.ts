"use server";

import { revalidatePath } from "next/cache";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { clienteConSesion, SESION_CADUCADA } from "@/lib/supabase/sesion";
import {
  analizarSheet,
  clasificarContraCatalogo,
  contarCatalogo,
  escribirCatalogo,
  huellaDeImportacion,
  leerCatalogoExistente,
  type Conflicto,
} from "./importar";
import {
  ConfiguracionIncompletaError,
  SheetVacioError,
  leerSheetMedicamentos,
} from "./sheet";

/**
 * Reimportación del catálogo de medicamentos desde la app (RF-13).
 *
 * Es la misma corrida que `scripts/import-medicamentos.mjs`, con la misma
 * lógica —`./importar.ts`, un solo archivo para los dos— pero disparada por la
 * doctora desde la pantalla de Configuración en vez de por una terminal.
 *
 * ## Las tres decisiones de seguridad, explícitas
 *
 * **1. La escritura usa `admin.ts`, y no por comodidad.** La política RLS de
 * `medicamentos_catalogo` es `for select` a secas
 * (`20260820120400_rls_y_grants.sql`, "Doctora autenticada - solo lectura"): el
 * catálogo es de solo lectura *incluso para la doctora autenticada*. Un `upsert`
 * con `lib/supabase/server.ts` no fallaría de forma ruidosa — RLS descarta las
 * filas y devuelve éxito con cero escritas. Escribirlo exige la clave secreta.
 * Por eso `admin.ts` aparece aquí y en ningún otro punto del flujo normal.
 *
 * **2. Todo lo demás usa `server.ts`.** Leer el catálogo para compararlo y
 * contarlo va con la sesión de la doctora y RLS aplicando. El cliente que salta
 * RLS se toca en una sola línea de este archivo, la del `upsert`, y no un
 * milímetro más.
 *
 * **3. `proxy.ts` no alcanza, y hay que decirlo.** La ruta `/configuracion`
 * queda protegida por `proxy.ts` —no está en `RUTAS_PUBLICAS` y el `matcher` la
 * incluye—, pero **una Server Action es un endpoint POST propio**, alcanzable
 * sin pasar por la pantalla que la muestra. La documentación de Next lo dice sin
 * rodeos: «you should still treat Server Actions as reachable via direct POST
 * requests and verify authentication and authorization inside each one»
 * (node_modules/next/dist/docs/01-app/02-guides/data-security.md). El agujero
 * concreto que eso evita aquí: un POST a `/login` —ruta pública, que `proxy.ts`
 * deja pasar— con el identificador de esta acción. Por eso las dos acciones
 * empiezan llamando a `clienteConSesion()` (lib/supabase/sesion.ts).
 *
 * ## Qué NO sale de aquí
 *
 * El valor devuelto de una Server Action se serializa y viaja al navegador. Lo
 * que se devuelve son números, nombres de medicamentos y coordenadas de celda.
 * **Nunca** el ID del Sheet, el correo de la Service Account, la clave en Base64
 * ni el mensaje crudo de un error de Google —que puede traer la URL del
 * documento pegada—. Los fallos inesperados se registran en el servidor y a la
 * pantalla va un texto fijo.
 */

/** Lo que la pantalla necesita saber de cada duplicado. Sin secretos. */
export type ConflictoVisible = Conflicto;

export type ResumenImportacion = {
  /** Columnas con principio activo en la fila 1 del Sheet. */
  principiosActivos: number;
  /** De esos, cuántos todavía no tienen ningún comercial cargado. */
  principiosSinComerciales: number;
  /** Comerciales únicos leídos del Sheet, ya deduplicados. */
  comercialesLeidos: number;
  /** Celdas en blanco salteadas. Es normal: el Sheet se llena por partes. */
  celdasVacias: number;
  /** Columnas con contenido pero sin encabezado: se omiten enteras. */
  columnasSinEncabezado: number;
  /** Copias del mismo comercial bajo el mismo genérico. Inofensivas. */
  repetidosMismoGenerico: number;
  /** El mismo comercial bajo genéricos distintos. Casi siempre, un tipeo. */
  conflictos: ConflictoVisible[];
  /**
   * El rango llega justo hasta donde terminan los datos: puede estar cortando
   * el Sheet por la derecha. Solo el tope, nunca el nombre del documento.
   */
  rangoRecortado: { tope: number } | null;
};

export type VistaPrevia = {
  ok: true;
  resumen: ResumenImportacion;
  /** Nombres comerciales que hoy NO están en el catálogo. */
  nuevos: { nombre_comercial: string; nombre_generico: string }[];
  /** Ya están, pero el Sheet les cambia el principio activo. */
  cambianGenerico: { nombre_comercial: string; antes: string; despues: string }[];
  /** Ya están exactamente así: el `upsert` los reescribe igual. */
  sinCambio: number;
  /** Cuántos hay en el catálogo AHORA, sin haber tocado nada. */
  totalActual: number | null;
  /** Ata la confirmación a esta vista previa. Ver `confirmarImportacion`. */
  huella: string;
};

export type ResultadoImportacion = {
  ok: true;
  resumen: ResumenImportacion;
  /** Filas enviadas en el `upsert`. */
  escritos: number;
  nuevos: number;
  actualizados: number;
  sinCambio: number;
  /** Total del catálogo tras la corrida. */
  totalFinal: number | null;
};

export type Fallo = { ok: false; mensaje: string; huellaCambiada?: boolean };

const ERROR_GENERICO =
  "No se pudo leer el Sheet de medicamentos. Revisa la conexión e inténtalo otra vez; si vuelve a fallar, avisa a soporte.";

/** Traduce un fallo a algo que se pueda mostrar sin filtrar configuración. */
function aMensaje(error: unknown): string {
  if (error instanceof ConfiguracionIncompletaError || error instanceof SheetVacioError) {
    return error.message;
  }
  // El error crudo de googleapis o de PostgREST puede traer la URL del
  // documento, el correo de la Service Account o un fragmento de la clave.
  // Queda en los logs del servidor (Vercel), que es donde se mira un fallo.
  console.error("[importar-medicamentos]", error);
  return ERROR_GENERICO;
}

function aResumen(analisis: ReturnType<typeof analizarSheet>): ResumenImportacion {
  return {
    principiosActivos: analisis.columnasConGenerico,
    principiosSinComerciales: analisis.genericosSinComerciales,
    comercialesLeidos: analisis.aImportar.length,
    celdasVacias: analisis.celdasVacias,
    columnasSinEncabezado: analisis.columnasSinEncabezado,
    repetidosMismoGenerico: analisis.repetidosMismoGenerico,
    conflictos: analisis.conflictos,
    // Se deja el tope numérico y se tira el nombre del rango: "MEDICAMENTOS" no
    // es un secreto grave, pero es configuración, y a la pantalla no le hace
    // falta para decir lo que tiene que decir.
    rangoRecortado: analisis.rangoRecortado ? { tope: analisis.rangoRecortado.tope } : null,
  };
}

/**
 * Paso 1: mirar sin tocar. El equivalente exacto de `--dry-run`.
 *
 * Lee el Sheet, lo transpone, detecta los duplicados y lo compara contra el
 * catálogo actual — y no escribe absolutamente nada. El cliente que se usa aquí
 * es el de la sesión, con RLS: para leer el catálogo alcanza y sobra.
 */
export async function previsualizarImportacion(): Promise<VistaPrevia | Fallo> {
  const supabase = await clienteConSesion();
  if (!supabase) return { ok: false, mensaje: SESION_CADUCADA };

  try {
    const { filas, rango } = await leerSheetMedicamentos();
    const analisis = analizarSheet(filas, rango);

    const existentes = await leerCatalogoExistente(supabase);
    const clasificacion = clasificarContraCatalogo(analisis.aImportar, existentes);

    return {
      ok: true,
      resumen: aResumen(analisis),
      nuevos: clasificacion.nuevos,
      cambianGenerico: clasificacion.cambianGenerico,
      sinCambio: clasificacion.sinCambio,
      totalActual: existentes.length,
      huella: huellaDeImportacion(analisis.aImportar),
    };
  } catch (error) {
    return { ok: false, mensaje: aMensaje(error) };
  }
}

/**
 * Paso 2: escribir de verdad.
 *
 * **Vuelve a leer el Sheet y exige que sea el mismo** que produjo la vista
 * previa: la `huella` que llega tiene que coincidir con la del contenido recién
 * leído. Si alguien editó el Sheet en el medio —o si esta acción se invocó por
 * POST directo, sin haber previsualizado nada—, no se escribe: se devuelve el
 * fallo con `huellaCambiada` y la pantalla obliga a volver a mirar.
 *
 * O sea que confirmar no escribe "lo que se vio", escribe "lo que hay, siempre
 * que siga siendo lo que se vio". La diferencia importa porque entre los dos
 * pasos pasan segundos y el Sheet es un documento vivo.
 *
 * Es la única línea del sistema, fuera de los scripts, que usa la clave que
 * salta RLS.
 */
export async function confirmarImportacion(huellaVista: string): Promise<ResultadoImportacion | Fallo> {
  const supabase = await clienteConSesion();
  if (!supabase) return { ok: false, mensaje: SESION_CADUCADA };

  if (typeof huellaVista !== "string" || huellaVista.length === 0) {
    return {
      ok: false,
      mensaje: "Falta la vista previa. Mira primero qué cambiaría y confirma después.",
      huellaCambiada: true,
    };
  }

  try {
    const { filas, rango } = await leerSheetMedicamentos();
    const analisis = analizarSheet(filas, rango);
    const huellaAhora = huellaDeImportacion(analisis.aImportar);

    if (huellaAhora !== huellaVista) {
      return {
        ok: false,
        huellaCambiada: true,
        mensaje:
          "El Sheet cambió después de la vista previa. No se escribió nada: vuelve a previsualizar para ver lo que hay ahora.",
      };
    }

    if (analisis.aImportar.length === 0) {
      return {
        ok: false,
        mensaje:
          "El Sheet no trae ningún medicamento que importar. No se escribió nada.",
      };
    }

    // La clasificación se calcula ANTES de escribir: después, todo estaría ya
    // en la base y "nuevos" daría cero. Es el número que contesta la pregunta
    // de verdad —¿esto agregó algo?— y solo existe si se mira antes.
    const existentes = await leerCatalogoExistente(supabase);
    const clasificacion = clasificarContraCatalogo(analisis.aImportar, existentes);

    // ---- La única escritura que salta RLS de todo el sistema ---------------
    const admin = crearClienteAdmin();
    const escritura = await escribirCatalogo(admin, analisis.aImportar);

    if (!escritura.ok) {
      console.error("[importar-medicamentos] falló el lote", escritura.lote, escritura.mensaje);
      return {
        ok: false,
        mensaje: `Se escribieron ${escritura.escritos} de ${analisis.aImportar.length} medicamentos y el lote ${escritura.lote} falló. Vuelve a importar: la operación es repetible y no deja duplicados.`,
      };
    }

    const totalFinal = await contarCatalogo(supabase);
    revalidatePath("/configuracion");

    return {
      ok: true,
      resumen: aResumen(analisis),
      escritos: escritura.escritos,
      nuevos: clasificacion.nuevos.length,
      actualizados: clasificacion.cambianGenerico.length,
      sinCambio: clasificacion.sinCambio,
      totalFinal,
    };
  } catch (error) {
    return { ok: false, mensaje: aMensaje(error) };
  }
}
