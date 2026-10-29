import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/**
 * La fuente con la que se MIDE si un texto cabe, para el formulario.
 *
 * ADR-005 y ADR-007 dicen lo mismo: el contador de caracteres es una
 * aproximación, y quien decide de verdad si algo cabe son las funciones de
 * ajuste (`impresionDiagnosticaCabeEnHistorial`, `tratamientoCabeEnHistorial`,
 * `signosAlarmaCabenEnReceta`…). Todas piden un `PDFFont`, porque miden con las
 * métricas reales de la fuente en vez de contar letras.
 *
 * Hasta ahora ese `PDFFont` solo existía dentro de `generateHistorialPdf`, es
 * decir cuando ya era tarde: el error saltaba al ver el PDF. Esto lo pone a
 * disposición del formulario, que es donde ADR-007 quiere el aviso.
 *
 * **Tiene que ser la MISMA fuente que dibuja el PDF** —Helvetica estándar, la
 * que incrusta `generateHistorialPdf`— o mediría un ancho distinto del que
 * después se imprime, y el formulario dejaría pasar textos que el PDF rechaza.
 *
 * No cuesta una petición de red: las 14 fuentes estándar de PDF vienen dentro
 * de pdf-lib como métricas AFM, así que esto no toca `/templates` ni la red.
 * Aun así se memoiza la promesa: crear un documento por cada tecla pulsada
 * sería un desperdicio, y todas las llamadas comparten la misma fuente.
 */
let promesa: Promise<PDFFont> | null = null;

export function fuenteDeMedida(): Promise<PDFFont> {
  promesa ??= PDFDocument.create().then((doc) => doc.embedFont(StandardFonts.Helvetica));
  return promesa;
}

export type { PDFFont };
