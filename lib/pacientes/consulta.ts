import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PacienteRow } from "@/lib/supabase/tipos";
import {
  LIMITE_FILAS,
  construirTsquery,
  normalizarBusquedaDocumento,
  tipoDeBusqueda,
  type Orden,
} from "./busqueda";

/**
 * Solo las columnas que el listado dibuja. `select('*')` traería
 * antecedentes heredofamiliares, domicilio, datos del acompañante… 164 veces,
 * por cada tecla que se pulsa en el buscador. Traer de menos también es
 * seguridad: lo que no sale de la base no puede filtrarse por el HTML.
 */
const COLUMNAS =
  "id, nombre_completo, documento, tipo_documento, fecha_nacimiento, alergia_actual" as const;

export type PacienteListado = Pick<
  PacienteRow,
  "id" | "nombre_completo" | "documento" | "tipo_documento" | "fecha_nacimiento" | "alergia_actual"
>;

export interface ResultadoListado {
  pacientes: PacienteListado[];
  /** Cuántos coinciden en la base, aunque `pacientes` venga recortado. */
  total: number;
  /** Total sin filtros: el denominador de "N de M". */
  totalGeneral: number;
  /** Cuántas fichas tienen datos pendientes (ver `fichaIncompleta`). */
  totalIncompletas: number;
}

export interface OpcionesListado {
  busqueda: string;
  orden: Orden;
  soloIncompletas: boolean;
}

/**
 * `or()` que reproduce el predicado de `fichaIncompleta`.
 *
 * Mira `documento`, o sea el NÚMERO. Un paciente con pasaporte tiene su
 * documento completo y NO entra en este filtro: "sin documento" y "con un
 * documento que no es cédula" son dos cosas distintas, y confundirlas
 * enterraría a los 83 que de verdad hay que completar entre fichas que ya
 * están bien.
 */
const FILTRO_INCOMPLETAS = "documento.is.null,fecha_nacimiento.is.null";

/**
 * Trae los pacientes del listado.
 *
 * Recibe el cliente en vez de crearlo: así la pantalla decide con cuál corre
 * (hoy `lib/supabase/server.ts`, con la sesión de la doctora y RLS aplicando) y
 * este archivo no puede acabar importando `admin.ts` por descuido.
 *
 * El filtrado ocurre ENTERO en Postgres. Nada de traer 164 filas y filtrarlas
 * en JavaScript: además de tirar a la basura los índices, el día que la base
 * tenga 3.000 pacientes el navegador se comería la diferencia.
 */
export async function listarPacientes(
  supabase: SupabaseClient<Database>,
  { busqueda, orden, soloIncompletas }: OpcionesListado
): Promise<ResultadoListado> {
  let consulta = supabase.from("pacientes").select(COLUMNAS, { count: "exact" });

  if (busqueda) {
    if (tipoDeBusqueda(busqueda) === "documento") {
      // `ilike` con comodines a ambos lados: la doctora a veces solo recuerda
      // los últimos dígitos. Es un scan, no usa `idx_pacientes_documento` —con
      // 164 filas y una columna de 10 caracteres da igual, y forzar un prefijo
      // para aprovechar el índice haría que "345678" no encontrara nada.
      //
      // Se busca contra el número SIN mirar el tipo, a propósito: la doctora
      // tiene el documento en la mano y teclea lo que ve, no elige antes si es
      // cédula o pasaporte. `ilike` además ignora la caja, así que un pasaporte
      // tecleado en minúsculas encuentra al que está guardado en mayúsculas.
      consulta = consulta.ilike("documento", `%${normalizarBusquedaDocumento(busqueda)}%`);
    } else {
      const tsquery = construirTsquery(busqueda);
      // `construirTsquery` solo devuelve null si no quedó ni una letra; en ese
      // caso no se filtra, que es lo mismo que no haber buscado.
      if (tsquery) {
        // Sin `type`, supabase-js emite `fts`, o sea `to_tsquery` — la única
        // variante que acepta el `:*` de prefijo. `config: "spanish"` no es
        // opcional: `idx_pacientes_nombre` está creado sobre
        // `to_tsvector('spanish', nombre_completo)` y con otra configuración
        // Postgres no reconoce la expresión y descarta el índice.
        consulta = consulta.textSearch("nombre_completo", tsquery, { config: "spanish" });
      }
    }
  }

  if (soloIncompletas) consulta = consulta.or(FILTRO_INCOMPLETAS);

  // Desempate por `id` en los dos órdenes: sin una clave única al final, dos
  // filas con el mismo valor pueden intercambiarse entre una consulta y la
  // siguiente y la lista "parpadea" al teclear.
  consulta =
    orden === "alfabetico"
      ? consulta.order("nombre_completo", { ascending: true }).order("id")
      : consulta.order("created_at", { ascending: false }).order("id");

  const [listado, generales, incompletas] = await Promise.all([
    consulta.limit(LIMITE_FILAS),
    // `head: true` no baja ni una fila: solo el contador. Las tres consultas
    // salen en paralelo, así que la pantalla espera lo que tarde la más lenta.
    supabase.from("pacientes").select("id", { count: "exact", head: true }),
    supabase.from("pacientes").select("id", { count: "exact", head: true }).or(FILTRO_INCOMPLETAS),
  ]);

  if (listado.error) throw listado.error;

  return {
    pacientes: listado.data ?? [],
    total: listado.count ?? listado.data?.length ?? 0,
    totalGeneral: generales.count ?? 0,
    totalIncompletas: incompletas.count ?? 0,
  };
}

/**
 * Un paciente completo, para la ficha y para el formulario de edición.
 *
 * Aquí sí se traen TODAS las columnas, al revés que en el listado: son
 * diecisiete campos de una sola fila, y tanto la ficha como la edición los
 * necesitan. Hacer una lista de columnas sería una segunda copia del esquema
 * que habría que actualizar con cada migración.
 *
 * Devuelve `null` si no existe —o si RLS no deja verlo, que desde fuera es
 * indistinguible y así debe ser— para que la pantalla responda 404 en vez de
 * reventar con el error de PostgREST.
 */
export async function obtenerPaciente(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<PacienteRow | null> {
  // `maybeSingle` y no `single`: `single` trata "cero filas" como error, y una
  // ficha que no existe no es un fallo del sistema, es un 404.
  const { data, error } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .maybeSingle<PacienteRow>();

  if (error) throw error;
  return data ?? null;
}

/**
 * `true` si la cadena tiene forma de UUID.
 *
 * Sin esto, abrir `/pacientes/loquesea` manda "loquesea" a una columna `uuid` y
 * Postgres responde `22P02 invalid input syntax`, o sea un 500 en vez del 404
 * que corresponde. Pasa con cualquier enlace roto o URL vieja.
 */
export function pareceUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}
