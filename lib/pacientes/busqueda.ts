/**
 * Traducción del texto que teclea la doctora a un filtro que Postgres pueda
 * resolver **con índice** (RF-06, RNF-09).
 *
 * Sin dependencias de React ni de Supabase a propósito: es lógica pura, la
 * cubre `tests/pacientes.test.ts` y la usan tanto el Server Component
 * del listado como cualquier cliente futuro.
 *
 * La construcción de la `tsquery` se mudó a `lib/busqueda-texto.ts` en la Fase
 * 4: el buscador de CIE-10 necesita exactamente la misma —prefijo mientras se
 * escribe y expansión de la eñe— sobre otro índice GIN. Se reexporta aquí para
 * que los llamadores de siempre no cambien de import.
 */
export { construirTsquery } from "@/lib/busqueda-texto";

/** Nombres de los parámetros de URL. Un solo sitio donde escribirlos. */
export const PARAM_BUSQUEDA = "q";
export const PARAM_ORDEN = "orden";
export const PARAM_INCOMPLETAS = "incompletas";
/**
 * Para qué se está eligiendo un paciente. Sin él, el listado abre la ficha;
 * con `para=consulta`, cada fila abre directamente la consulta nueva de ese
 * paciente.
 *
 * Es lo que hace que el ítem "Nueva Consulta" del rail lleve a algún sitio
 * ahora que el formulario de consulta cuelga de un paciente. La alternativa
 * —una pantalla propia que solo pregunte "¿qué paciente?"— es la que
 * docs/modulos/03-Historial-Clinico.md ya descartó dos veces: sería una segunda
 * puerta a la misma sala, peor equipada. Esta es la misma puerta, con el
 * destino cambiado.
 */
export const PARAM_PARA = "para";
export const PARA_CONSULTA = "consulta";

export type Orden = "recientes" | "alfabetico";
export const ORDEN_POR_DEFECTO: Orden = "recientes";

/**
 * Tope de filas que se traen de la base. Hoy hay 164 pacientes, así que nunca
 * se alcanza; existe para que el día que la tabla crezca la pantalla avise
 * ("mostrando N de M") en vez de recortar en silencio, que es el modo en que
 * este tipo de bug pasa desapercibido durante meses.
 */
export const LIMITE_FILAS = 300;

/** Debajo de esto no se consulta: una sola letra devolvería medio listado. */
export const MINIMO_CARACTERES = 2;

export type TipoBusqueda = "documento" | "nombre";

/**
 * Decide contra qué columna se busca, mirando lo que se escribió.
 *
 * Se enruta por forma en vez de consultar las dos columnas con un `or()`, y no
 * es capricho: dentro de un `or()` de PostgREST los paréntesis son sintaxis de
 * agrupación, y la tsquery que arma `construirTsquery` los usa. Mezclarlas
 * obligaría a escapar una gramática dentro de otra.
 *
 * **La regla es "trae un dígito → es un documento".** Antes se leía como
 * "nadie escribe una cédula con letras", que dejó de ser cierto en cuanto
 * entraron los pasaportes: `AB123456` lleva letras y sigue siendo un documento.
 * Por eso ahora la señal es el dígito y no la ausencia de letras — y por eso
 * `normalizarBusquedaDocumento` conserva las letras en vez de borrarlas.
 *
 * Que esto importe no es teórico. Si el buscador no encontrara los pasaportes
 * por su número, cada paciente extranjero sería imposible de hallar y se
 * registraría de nuevo en cada visita: un duplicado garantizado, no ya por un
 * error de tecleo sino siempre. Es la protección que sustituye al dígito
 * verificador en los documentos que no se pueden verificar (ADR-008).
 *
 * **Limitación conocida:** un documento compuesto solo por letras se enruta a
 * la búsqueda por nombre y no se encuentra por número. Prácticamente todos los
 * pasaportes llevan dígitos, y la alternativa —tratar como documento cualquier
 * palabra suelta— rompería la búsqueda por apellido, que es la que se usa
 * cien veces más. Al paciente se le sigue encontrando por su nombre.
 */
export function tipoDeBusqueda(texto: string): TipoBusqueda {
  return /\d/.test(texto) ? "documento" : "nombre";
}

/**
 * Prepara lo tecleado para buscar contra `documento`.
 *
 * Mayúsculas y solo letras y dígitos: es la MISMA normalización con la que
 * `lib/pacientes/documento.ts` guarda el valor, y tiene que serlo. Si al
 * guardar se quitan los guiones y al buscar no, `AB-123456` no encontraría a
 * `AB123456`, que es el paciente que se acaba de registrar.
 *
 * Para una cédula el resultado es idéntico al de antes —solo dígitos—, porque
 * una cédula no tiene letras que conservar. La doctora puede seguir tecleando
 * "1712-345-678" o pegándola.
 */
export function normalizarBusquedaDocumento(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Lee y valida los parámetros de URL del listado. */
export function leerParametros(params: Record<string, string | string[] | undefined>) {
  const crudo = params[PARAM_BUSQUEDA];
  const busqueda = (typeof crudo === "string" ? crudo : "").trim();

  const orden: Orden = params[PARAM_ORDEN] === "alfabetico" ? "alfabetico" : ORDEN_POR_DEFECTO;

  return {
    busqueda,
    /** `busqueda` es lo que se ve en el input; esto es lo que se consulta. */
    busquedaEfectiva: busqueda.length >= MINIMO_CARACTERES ? busqueda : "",
    orden,
    soloIncompletas: params[PARAM_INCOMPLETAS] === "1",
    /** `true` cuando se llegó buscando a quién abrirle una consulta nueva. */
    paraConsulta: params[PARAM_PARA] === PARA_CONSULTA,
  };
}
