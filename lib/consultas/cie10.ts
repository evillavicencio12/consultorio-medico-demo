import type { SupabaseClient } from "@supabase/supabase-js";
import { construirTsquery, sinTildes } from "@/lib/busqueda-texto";
import type { Cie10CatalogoRow, Database } from "@/lib/supabase/tipos";

/**
 * Buscador del catálogo CIE-10 (RF-11) — la lógica, sin React y sin pantalla.
 *
 * Son cerca de 12.900 códigos, importados con scripts/import-cie10.mjs
 * (docs/integraciones/Catalogo-CIE10.md),
 * así que el filtrado ocurre ENTERO en Postgres: traer el catálogo al navegador
 * serían más de 1 MB por cada consulta abierta, y el índice GIN que ya existe
 * quedaría de adorno.
 *
 * Recibe el cliente en vez de crearlo, igual que `lib/pacientes/consulta.ts` y
 * `lib/consultas/consulta.ts`: así quien llama decide con cuál corre —hoy
 * `lib/supabase/server.ts`, con la sesión de la doctora y RLS aplicando— y este
 * archivo no puede acabar importando `admin.ts` por descuido. El catálogo es de
 * SOLO LECTURA incluso para la doctora: su política RLS es `for select`.
 */

/** Debajo de esto no se consulta: una letra devolvería medio catálogo. */
export const MINIMO_CARACTERES_CIE10 = 2;

/**
 * Cuántas sugerencias se muestran. Diez caben sin tapar el campo que hay
 * debajo, y una lista más larga no se lee: se afina la búsqueda.
 */
export const LIMITE_SUGERENCIAS = 10;

/**
 * Cuántas filas se traen para poder ordenarlas.
 *
 * Postgres devuelve las coincidencias en el orden en que las encuentra el
 * índice, que no es el útil: buscar "hipertension" trae primero *"Lectura
 * elevada de la presión sanguínea, sin diagnóstico de hipertensión"* y deja las
 * hipertensiones de verdad más abajo (comprobado contra la base real). Ordenar
 * por relevancia en Postgres exigiría `ts_rank` en el ORDER BY, y PostgREST no
 * sabe ordenar por una expresión calculada sin crear antes una vista o una
 * función — o sea, una migración para un problema de presentación.
 *
 * Así que se traen estas 60 —seis pantallas de sugerencias, unos pocos KB— y se
 * ordenan aquí con `ordenarSugerencias`. El total real se pide en la misma
 * consulta con `count`, para poder decir "10 de 43" en vez de fingir que no hay
 * más.
 */
export const LIMITE_CONSULTA_CIE10 = 60;

export type TipoBusquedaCie10 = "codigo" | "descripcion";

/**
 * Prepara lo tecleado para buscar contra `codigo`.
 *
 * **Los códigos están guardados SIN punto** (`J060`, no `J06.0`) — así los trae
 * el CSV de origen y así se importaron: comprobado contra la base real, ninguna
 * fila tiene punto (y el importador rechaza un ajuste que lo traiga). La doctora, en cambio, los conoce con punto,
 * porque con punto salen impresos en cualquier tabla del CIE-10. Sin esta
 * normalización, teclear "J06.0" no encuentra nada y el buscador parece roto
 * justo con la forma más natural de escribir un código.
 *
 * El guion SÍ se conserva: el catálogo tiene filas de rango (`C00-C14`).
 */
