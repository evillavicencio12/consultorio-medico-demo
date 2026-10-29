import type { SupabaseClient } from "@supabase/supabase-js";
import { sinTildes } from "@/lib/busqueda-texto";
import type { Database, MedicamentoCatalogoRow } from "@/lib/supabase/tipos";

/**
 * Buscador del catálogo de medicamentos (RF-14) — la lógica, sin React.
 *
 * Busca por nombre genérico o comercial a la vez: la doctora teclea lo que
 * recuerde del medicamento, no elige antes cuál de los dos nombres está
 * escribiendo (05-Prescripcion-Receta.md).
 *
 * ## Por qué el filtrado NO lo hace Postgres aquí
 *
 * Es la decisión contraria a la del buscador de CIE-10, y la diferencia es el
 * tamaño: el catálogo CIE-10 tiene cerca de 12.900 filas y el de medicamentos **162**
 * (docs/integraciones/Contrato-Sheet-Medicamentos.md).
 *
 * Existe `idx_medicamentos_nombre`, un GIN sobre
 * `to_tsvector('spanish', nombre_generico || ' ' || nombre_comercial)`. Para que
 * Postgres lo use, el filtro tiene que escribirse contra esa **expresión
 * concatenada**, y PostgREST solo sabe filtrar contra una columna: haría falta
 * una función RPC —o sea, otra migración— para emitir esa consulta. La
 * alternativa sin migración era un `or()` de dos `fts`, que además choca con
 * los paréntesis que la tsquery usa para las variantes de la eñe (el mismo
 * problema que documenta `lib/pacientes/busqueda.ts`).
 *
 * Con 162 filas, traer el catálogo **al servidor** y filtrar en JavaScript
 * cuesta menos que esa migración y da algo que Postgres no daría sin la
 * extensión `unaccent`: coincidencia **sin tildes**, para que "sodico"
 * encuentre "Diclofenaco Sódico". El navegador no recibe el catálogo: recibe
 * las diez sugerencias que va a pintar.
 *
 * **Cuándo dejaría de valer:** si el catálogo pasa de unos pocos miles de
 * filas. Ahí toca la función RPC y el índice GIN, y este comentario es el aviso
 * de que la decisión fue por tamaño, no por descuido.
 */

/** Debajo de esto no se consulta: una letra devolvería medio catálogo. */
export const MINIMO_CARACTERES_MEDICAMENTO = 2;

/** Cuántas sugerencias se muestran; el resto se afina escribiendo más. */
export const LIMITE_SUGERENCIAS_MEDICAMENTO = 10;

export interface ResultadoMedicamentos {
  /** Ya ordenadas y recortadas a `LIMITE_SUGERENCIAS_MEDICAMENTO`. */
  sugerencias: MedicamentoCatalogoRow[];
  /** Cuántas coinciden en total, aunque solo se muestren diez. */
  total: number;
  /** Si la búsqueda no se hizo (sesión caducada): el texto que ve la doctora. */
  mensaje?: string;
}

const VACIO: ResultadoMedicamentos = { sugerencias: [], total: 0 };

/**
 * Ordena por lo útil que es cada coincidencia para quien escribió eso.
 *
 * Primero lo que EMPIEZA por lo tecleado (en el comercial o en el genérico),
 * después lo que lo trae al principio de una palabra, y a igualdad el nombre
 * comercial más corto —que suele ser la presentación base y no la variante
 * larga—. El id desempata para que dos tecleos iguales den el mismo orden.
 */
export function ordenarMedicamentos(
  filas: MedicamentoCatalogoRow[],
  texto: string
): MedicamentoCatalogoRow[] {
  const buscado = sinTildes(texto.trim());

  const puntaje = (fila: MedicamentoCatalogoRow): number => {
    const comercial = sinTildes(fila.nombre_comercial);
    const generico = sinTildes(fila.nombre_generico);
    if (comercial.startsWith(buscado) || generico.startsWith(buscado)) return 0;
    if (comercial.includes(" " + buscado) || generico.includes(" " + buscado)) return 1;
    return 2;
  };

  return [...filas].sort((a, b) => {
    const diferencia = puntaje(a) - puntaje(b);
    if (diferencia !== 0) return diferencia;
    if (a.nombre_comercial.length !== b.nombre_comercial.length) {
      return a.nombre_comercial.length - b.nombre_comercial.length;
    }
    return a.id.localeCompare(b.id);
  });
}

/** `true` si la fila contiene lo tecleado en cualquiera de sus dos nombres. */
export function coincide(fila: MedicamentoCatalogoRow, texto: string): boolean {
  const buscado = sinTildes(texto.trim());
  if (!buscado) return false;
  return (
    sinTildes(fila.nombre_comercial).includes(buscado) ||
    sinTildes(fila.nombre_generico).includes(buscado)
  );
}

/**
 * Busca en el catálogo. Con un texto demasiado corto devuelve vacío en vez de
 * lanzar: teclear despacio no es un error.
 */
export async function buscarMedicamentos(
  supabase: SupabaseClient<Database>,
  texto: string
): Promise<ResultadoMedicamentos> {
  const limpio = texto.trim();
  if (limpio.length < MINIMO_CARACTERES_MEDICAMENTO) return VACIO;

  const { data, error } = await supabase
    .from("medicamentos_catalogo")
    .select("*")
    .order("nombre_comercial");

  if (error) throw error;

  const coincidencias = ((data ?? []) as MedicamentoCatalogoRow[]).filter((fila) =>
    coincide(fila, limpio)
  );

  return {
    sugerencias: ordenarMedicamentos(coincidencias, limpio).slice(
      0,
      LIMITE_SUGERENCIAS_MEDICAMENTO
    ),
    total: coincidencias.length,
  };
}
