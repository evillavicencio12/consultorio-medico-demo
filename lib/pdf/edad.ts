import { calcularEdad, parseFechaNacimiento } from "@/lib/edad";
import { SIN_DATO_COMPACTO } from "./format";

/**
 * Formatos de edad **para la plantilla física**. El cálculo en sí no está aquí:
 * vive en `lib/edad.ts` desde que la Fase 2 lo necesitó también en pantalla.
 * Este archivo solo decide cómo se escribe la edad dentro de campos impresos de
 * ancho fijo.
 */

/** Se reexporta para no romper los imports que ya apuntaban a este módulo. */
export { tieneFechaNacimiento } from "@/lib/edad";

/**
 * Marcador de "sin fecha de nacimiento" para el campo "Edad:" de la RECETA.
 * Ahí sí cabe texto: la etiqueta impresa termina en x=35.3 y el siguiente
 * campo ("Meses:") empieza en x=162.2, o sea ~122pt libres — de sobra para
 * estas 13 letras (~42pt a 7pt). Medido con scripts/extract-text-positions.mjs.
 */
export const EDAD_NO_REGISTRADA_RECETA = "No registrada";

/**
 * En el HISTORIAL el mismo dato no entra ni de lejos: "Edad: _" termina en
 * x=91.0 y "Sexo:_" arranca en x=97.7 — quedan ~10pt, dos dígitos a 8pt (por
 * eso la edad se imprime "34" y no "34 años"). Contra lo que podría suponerse,
 * en este campo la receta tiene MÁS espacio que el historial, no menos: la
 * receta trae un renglón largo y el historial un solo guion bajo espachurrado
 * entre dos etiquetas. Así que aquí se usa la raya, que es exactamente lo que
 * 06-Generador-PDF.md admitía ("dejar en blanco o '—', nunca texto roto").
 */
export const EDAD_NO_REGISTRADA_HISTORIAL = SIN_DATO_COMPACTO;

/**
 * ADR-003: menor de 1 año → la edad se muestra en meses en vez de años.
 * Formato compacto ("34" / "8m"): el campo "Edad" de la plantilla física es
 * un solo guion bajo — no hay espacio para "34 años" sin invadir "Sexo:".
 * Sin fecha de nacimiento (ADR-006) devuelve la raya, no una edad inventada.
 */
export function formatEdadHistorial(
  fechaNacimiento: string | null | undefined,
  fechaReferencia: string | Date
): string {
  const nacimiento = parseFechaNacimiento(fechaNacimiento);
  if (!nacimiento) return EDAD_NO_REGISTRADA_HISTORIAL;

  const { anios, totalMeses } = calcularEdad(nacimiento, fechaReferencia);
  return anios < 1 ? `${totalMeses}m` : `${anios}`;
}

/**
 * La receta tiene dos campos separados ("Edad:" y "Meses:"). Se llena uno u
 * otro según la misma regla de ADR-003, nunca ambos a la vez.
 *
 * Sin fecha de nacimiento se escribe "No registrada" en "Edad" y "Meses"
 * queda vacío — un solo mensaje, no la misma advertencia dos veces.
 */
export function formatEdadReceta(
  fechaNacimiento: string | null | undefined,
  fechaReferencia: string | Date
): { edad: string; meses: string } {
  const nacimiento = parseFechaNacimiento(fechaNacimiento);
  if (!nacimiento) return { edad: EDAD_NO_REGISTRADA_RECETA, meses: "" };

  const { anios, totalMeses } = calcularEdad(nacimiento, fechaReferencia);
  return anios < 1 ? { edad: "", meses: String(totalMeses) } : { edad: String(anios), meses: "" };
}
