"use server";

import { revalidatePath } from "next/cache";
import { clienteConSesion, SESION_CADUCADA } from "@/lib/supabase/sesion";
import { fuenteDeMedida } from "@/lib/pdf/medicion";
import { hoyEnEcuador } from "@/lib/fechas";
import type { ConsultaRow, RecetaMedicamentoRow } from "@/lib/supabase/tipos";
import { buscarCie10, type ResultadoCie10 } from "./cie10";
import { buscarMedicamentos, type ResultadoMedicamentos } from "./medicamentos";
import { sinErrores, validarConsulta, type DatosConsulta } from "./formulario";
import { sinErroresReceta, validarReceta, type DatosMedicamento } from "./receta";
import { filaConsulta, filasMedicamentos, type ResultadoGuardado } from "./guardado";

/**
 * El buscador de CIE-10 visto desde el navegador (RF-11).
 *
 * Es una Server Action y no una consulta directa desde el componente porque
 * CLAUDE.md lo fija así: las Server Actions y las API Routes son el único punto
 * que habla con Supabase. Aquí eso además compra algo concreto — la consulta
 * corre con `lib/supabase/server.ts`, o sea con la sesión de la doctora y RLS
 * aplicando, y el navegador nunca recibe más filas que las diez que va a
 * pintar.
 *
 * No escribe nada. El catálogo es de solo lectura hasta para la doctora: su
 * política RLS es `for select` (20260820120400_rls_y_grants.sql).
 */

/**
 * Tope de lo que se acepta como término de búsqueda.
 *
 * `construirTsquery` ya se queda con cinco tokens y sanea carácter por
 * carácter, así que esto no es la defensa contra una inyección: es para no
 * pasear un texto absurdo hasta Postgres. Un diagnóstico se busca con dos o
 * tres palabras.
 */
const MAX_LARGO_BUSQUEDA = 120;

// Las dos búsquedas verifican la sesión como cualquier otra acción
// (lib/supabase/sesion.ts). Sin ella devuelven una lista vacía CON el mensaje,
// que el buscador muestra en lugar de "no hay coincidencias": antes RLS daba
// la lista vacía sin más y la doctora no sabía por qué el catálogo no traía nada.
export async function buscarCie10Accion(texto: string): Promise<ResultadoCie10> {
  const supabase = await clienteConSesion();
  if (!supabase) return { sugerencias: [], total: 0, tipo: "descripcion", mensaje: SESION_CADUCADA };
  return buscarCie10(supabase, String(texto ?? "").slice(0, MAX_LARGO_BUSQUEDA));
}

export async function buscarMedicamentosAccion(texto: string): Promise<ResultadoMedicamentos> {
  const supabase = await clienteConSesion();
  if (!supabase) return { sugerencias: [], total: 0, mensaje: SESION_CADUCADA };
  return buscarMedicamentos(supabase, String(texto ?? "").slice(0, MAX_LARGO_BUSQUEDA));
}

const ERROR_GENERICO =
  "No se pudo guardar la consulta. Revisa la conexión e inténtalo otra vez; si vuelve a fallar, avisa a soporte.";

/**
 * Guarda la consulta con su receta (tarea 4.5).
 *
 * **Es la primera escritura del flujo normal del sistema**: hasta aquí solo se
 * escribían pacientes. Tres cosas que importan:
 *
 * 1. Corre con `lib/supabase/server.ts`, o sea la clave publicable con la sesión
 *    de la doctora: **RLS aplica también al INSERT**, porque la política
 *    `FOR ALL` de `20260820120400_rls_y_grants.sql` trae `WITH CHECK`.
 * 2. **Se valida otra vez aquí**, con las mismas funciones que usó la pantalla.
 *    La del navegador es comodidad; esta es la defensa (Seguridad-OWASP.md). Y
 *    no es solo formalismo: si un texto demasiado largo se colara, el PDF
 *    lanzaría `ContenidoExcedeEspacioError` DESPUÉS de haber guardado, que es
 *    justo lo que ADR-005 quiere evitar.
 * 3. **El número de receta lo decide `filaConsulta`**, mirando si hay
 *    medicamentos. Con receta se omite la columna y la secuencia avanza; sin
 *    receta se manda `null` y no se toca (ADR-002).
 *
 * ## Sobre la atomicidad
 *
 * Son dos INSERT y PostgREST no da transacciones entre llamadas. Si el segundo
 * falla, se **borra la consulta recién creada** para no dejar una consulta
 * huérfana que aparezca en la línea de tiempo con una receta a medias. El
 * número de receta consumido no vuelve —una secuencia no retrocede, ADR-002—,
 * pero eso deja un hueco en el correlativo, que es infinitamente preferible a
 * un registro clínico incompleto. La alternativa de verdad atómica sería una
 * función `plpgsql` con las dos inserciones dentro; si esto llega a fallar
 * alguna vez en la práctica, esa es la salida.
 */
export async function guardarConsultaAccion(
  pacienteId: string,
  datos: DatosConsulta,
  medicamentos: DatosMedicamento[]
): Promise<ResultadoGuardado> {
  // La sesión se verifica AQUÍ, antes de leer o escribir nada: proxy.ts protege
  // rutas, no acciones (docs/arquitectura/Seguridad-OWASP.md).
  const supabase = await clienteConSesion();
  if (!supabase) return { ok: false, mensaje: SESION_CADUCADA };

  const font = await fuenteDeMedida();

  // El día de Ecuador, no el del proceso (en Vercel, UTC): ver lib/fechas.ts.
  const hoy = hoyEnEcuador();
  const errores = validarConsulta(datos, { hoy, font });
  if (!sinErrores(errores)) {
    return { ok: false, mensaje: "Hay campos de la consulta sin completar o fuera de límite." };
  }

  const erroresReceta = validarReceta(
    {
      signosAlarma: datos.signos_alarma,
      recomendaciones: datos.recomendaciones_no_farmacologicas,
      medicamentos,
    },
    font
  );
  if (!sinErroresReceta(erroresReceta)) {
    return { ok: false, mensaje: "Hay medicamentos incompletos o texto que no cabe en la receta." };
  }

  const { data: consulta, error } = await supabase
    .from("consultas")
    .insert(filaConsulta(pacienteId, datos, medicamentos))
    .select()
    .single<ConsultaRow>();

  if (error || !consulta) {
    return { ok: false, mensaje: ERROR_GENERICO };
  }

  const filas = filasMedicamentos(consulta.id, medicamentos);
  let guardados: RecetaMedicamentoRow[] = [];

  if (filas.length > 0) {
    const { data, error: errorMedicamentos } = await supabase
      .from("receta_medicamentos")
      .insert(filas)
      .select();

    if (errorMedicamentos) {
      // Compensación: sin esto quedaría una consulta con receta a medias.
      await supabase.from("consultas").delete().eq("id", consulta.id);
      return { ok: false, mensaje: ERROR_GENERICO };
    }
    guardados = (data ?? []) as RecetaMedicamentoRow[];
  }

  // La ficha del paciente muestra la línea de tiempo: sin esto, la consulta
  // recién guardada no aparecería hasta recargar a mano.
  revalidatePath(`/pacientes/${pacienteId}`);

  return { ok: true, consulta, medicamentos: guardados };
}
