export { generateHistorialPdf } from "./historial";
export { generateRecetaPdf } from "./receta";
export { crearVistaPreviaPdf } from "./preview";
export { ContenidoExcedeEspacioError } from "./text";
// ADR-006: para que la pantalla de consulta pueda avisar que el paciente no
// tiene fecha de nacimiento antes de generar el PDF, en vez de descubrirlo al
// ver la raya impresa.
export {
  tieneFechaNacimiento,
  EDAD_NO_REGISTRADA_HISTORIAL,
  EDAD_NO_REGISTRADA_RECETA,
} from "./edad";
export { SIN_DATO_COMPACTO, UNIDAD_VITAL, formatVital } from "./format";
export {
  RECETA_FONT_LEGIBLE_MIN,
  SIGNOS_ALARMA_MAX_CHARS,
  SIGNOS_ALARMA_MAX_LINEAS,
  RECOMENDACIONES_MAX_CHARS,
  RECOMENDACIONES_MAX_LINEAS,
  SIGNOS_ALARMA_LINE_HEIGHT,
  INDICACIONES_MAX_LINEAS,
  indicacionesCabenEnReceta,
  recomendacionesCabenEnReceta,
  signosAlarmaCabenEnReceta,
} from "./receta-limits";
// La fuente con la que el FORMULARIO mide si un texto cabe. Es la misma
// Helvetica que incrusta el PDF: medir con otra dejaría pasar textos que
// después no caben (ver ./medicion).
export { fuenteDeMedida } from "./medicion";
// Límites del historial (ADR-007) — mismo contrato que los de la receta.
export {
  HISTORIAL_FONT_SIZE,
  HISTORIAL_LINE_HEIGHT,
  IMPRESION_DIAGNOSTICA_MAX_CHARS,
  IMPRESION_DIAGNOSTICA_MAX_LINEAS,
  TRATAMIENTO_MAX_CHARS,
  TRATAMIENTO_MAX_LINEAS,
  textoImpresionDiagnostica,
  impresionDiagnosticaCabeEnHistorial,
  tratamientoCabeEnHistorial,
} from "./historial-limits";
export type { Paciente, Consulta, ExploracionFisica, RecetaMedicamento } from "./types";
// Vocabulario cerrado de la receta: las listas alimentan los dropdowns del
// formulario y las etiquetas son lo que se imprime. Mismo contenido que los
// CHECK de la base — ver ./vocabulario.
export {
  PRESENTACIONES,
  VIAS_ADMINISTRACION,
  ETIQUETA_PRESENTACION,
  ETIQUETA_VIA_ADMINISTRACION,
  etiquetaPresentacion,
  etiquetaViaAdministracion,
} from "./vocabulario";
export type { Presentacion, ViaAdministracion } from "./vocabulario";
