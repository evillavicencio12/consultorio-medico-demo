import type { PDFFont } from "pdf-lib";
import { cabeEnElEspacio } from "./text";

/**
 * Límites de contenido del PDF de historial — ver ADR-007-espacio-historial.md.
 * Mismo contrato que lib/pdf/receta-limits.ts: el formulario importa estas
 * constantes para el contador de caracteres y llama a las funciones de ajuste
 * para bloquear el guardado, de modo que la doctora se entere ANTES de guardar
 * y no al ver el PDF.
 *
 * Todas las medidas salen de scripts/medir-lineas-plantilla.mjs sobre
 * historial-plantilla.pdf, no de estimaciones.
 */

/** El historial usa 9.5pt, no los 7.5pt de la receta: tiene una hoja entera y
 * sus etiquetas impresas son de 11pt. No se reduce por debajo de esto. */
export const HISTORIAL_FONT_SIZE = 9.5;
/** 13pt entre bases. No sigue los 19.1pt de los renglones impresos de arriba
 * porque estas líneas extra no tienen raya debajo, y a 19.1 la segunda línea
 * de "Impresión Diagnóstica" chocaría con la etiqueta "7. Tratamiento". */
export const HISTORIAL_LINE_HEIGHT = 13;

// --- "6. Impresión Diagnóstica" ---
// Raya impresa en y=127.8, de x=71.8 a x=423.7. El texto arranca en x=76.
export const IMPRESION_DIAGNOSTICA_MAX_WIDTH = 345; // pt
/**
 * DOS renglones. Debajo está la etiqueta "7. Tratamiento" (base y=101.3, con
 * ascendentes hasta ~109.2) y a su izquierda ocupa de x=54 a x=134: una
 * tercera línea en y=105 se le montaría encima. La segunda línea cae en y=118,
 * con ~6.8pt de aire por debajo.
 */
export const IMPRESION_DIAGNOSTICA_MAX_LINEAS = 2;
/** Techo medido: 150 caracteres con prosa clínica típica, 144 con palabras
 * largas. 145 deja margen. Quien decide es `impresionDiagnosticaCabeEnHistorial()`. */
export const IMPRESION_DIAGNOSTICA_MAX_CHARS = 145;

// --- "7. Tratamiento" ---
// Raya impresa en y=73.5, de x=53.8 a x=405.7. El texto arranca en x=58.
export const TRATAMIENTO_MAX_WIDTH = 345; // pt
/**
 * TRES renglones. Es el último bloque de la hoja: bajo la raya impresa no hay
 * nada más — ni pie de página ni texto — hasta el borde inferior (verificado
 * con medir-lineas-plantilla.mjs y extract-text-positions.mjs). Las tres bases
 * caen en 77, 64 y 51, dejando ~49pt de margen inferior.
 */
export const TRATAMIENTO_MAX_LINEAS = 3;
/** Techo medido: 220 caracteres típicos, 215 con palabras largas. */
export const TRATAMIENTO_MAX_CHARS = 215;

/* -------------------------------------------------------------------------- */
/* Campos que hasta la Fase 4B no tenían límite — y sí lo tenían               */
/* -------------------------------------------------------------------------- */
/**
 * No existe un campo "sin límite" en una hoja de tamaño fijo cuyas secciones se
 * suceden una tras otra. "Padecimiento Actual" y "Antecedentes Heredo
 * Familiares" se dibujaban con `drawWrapped`, que escribe tantas líneas como
 * hagan falta, y al llegar a la cuarta se montaban sobre el título de la
 * sección siguiente. Medido con extract-text-positions.mjs sobre la plantilla
 * real, no estimado.
 */

// --- "5. Padecimiento Actual" (motivo de consulta) ---
// Tres rayas impresas: y=221.1, 202.0 y 182.8, de x=36 a x=554.8. El texto
// arranca en x=40, con bases en 223, 203.9 y 184.8 — cada una justo encima de
// su raya.
export const MOTIVO_MAX_WIDTH = 505; // pt
export const MOTIVO_LINE_HEIGHT = 19.1; // el paso entre las rayas impresas
/**
 * TRES renglones, los que la plantilla imprime.
 *
 * Una cuarta línea caería en y=165.7 y debajo está "6. Impresión Diagnóstica"
 * (base y=155.7, ascendentes hasta ~163.6): quedarían **2,1pt**, menos que las
 * descendentes de una línea de 9.5pt. Además flotaría sin raya debajo, o sea
 * fuera del renglón impreso. Es el mismo razonamiento con el que se fijó en 2
 * "Impresión Diagnóstica".
 */
