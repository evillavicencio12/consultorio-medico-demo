import type { PDFFont } from "pdf-lib";
import { etiquetaViaAdministracion } from "./vocabulario";
import { cabeEnElEspacio } from "./text";
import type { RecetaMedicamento } from "./types";

/**
 * Fuente única de verdad para los límites de contenido de la receta —
 * ver ADR-005-limites-contenido-receta.md. El formulario de "Nueva Consulta"
 * debe importar estas mismas constantes para el contador de caracteres y el
 * bloqueo de guardado (RNF-05: la doctora se entera ANTES de guardar, no
 * después de que el PDF calladamente encoja o corte su texto).
 */

/** Tamaño legible mínimo para texto dirigido al paciente. Nunca se reduce
 * por debajo de esto — es mayor que el de las etiquetas ya impresas en la
 * plantilla física (5.9–6.9pt medido), acorde a que este es el contenido que
 * el paciente debe poder leer con cuidado, no una etiqueta de campo. */
export const RECETA_FONT_LEGIBLE_MIN = 7.5;

// --- "Signos de alarma" ---
export const SIGNOS_ALARMA_MAX_WIDTH = 201; // pt, ancho real tras la etiqueta
/**
 * DOS renglones, no uno. La plantilla trae impresa una sola raya (y=122.1),
 * pero la doctora pidió más espacio y al medir el hueco resultó que cabe una
 * segunda línea sin pisar nada: entre la raya impresa y la etiqueta
 * "Recomendaciones no Farmacologicas" (base y=113.8, ascendentes hasta ~118.0)
 * quedan ~4pt libres. La segunda línea se apoya justo encima de la raya, que
 * es donde iría la escritura a mano. Hacia arriba no hay margen: la primera
 * línea ya casi toca el borde inferior de la tabla (y=138.6).
 * Medido con scripts/medir-lineas-plantilla.mjs.
 */
export const SIGNOS_ALARMA_MAX_LINEAS = 2;
export const SIGNOS_ALARMA_LINE_HEIGHT = 8.5; // pt entre las dos bases
/**
 * Contador visible del formulario, igual que RECOMENDACIONES_MAX_CHARS: es una
 * aproximación. Con 2×201pt a 7.5pt el techo garantizado son 106 caracteres
 * (idéntico para prosa normal y para palabras largas, porque a este ancho el
 * desperdicio del ajuste pesa más que el vocabulario). El 55 anterior no solo
 * asumía un renglón: estaba además por encima de su propio techo, que era 54.
 * Quien decide de verdad es `signosAlarmaCabenEnReceta()`.
 */
export const SIGNOS_ALARMA_MAX_CHARS = 100;

// --- "Recomendaciones no Farmacologicas": 3 renglones impresos ---
export const RECOMENDACIONES_MAX_WIDTH = 250; // pt, por renglón
export const RECOMENDACIONES_MAX_LINEAS = 3;
/**
 * Contador visible del formulario. Es una APROXIMACIÓN: cuántos caracteres
 * caben depende del ancho real de las palabras, no de cuántas son. Medido con
 * las métricas de Helvetica sobre los 3×250pt reales, el techo garantizado es
 * 198 caracteres con prosa clínica normal y 174 si el texto trae solo palabras
 * largas (antiinflamatorios, gastrointestinales…). Antes decía 200, que ya
 * está por encima del primero — pasaba solo porque el texto de prueba caía del
 * lado bueno. 195 deja margen sin regalarle espacio útil a la doctora.
 * Quien decide de verdad si cabe es `recomendacionesCabenEnReceta()`.
 */
export const RECOMENDACIONES_MAX_CHARS = 195;

// --- "Indicaciones" (texto corrido que reemplaza la tabla, mitad Prescripción) ---
export const INDICACIONES_MAX_WIDTH = 215; // pt
export const INDICACIONES_MAX_LINEAS = 9; // ver ADR-005 para el cálculo

