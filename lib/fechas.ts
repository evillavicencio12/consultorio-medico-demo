/**
 * Cómo se escribe una fecha en PANTALLA.
 *
 * Vive aquí, y no dentro de `lib/pacientes/formato.ts`, por el mismo motivo por
 * el que `lib/edad.ts` salió de `lib/pdf/edad.ts`: desde la Fase 3 las fechas se
 * muestran también en la línea de tiempo de consultas, y la alternativa era
 * duplicar los nombres de los meses en dos módulos.
 *
 * **Nunca se usa `toLocaleDateString`.** Su resultado depende de los locales
 * instalados en el entorno donde corra —en un servidor pelado puede salir en
 * inglés— y estas pantallas se leen en español siempre.
 */

import { parseFechaNacimiento } from "./edad";

/**
 * El mismo parser que usa el cálculo de edad, con un nombre que no habla de
 * nacimientos: lo necesitan también las fechas de consulta.
 *
 * Lee `YYYY-MM-DD` como fecha LOCAL y no como medianoche UTC. Es lo único que
 * separa "21 de agosto" de "20 de agosto" en un huso al oeste de Greenwich —
 * ver la advertencia de docs/modulos/02-Gestion-Pacientes.md.
 */
export { parseFechaNacimiento as parseFecha };

/**
 * La zona del consultorio. "Hoy" es SIEMPRE el día de aquí, nunca el de la
 * zona del proceso: en esta máquina coinciden, pero en Vercel el proceso corre
 * en UTC, y de 19:00 a medianoche de Ecuador UTC ya es mañana. Con `new Date()`
 * leído en hora local, la consulta se fechaba mañana, la receta salía con la
 * fecha de mañana y un menor que cumple 18 mañana pasaba por adulto.
 * Ver docs/arquitectura/Trampas-Recurrentes.md.
 */
const ZONA_CONSULTORIO = "America/Guayaquil";

const DIA_EN_ECUADOR = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_CONSULTORIO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Hoy en Ecuador, `YYYY-MM-DD`: el valor de un `<input type="date">`, el de una
 * columna `date` y el `hoyISO` que las páginas pasan a los formularios.
 *
 * `ahora` es el instante; por defecto, el actual. Se inyecta en las pruebas
 * para fijar el reloj (`npm run test:hoy`).
 */
export function hoyISOEnEcuador(ahora: Date = new Date()): string {
  // formatToParts y no `format`: el orden y los separadores de `format`
  // dependen del locale; las partes, no.
  const partes = Object.fromEntries(
    DIA_EN_ECUADOR.formatToParts(ahora).map((p) => [p.type, p.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

/**
 * Hoy en Ecuador como `Date` a la medianoche LOCAL de ese día — la misma forma
 * que devuelve `parseFecha` para una columna `date`. Así `calcularEdad`,
 * `comoValorDeInput` y los formatos del PDF, que leen `getFullYear()` /
 * `getMonth()` / `getDate()`, dan el día de Ecuador en cualquier zona de
 * proceso.
 */
export function hoyEnEcuador(ahora: Date = new Date()): Date {
  // El mismo parser que una columna `date`: una sola conversión de
  // `YYYY-MM-DD` a Date en todo el proyecto. Nunca es null: la entrada la
  // armó `hoyISOEnEcuador` y siempre es una fecha válida.
  return parseFechaNacimiento(hoyISOEnEcuador(ahora))!;
}

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** Tres letras, para la fecha compacta de la línea de tiempo. */
const MESES_CORTOS = MESES.map((m) => m.slice(0, 3));

/**
 * "8 de junio de 2014".
 *
 * El mes va en letras y no en número a propósito: `08/06/2014` es ambiguo entre
 * día/mes y mes/día, y esta base ya tiene una fecha de nacimiento que llegó mal
 * tecleada desde el Sheet. Con el mes
 * escrito, un año o un mes disparatado salta a la vista al leerlo.
 */
export function formatFechaLarga(valor: string | null | undefined): string | null {
  const fecha = parseFechaNacimiento(valor);
  if (!fecha) return null;
  return `${fecha.getDate()} de ${MESES[fecha.getMonth()]} de ${fecha.getFullYear()}`;
}

/**
 * "8 jun 2014" — la fecha de la línea de tiempo.
 *
 * Compacta porque va en IBM Plex Mono (Sistema-de-Diseno.md fija la mono para
 * las fechas de la línea de tiempo) y una fecha larga en mono ocuparía media
 * fila. Pero el mes sigue en letras: la mono invita a escribir `08/06/2014`, y
 * esa es exactamente la forma ambigua que el párrafo de arriba descarta.
 *
 * El día va con relleno de espacio y no de cero (` 8 jun 2014`) para que las
 * fechas de la columna queden alineadas sin fingir una precisión de dos
 * dígitos que el día no tiene.
 */
export function formatFechaCorta(valor: string | null | undefined): string | null {
  const fecha = parseFechaNacimiento(valor);
  if (!fecha) return null;
  const dia = String(fecha.getDate()).padStart(2, " "); // espacio de cifra
  return `${dia} ${MESES_CORTOS[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

/** El año, para agrupar la línea de tiempo. `null` si la fecha no sirve. */
export function anioDe(valor: string | null | undefined): number | null {
  return parseFechaNacimiento(valor)?.getFullYear() ?? null;
}