export const MOTIVO_MAX_LINEAS = 3;
/** Techo medido con calibrar-limites-pdf.mjs: 330 típico, 319 con palabras largas. */
export const MOTIVO_MAX_CHARS = 325;

// --- "2. Antecedentes Heredo Familiares" ---
// Tres rayas impresas: y=523.0, 503.9 y 484.7, de x=54 a x=555.5. El texto
// arranca en x=58, con bases en 525, 505.9 y 486.8.
export const HEREDOFAMILIARES_MAX_WIDTH = 490; // pt
export const HEREDOFAMILIARES_LINE_HEIGHT = 19.1;
/**
 * TRES. La cuarta caería en y=467.7 y debajo está "3. Antecedentes Personales
 * Patológicos" (base 457.6, ascendentes a ~465.5): 2,2pt de aire.
 */
export const HEREDOFAMILIARES_MAX_LINEAS = 3;
/** Techo medido: 320 típico, 300 con palabras largas. */
export const HEREDOFAMILIARES_MAX_CHARS = 315;

// --- "3. Antecedentes Personales Patológicos" ---
/**
 * Los cuatro renglones de antecedentes van uno debajo de otro, separados 27,2pt
 * (430.4, 403.2, 376.1, 348.9). Cada uno puede ocupar DOS líneas —la segunda
 * cae 13pt más abajo y aún deja ~6pt sobre la etiqueta siguiente— pero no tres:
 * la tercera se montaría sobre el renglón de abajo.
 *
 * El ancho de cada uno es distinto porque su etiqueta impresa lo es
 * ("Alergias:" es más corta que "Transfusionales:").
 */
export const ANTECEDENTE_MAX_LINEAS = 2;
export const ANTECEDENTE_FONT_SIZE = 10;
export const ANTECEDENTE_LINE_HEIGHT = 13;

export const ANTECEDENTES_PATOLOGICOS = {
  alergias: { maxWidth: 420, maxChars: 170 },
  patologias: { maxWidth: 400, maxChars: 155 },
  quirurgicos: { maxWidth: 395, maxChars: 155 },
  transfusionales: { maxWidth: 380, maxChars: 150 },
} as const;

export type CampoAntecedente = keyof typeof ANTECEDENTES_PATOLOGICOS;

export function motivoCabeEnHistorial(texto: string | null | undefined, font: PDFFont): boolean {
  return cabeEnElEspacio(texto, font, HISTORIAL_FONT_SIZE, MOTIVO_MAX_WIDTH, MOTIVO_MAX_LINEAS);
}

export function heredoFamiliaresCabenEnHistorial(
  texto: string | null | undefined,
  font: PDFFont
): boolean {
  return cabeEnElEspacio(
    texto,
    font,
    HISTORIAL_FONT_SIZE,
    HEREDOFAMILIARES_MAX_WIDTH,
    HEREDOFAMILIARES_MAX_LINEAS
  );
}

export function antecedenteCabeEnHistorial(
  campo: CampoAntecedente,
  texto: string | null | undefined,
  font: PDFFont
): boolean {
  return cabeEnElEspacio(
    texto,
    font,
    ANTECEDENTE_FONT_SIZE,
    ANTECEDENTES_PATOLOGICOS[campo].maxWidth,
    ANTECEDENTE_MAX_LINEAS
  );
}

/**
 * El código CIE-10 se imprime pegado a la impresión diagnóstica, así que el
 * texto que hay que medir es el compuesto, no solo lo que escribió la doctora.
 * El formulario debe validar con esta misma función para no quedarse corto.
 */
export function textoImpresionDiagnostica(
  impresionDiagnostica: string | null | undefined,
  codigoCie10: string | null | undefined
): string | null {
  if (!impresionDiagnostica) return null;
  return codigoCie10 ? `${impresionDiagnostica} (CIE-10: ${codigoCie10})` : impresionDiagnostica;
}

export function impresionDiagnosticaCabeEnHistorial(
  impresionDiagnostica: string | null | undefined,
  codigoCie10: string | null | undefined,
  font: PDFFont
): boolean {
  return cabeEnElEspacio(
    textoImpresionDiagnostica(impresionDiagnostica, codigoCie10),
    font,
    HISTORIAL_FONT_SIZE,
    IMPRESION_DIAGNOSTICA_MAX_WIDTH,
    IMPRESION_DIAGNOSTICA_MAX_LINEAS
  );
}

export function tratamientoCabeEnHistorial(texto: string | null | undefined, font: PDFFont): boolean {
  return cabeEnElEspacio(
    texto,
    font,
    HISTORIAL_FONT_SIZE,
    TRATAMIENTO_MAX_WIDTH,
    TRATAMIENTO_MAX_LINEAS
  );
}