// --- Mitad "Rp": el renglón de cada medicamento ---
/**
 * Ancho útil de la columna Rp: el texto arranca en x=34 y la mitad izquierda
 * termina hacia x=290 — más allá empieza la mitad "Prescripción", que es la
 * que se lleva el paciente (su contenido impreso arranca en x=317.2).
 *
 * Hasta la Fase 4B este renglón se dibujaba **sin ancho máximo y sin ajuste**,
 * así que un medicamento de nombre largo se imprimía por encima de la mitad del
 * paciente. Con datos reales del catálogo no es hipotético: "betametasona +
 * clotrimazol + gentamicina — (solución inyectable) — cant. 30 — aplicar capa
 * fina" mide 324,7pt a 7,5pt, contra los 250 disponibles.
 */
export const RP_MAX_WIDTH = 250; // pt
/** UN renglón por medicamento: el siguiente ya ocupa la línea de abajo. */
export const RP_MAX_LINEAS = 1;
/** Techo medido con calibrar-limites-pdf.mjs: 68 típico, 67 con palabras largas. */
export const RP_MAX_CHARS = 65;

/**
 * Ancho útil del nombre del paciente, en cualquiera de las dos mitades.
 *
 * Se dibuja en x=50 (Rp) y x=349 (Prescripción) a 7pt, y tampoco tenía tope: un
 * nombre muy largo cruzaba a la mitad de al lado. 230pt es el menor de los dos
 * huecos.
 */
export const NOMBRE_PACIENTE_MAX_WIDTH = 230; // pt

export function lineaRpCabeEnReceta(linea: string, font: PDFFont): boolean {
  return cabeEnElEspacio(linea, font, RECETA_FONT_LEGIBLE_MIN, RP_MAX_WIDTH, RP_MAX_LINEAS);
}

export function lineaIndicacion(m: RecetaMedicamento, index: number): string {
  // Igual que en `lineaRp`: se imprime la etiqueta ("subcutánea"), nunca el
  // slug que guarda la base ("subcutanea").
  const detalles = [m.dosis, `vía ${etiquetaViaAdministracion(m.viaAdministracion)}`, m.frecuencia, `por ${m.duracion}`]
    .join(", ");
  return `${index + 1}. ${m.nombreComercial}: ${detalles}.`;
}

export function textoIndicaciones(medicamentos: RecetaMedicamento[]): string {
  return medicamentos.map(lineaIndicacion).join(" ");
}

/**
 * Misma lógica de wrap que usa el PDF — para que el formulario pueda avisar
 * "agrega una segunda receta o reduce la lista" ANTES de intentar guardar,
 * sin duplicar la fórmula de ajuste en dos lugares.
 */
export function indicacionesCabenEnReceta(medicamentos: RecetaMedicamento[], font: PDFFont): boolean {
  return cabeEnElEspacio(
    textoIndicaciones(medicamentos),
    font,
    RECETA_FONT_LEGIBLE_MIN,
    INDICACIONES_MAX_WIDTH,
    INDICACIONES_MAX_LINEAS
  );
}

/**
 * Igual que `indicacionesCabenEnReceta`, para "Recomendaciones no
 * Farmacológicas": el contador de caracteres orienta, pero esto es lo que
 * decide. Un texto de 180 caracteres con palabras muy largas puede no caber
 * aunque respete `RECOMENDACIONES_MAX_CHARS`, y uno de 195 con palabras
 * cortas cabe de sobra. El formulario debe llamar a esta función antes de
 * guardar, para que la doctora no se entere al generar el PDF.
 */
export function recomendacionesCabenEnReceta(texto: string | null | undefined, font: PDFFont): boolean {
  return cabeEnElEspacio(
    texto,
    font,
    RECETA_FONT_LEGIBLE_MIN,
    RECOMENDACIONES_MAX_WIDTH,
    RECOMENDACIONES_MAX_LINEAS
  );
}

/** Igual que las dos anteriores, para "Signos de alarma" (2 renglones). */
export function signosAlarmaCabenEnReceta(texto: string | null | undefined, font: PDFFont): boolean {
  return cabeEnElEspacio(
    texto,
    font,
    RECETA_FONT_LEGIBLE_MIN,
    SIGNOS_ALARMA_MAX_WIDTH,
    SIGNOS_ALARMA_MAX_LINEAS
  );
}
