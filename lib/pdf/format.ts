/**
 * Marcador para un dato que la base no tiene (ADR-006: cédula, fecha de
 * nacimiento y sexo quedaron opcionales por la importación histórica).
 *
 * Se usa en los campos de la plantilla que son apenas un guion bajo entre dos
 * etiquetas — "Edad:" y "Sexo:" del historial rondan los 10pt de ancho útil,
 * donde no cabe ninguna palabra. La raya deja claro que el campo se revisó y
 * el dato no está, que es distinto de un campo en blanco por descuido, y evita
 * el "NaN"/edad falsa que se imprimía antes.
 */
export const SIN_DATO_COMPACTO = "—";

import { parseFecha } from "@/lib/fechas";

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * `dd/mm/aaaa`, el formato de los dos campos de fecha del historial impreso.
 *
 * > **Dos cosas que aquí estaban mal y se corrigieron en la Fase 3**, al ver
 * > por primera vez un PDF generado con una consulta real:
 * >
 * > 1. `new Date("2026-08-21")` es medianoche **UTC**, y `getDate()` lee en
 * >    hora local: en Ecuador (UTC-5) la fecha retrocedía al día 20. La receta
 * >    salía impresa con la fecha del día anterior — y una receta es un
 * >    documento legal que ejecuta un farmacéutico. Es el mismo bug que ya se
 * >    había corregido en `lib/edad.ts`; este módulo construía su propia fecha
 * >    y se quedó fuera.
 * > 2. `toLocaleDateString("es-EC", …)` depende de los locales instalados en
 * >    el entorno donde corra. Da igual que hoy funcione en Chrome: el formato
 * >    de un documento impreso no puede depender de eso.
 *
 * `parseFecha` lee `YYYY-MM-DD` como fecha local, y el formato se arma a mano.
 * Un valor que no se pueda leer devuelve cadena vacía en lugar de "Invalid
 * Date" impreso sobre la plantilla.
 */
export function formatFecha(value: string | Date): string {
  const date = parseFecha(value);
  if (!date) return "";
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${date.getFullYear()}`;
}

/**
 * La receta trae impreso "Fecha: ___ de ___ del 20___": el año solo recibe
 * los 2 últimos dígitos (ej. "26" para 2026), nunca el año completo.
 *
 * Mismo arreglo de huso horario que `formatFecha` — ver su nota.
 */
export function formatFechaPartes(value: string | Date): { dia: string; mes: string; anio2: string } {
  const date = parseFecha(value);
  if (!date) return { dia: "", mes: "", anio2: "" };
  return {
    dia: String(date.getDate()),
    mes: MESES_ES[date.getMonth()],
    anio2: String(date.getFullYear()).slice(-2),
  };
}

/**
 * Unidades de los signos vitales, tal como deben salir IMPRESAS.
 *
 * La doctora pidió ver la unidad en el papel ("65 kg", no "65"). El dato se
 * sigue guardando como número puro en la base (`numeric`) y en `ExploracionFisica`
 * — la unidad es presentación, no dato, y mezclarlas fue justo el error que se
 * corrigió al cerrar las divergencias con el esquema: `peso: "65 kg"` era un
 * valor que la base rechazaba.
 *
 * `pa` no está aquí: es texto ("120/80") y su unidad (mmHg) se omite por
 * convención en la hoja de historial.
 *
 * Abreviaturas de uso clínico habitual en español:
 *   lpm = latidos por minuto | rpm = respiraciones por minuto
 *
 * Todas caben en el espacio medido de esa fila, que es estrecha: el peor caso
 * ("135.5 kg" a 9pt) mide 34.5pt contra los 40pt disponibles.
 */
export const UNIDAD_VITAL = {
  fc: "lpm",
  fr: "rpm",
  temperatura: "°C",
  peso: "kg",
} as const;

/**
 * Pega la unidad al valor para imprimirlo. Devuelve `null` si no hay dato, para
 * que el campo salga en blanco en vez de imprimir una unidad suelta ("kg").
 */
export function formatVital(
  valor: number | null | undefined,
  unidad: string
): string | null {
  if (valor === null || valor === undefined) return null;
  return `${valor} ${unidad}`;
}