export function normalizarCodigoCie10(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/**
 * Decide contra qué columna se busca, mirando la forma de lo tecleado.
 *
 * "Letra seguida de dígito" es un código (`J06`, `E11.9`); cualquier otra cosa
 * es texto del diagnóstico. Se enruta por forma en vez de consultar las dos
 * columnas con un `or()`, por lo mismo que en el buscador de pacientes: dentro
 * de un `or()` de PostgREST los paréntesis son sintaxis de agrupación, y la
 * tsquery los usa.
 */
export function tipoDeBusquedaCie10(texto: string): TipoBusquedaCie10 {
  return /^[A-Z]\d/.test(normalizarCodigoCie10(texto)) ? "codigo" : "descripcion";
}

/**
 * Ordena las coincidencias por lo útil que es cada una para quien escribió eso.
 *
 * El criterio, en orden: primero las descripciones que EMPIEZAN por lo tecleado
 * ("Faringitis aguda" antes que "Laringofaringitis aguda"), después las que lo
 * traen al principio de alguna palabra, y a igualdad de todo la más corta —que
 * en el CIE-10 suele ser la categoría principal, mientras que las largas son
 * las variantes "…, no especificada" y "…debida a otros microorganismos". El
 * código desempata, para que dos tecleos iguales den el mismo orden.
 */
export function ordenarSugerencias(
  filas: Cie10CatalogoRow[],
  texto: string
): Cie10CatalogoRow[] {
  const buscado = sinTildes(texto.trim());

  const puntaje = (fila: Cie10CatalogoRow): number => {
    const descripcion = sinTildes(fila.descripcion);
    if (descripcion.startsWith(buscado)) return 0;
    if (descripcion.includes(" " + buscado)) return 1;
    return 2;
  };

  return [...filas].sort((a, b) => {
    const diferencia = puntaje(a) - puntaje(b);
    if (diferencia !== 0) return diferencia;
    if (a.descripcion.length !== b.descripcion.length) {
      return a.descripcion.length - b.descripcion.length;
    }
    return a.codigo.localeCompare(b.codigo);
  });
}

export interface ResultadoCie10 {
  /** Ya ordenadas y recortadas a `LIMITE_SUGERENCIAS`. */
  sugerencias: Cie10CatalogoRow[];
  /** Cuántas coinciden en la base, aunque solo se muestren diez. */
  total: number;
  tipo: TipoBusquedaCie10;
  /** Si la búsqueda no se hizo (sesión caducada): el texto que ve la doctora. */
  mensaje?: string;
}

const VACIO: ResultadoCie10 = { sugerencias: [], total: 0, tipo: "descripcion" };

/**
 * Busca en el catálogo. Con un texto demasiado corto devuelve vacío en vez de
 * lanzar: teclear despacio no es un error.
 */
export async function buscarCie10(
  supabase: SupabaseClient<Database>,
  texto: string
): Promise<ResultadoCie10> {
  const limpio = texto.trim();
  if (limpio.length < MINIMO_CARACTERES_CIE10) return VACIO;

  const tipo = tipoDeBusquedaCie10(limpio);
  let consulta = supabase.from("cie10_catalogo").select("*", { count: "exact" });

  if (tipo === "codigo") {
    // Prefijo, no `%…%`: un código se teclea de izquierda a derecha ("J0",
    // "J06", "J069") y el prefijo es lo único que puede resolverse con la clave
    // primaria en vez de recorriendo las cerca de 12.900 filas. `like` y no `ilike`
    // porque el texto ya viene en mayúsculas y los códigos están guardados así.
    consulta = consulta.like("codigo", normalizarCodigoCie10(limpio) + "%").order("codigo");
  } else {
    const tsquery = construirTsquery(limpio);
    // Solo es `null` si no quedó ni una letra ni un dígito.
    if (!tsquery) return { ...VACIO, tipo };
    // Sin `type`, supabase-js emite `fts`, o sea `to_tsquery` — la única
    // variante que acepta el `:*` de prefijo. `config: "spanish"` no es
    // opcional: `idx_cie10_descripcion` está creado sobre
    // `to_tsvector('spanish', descripcion)` y con otra configuración Postgres
    // no reconoce la expresión y descarta el índice.
    consulta = consulta.textSearch("descripcion", tsquery, { config: "spanish" });
  }

  const { data, count, error } = await consulta.limit(LIMITE_CONSULTA_CIE10);
  if (error) throw error;

  const filas = (data ?? []) as Cie10CatalogoRow[];
  return {
    // La búsqueda por código ya viene ordenada por Postgres, y ese orden es el
    // bueno: es el del propio catálogo.
    sugerencias:
      tipo === "codigo"
        ? filas.slice(0, LIMITE_SUGERENCIAS)
        : ordenarSugerencias(filas, limpio).slice(0, LIMITE_SUGERENCIAS),
    total: count ?? filas.length,
    tipo,
  };
}

/**
 * Trae UN código concreto, para poder mostrar su descripción cuando el
 * formulario se abre con un código ya elegido. Sin esto, una consulta que se
 * reabre volvería a la pantalla con el código suelto y sin decir qué significa,
 * que es justo lo que RF-11 pide evitar.
 */
export async function obtenerCie10(
  supabase: SupabaseClient<Database>,
  codigo: string
): Promise<Cie10CatalogoRow | null> {
  const { data, error } = await supabase
    .from("cie10_catalogo")
    .select("*")
    .eq("codigo", normalizarCodigoCie10(codigo))
    .maybeSingle<Cie10CatalogoRow>();

  if (error) throw error;
  return data ?? null;
}
