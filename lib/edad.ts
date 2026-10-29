/**
 * Cálculo de edad a partir de la fecha de nacimiento.
 *
 * Vive aquí, y no en `lib/pdf/edad.ts`, porque desde la Fase 2 la edad se
 * muestra también en pantalla (listado de pacientes, ficha) y no solo impresa.
 * Lo que cambia entre un sitio y otro es el FORMATO —"34" en un campo de 10pt
 * de la plantilla, "34 años" en una tarjeta del listado—, nunca el cálculo. Con
 * dos copias del cálculo, el bug de `new Date(null)` que se corrigió una vez
 * podría volver por la puerta de atrás.
 *
 * `lib/pdf/edad.ts` sigue siendo el dueño de los formatos de la plantilla física
 * y reexporta lo que ya exportaba; nada de lo que consume el módulo de PDF
 * cambió de nombre ni de firma.
 */

/**
 * Devuelve `null` si no hay una fecha de nacimiento utilizable.
 *
 * Es la pieza que evita el bug que motivó todo esto: `new Date(null)` es la
 * época Unix (1970), así que un paciente migrado sin fecha aparecía con una
 * edad falsa pero perfectamente creíble (56 años) impresa en su historial,
 * sin nada que delatara el error. `new Date("")` daba "NaN". Ninguno de los
 * dos vuelve a ocurrir: sin fecha válida, no se calcula nada.
 */
export function parseFechaNacimiento(valor: string | Date | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;

  const texto = valor.trim();
  if (!texto) return null;

  // `YYYY-MM-DD` se arma a mano en vez de pasarlo por `new Date(texto)`, y no
  // es cosmético. El constructor lo interpreta como UTC medianoche, pero
  // `getFullYear()`/`getMonth()`/`getDate()` leen en hora LOCAL: en Ecuador
  // (UTC-5) "2008-08-22" se convierte en el 21 de agosto a las 19:00, o sea un
  // día antes, y el paciente sale un día más viejo de lo que es.
  //
  // Un día de más no se nota en el listado, pero SÍ decide si el formulario
  // exige acompañante (ADR-003): un paciente que cumple 18 mañana se veía
  // como de 18 recién cumplidos, el formulario no pedía acompañante y la fila
  // se estrellaba contra el CHECK `acompanante_obligatorio_si_menor` — que
  // usa `age()` de Postgres y no se equivoca. El error de base de datos
  // aparecía en la cara de la doctora, un día al año por paciente.
  //
  // El formato es exactamente el que devuelve Supabase para una columna
  // `date` y el que emite un `<input type="date">`. Cualquier otra cosa
  // (timestamps completos, con zona) sigue por el camino de siempre.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (iso) {
    const [, anio, mes, dia] = iso;
    const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
    // `new Date(2026, 1, 31)` no falla: rueda al 3 de marzo. Se compara con lo
    // pedido para que una fecha imposible se rechace en vez de mutar.
    const coincide =
      fecha.getFullYear() === Number(anio) &&
      fecha.getMonth() === Number(mes) - 1 &&
      fecha.getDate() === Number(dia);
    return coincide ? fecha : null;
  }

  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export interface EdadCalculada {
  anios: number;
  /** Edad total en meses. ADR-003 la usa para los menores de 1 año. */
  totalMeses: number;
}

export function calcularEdad(nacimiento: Date, fechaReferencia: string | Date): EdadCalculada {
  // La referencia pasa por el MISMO parser que el nacimiento, y no por
  // `new Date(texto)`. Aquí volvía a colarse el bug de huso horario que este
  // archivo documenta arriba, por el otro extremo: `consultas.fecha` es una
  // columna `date` y llega como "2026-08-22", que `new Date()` lee como
  // medianoche UTC; en Ecuador (UTC-5) eso es el 21 a las 19:00, así que
  // `getDate()` devolvía 21 y el historial imprimía un año de menos a todo
  // paciente cuyo cumpleaños cayera justo el día de la consulta.
  //
  // No es hipotético: `formatEdadHistorial(paciente.fechaNacimiento,
  // consulta.fecha)` —lo que llama `lib/pdf/historial.ts`— pasa por aquí con
  // una cadena. `lib/pdf/format.ts` ya había corregido lo mismo en las dos
  // fechas impresas; el cálculo de la edad se quedó fuera.
  const referencia =
    typeof fechaReferencia === "string"
      ? (parseFechaNacimiento(fechaReferencia) ?? new Date(fechaReferencia))
      : fechaReferencia;

  let anios = referencia.getFullYear() - nacimiento.getFullYear();
  let meses = referencia.getMonth() - nacimiento.getMonth();
  if (referencia.getDate() < nacimiento.getDate()) meses -= 1;
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }
  return { anios, totalMeses: anios * 12 + meses };
}

/**
 * `true` si el paciente tiene una fecha de nacimiento con la que se puede
 * calcular la edad. Pensado para que el formulario y la pantalla de consulta
 * puedan avisar antes de generar el PDF, sin repetir aquí la validación.
 */
export function tieneFechaNacimiento(
  fechaNacimiento: string | Date | null | undefined
): boolean {
  return parseFechaNacimiento(fechaNacimiento) !== null;
}

/**
 * Edad ya calculada, o `null` si no hay fecha de nacimiento (ADR-006).
 * El `null` es deliberado: obliga a quien la use a decidir qué mostrar cuando
 * el dato falta, en vez de recibir un `0` que se lee como "recién nacido".
 */
export function edadDe(
  fechaNacimiento: string | Date | null | undefined,
  fechaReferencia: string | Date
): EdadCalculada | null {
  const nacimiento = parseFechaNacimiento(fechaNacimiento);
  return nacimiento ? calcularEdad(nacimiento, fechaReferencia) : null;
}

/** ADR-003 fija la mayoría de edad en 18 años cumplidos. */
export const MAYORIA_DE_EDAD = 18;

/**
 * ADR-003: `true` si el paciente necesita acompañante con nombre y cédula.
 *
 * Devuelve `false` cuando no hay fecha de nacimiento, y eso es exactamente lo
 * que hace el CHECK `acompanante_obligatorio_si_menor` de la base: con
 * `fecha_nacimiento` NULL, `age()` es NULL, la comparación es NULL y un CHECK
 * solo falla si evalúa a FALSE. Los dos lados dicen lo mismo — la limitación
 * que ADR-006 acepta, no un descuido de este archivo.
 *
 * Que el sentido coincida importa más de lo que parece: si esta función fuera
 * más permisiva que el CHECK, el formulario dejaría guardar filas que la base
 * rechaza y la doctora vería el error crudo de Postgres.
 */
export function esMenorDeEdad(
  fechaNacimiento: string | Date | null | undefined,
  fechaReferencia: string | Date
): boolean {
  const edad = edadDe(fechaNacimiento, fechaReferencia);
  return edad !== null && edad.anios < MAYORIA_DE_EDAD;
}
