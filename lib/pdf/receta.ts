import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fetchTemplateBytes } from "./load-template";
import { drawText, drawFixedOrThrow, medirTexto } from "./text";
import { formatEdadReceta } from "./edad";
import { formatFechaPartes } from "./format";
import { PRESCRIPTOR } from "./config";
import { etiquetaPresentacion } from "./vocabulario";
import {
  RECETA_FONT_LEGIBLE_MIN,
  SIGNOS_ALARMA_MAX_WIDTH,
  SIGNOS_ALARMA_MAX_LINEAS,
  SIGNOS_ALARMA_MAX_CHARS,
  SIGNOS_ALARMA_LINE_HEIGHT,
  RECOMENDACIONES_MAX_WIDTH,
  RECOMENDACIONES_MAX_LINEAS,
  RECOMENDACIONES_MAX_CHARS,
  INDICACIONES_MAX_WIDTH,
  INDICACIONES_MAX_LINEAS,
  textoIndicaciones,
  NOMBRE_PACIENTE_MAX_WIDTH,
  RP_MAX_CHARS,
  RP_MAX_LINEAS,
  RP_MAX_WIDTH,
} from "./receta-limits";
import type { Consulta, Paciente, RecetaMedicamento } from "./types";

const TEMPLATE_URL = "/templates/receta-plantilla.pdf";

// Rectángulo que tapa la tabla impresa (MEDICAMENTO/DOSIS/VIA/FRECUENCIA/DURACION)
// de la mitad "Prescripción", donde la tabla se reemplaza por texto corrido sin
// celdas (05-Prescripcion-Receta.md).
//
// MEDIDO, no estimado: `scripts/medir-lineas-plantilla.mjs` detecta las líneas
// vectoriales del marco (que extract-text-positions.mjs no ve, porque solo lee
// texto). La tabla ocupa exactamente x 317.2–578.5 e y 138.1–259.7. El valor
// anterior { 343, 145, 232, 130 } se quedaba corto 25.8pt por la izquierda,
// 3.5pt por la derecha y 6.9pt por abajo, y dejaba muñones de las líneas de
// fila a la vista al imprimir.
//
// Los márgenes son ajustados a propósito, con dos vecinos que no se pueden
// pisar: "INDICACIONES:" arriba (base y=282.6) y la etiqueta "Signos de
// alarma:" abajo (base y=130.0, con ascendentes hasta ~134.2). El borde
// superior sube hasta 268 para tapar también los encabezados de columna, cuya
// letra más alta ("VIA") llega a ~265.4.
const TABLA_PRESCRIPCION = { x: 315.5, y: 136.5, width: 265, height: 131.5 };
const INDICACIONES_START_Y = 250;
const INDICACIONES_LINE_HEIGHT = RECETA_FONT_LEGIBLE_MIN + 3.5;

// "Recomendaciones no Farmacologicas" tiene 3 renglones impresos en la
// plantilla física (no 1). El espacio real entre esa etiqueta (y=113.8) y
// "Nombre del Prescriptor" (y=77-79.5) mide ~35pt — no alcanza para 3 líneas
// holgadas a tamaño legible, por eso el espaciado va ajustado.
const RECOMENDACIONES_START_Y = 108;
const RECOMENDACIONES_LINE_HEIGHT = 8.6;

function dibujarNumeroReceta(page: PDFPage, font: PDFFont, numero: number | null | undefined, rightEdge: number, y: number) {
  if (numero === null || numero === undefined) return;
  // La plantilla física no trae un campo impreso para esto (confirmado sobre
  // ambas mitades) — se agrega como texto discreto en la esquina superior
  // derecha, a la altura de "MEDICO GENERAL" y a su derecha, donde hay
  // espacio en blanco sin pisar el logo ni el resto del encabezado.
  const texto = `No. ${String(numero).padStart(6, "0")}`;
  const size = 6; // mismo tamaño que el registro profesional ya impreso
  // `medirTexto` y no `font.widthOfTextAtSize` directo: medir es justo la
  // llamada que lanza ante un carácter que WinAnsi no tiene (ver ./text).
  const width = medirTexto(font, texto, size);
  drawText(page, font, texto, rightEdge - width, y, size);
}

function lineaRp(m: RecetaMedicamento): string {
  // `etiquetaPresentacion`, no el valor crudo: la base guarda el slug
  // `solucion_inyectable` y en la receta impresa debe leerse "solución
  // inyectable". Sin esto, un documento legal saldría con guiones bajos.
  return [
    m.nombreGenerico,
    `(${etiquetaPresentacion(m.presentacion)})`,
    `cant. ${m.cantidad}`,
    m.dosis,
  ].join(" — ");
}

/**
 * Genera el PDF de la receta bipartita (mitad "Rp" + mitad "Prescripción") de
 * UNA consulta, sobre la plantilla física. Corre enteramente en el navegador.
 *
 * Puede lanzar `ContenidoExcedeEspacioError` (ver ./text) si "Signos de
 * alarma", "Recomendaciones no Farmacológicas" o la lista de medicamentos no
 * caben a tamaño legible. Esto es intencional — ADR-005-limites-contenido-receta.md:
 * el formulario debe validar con los límites de ./receta-limits ANTES de
 * llegar aquí; este error es la red de seguridad, no el mecanismo principal.
 */
export async function generateRecetaPdf(
  paciente: Paciente,
  consulta: Consulta,
  medicamentos: RecetaMedicamento[]
): Promise<Uint8Array> {
  const templateBytes = await fetchTemplateBytes(TEMPLATE_URL);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];

  const { dia, mes, anio2 } = formatFechaPartes(consulta.fecha);
  const { edad, meses } = formatEdadReceta(paciente.fechaNacimiento, consulta.fecha);

  // --- Mitad "Rp" (queda con la doctora) ---
  drawText(page, font, dia, 45, 324, 7);
  drawText(page, font, mes, 88, 324, 7);
  drawText(page, font, anio2, 152, 324, 7); // solo 2 dígitos: ya está impreso "del 20___"

  // Con tope de ancho: sin él, un nombre largo cruzaba a la mitad del paciente.
  const nombre = (x: number, y: number) =>
    drawFixedOrThrow(page, font, "Nombre del paciente", paciente.nombreCompleto, x, y, {
      maxWidth: NOMBRE_PACIENTE_MAX_WIDTH,
      maxLines: 1,
      size: 7,
      lineHeight: 8,
      sugerencia: "El nombre no cabe en el ancho de la receta sin invadir la otra mitad.",
    });
  nombre(50, 307);
  // ADR-006: si el paciente migrado no tiene fecha de nacimiento, aquí va
  // "No registrada" (cabe: ~122pt libres hasta "Meses:") y "Meses" queda
  // vacío. Antes se imprimía una edad falsa calculada desde 1970.
  drawText(page, font, edad, 40, 289, 7);
  drawText(page, font, meses, 186, 289, 7);
  drawText(page, font, consulta.codigoCie10, 80, 270.5, 7);

  dibujarNumeroReceta(page, font, consulta.numeroReceta, 284, 361);

  const rpLines = medicamentos.map(lineaRp);
  const rpStep = rpLines.length > 6 ? 12 : 16;
  const rpSize = rpLines.length > 6 ? 6.5 : 7.5;
  // Cada renglón, con su ancho medido: antes se dibujaba a pelo con `drawText`,
  // sin ajuste ni tope, y un genérico largo del catálogo real se imprimía sobre
  // la mitad "Prescripción" del paciente.
  rpLines.forEach((line, i) =>
    drawFixedOrThrow(page, font, "Renglón de medicamento (Rp)", line, 34, 205 - i * rpStep, {
      maxWidth: RP_MAX_WIDTH,
      maxLines: RP_MAX_LINEAS,
      size: rpSize,
      lineHeight: rpStep,
      sugerencia: `Máx. ~${RP_MAX_CHARS} caracteres por renglón: acorta la dosis o el nombre genérico.`,
    })
  );

  drawText(page, font, PRESCRIPTOR.nombre, 160, 75, 6.5);

  // --- Mitad "Prescripción" (se lleva el paciente) ---
  drawText(page, font, dia, 345, 324, 7);
  drawText(page, font, mes, 390, 324, 7);
  drawText(page, font, anio2, 451, 324, 7); // solo 2 dígitos

  nombre(349, 307);

  dibujarNumeroReceta(page, font, consulta.numeroReceta, 578, 361);

  page.drawRectangle({ ...TABLA_PRESCRIPCION, color: rgb(1, 1, 1) });

  drawFixedOrThrow(page, font, "Lista de medicamentos", textoIndicaciones(medicamentos), 350, INDICACIONES_START_Y, {
    maxWidth: INDICACIONES_MAX_WIDTH,
    maxLines: INDICACIONES_MAX_LINEAS,
    size: RECETA_FONT_LEGIBLE_MIN,
    lineHeight: INDICACIONES_LINE_HEIGHT,
    sugerencia: "Reduce la lista de medicamentos o divide la prescripción en una segunda receta.",
  });

  // y=132 es la primera línea, pegada bajo el borde de la tabla; la segunda
  // cae en 123.5, justo encima de la raya impresa (y=122.1).
  drawFixedOrThrow(page, font, "Signos de alarma", consulta.signosAlarma, 374, 132, {
    maxWidth: SIGNOS_ALARMA_MAX_WIDTH,
    maxLines: SIGNOS_ALARMA_MAX_LINEAS,
    size: RECETA_FONT_LEGIBLE_MIN,
    lineHeight: SIGNOS_ALARMA_LINE_HEIGHT,
    sugerencia: `Máx. ~${SIGNOS_ALARMA_MAX_CHARS} caracteres.`,
  });

  drawFixedOrThrow(
    page,
    font,
    "Recomendaciones no Farmacológicas",
    consulta.recomendacionesNoFarmacologicas,
    318,
    RECOMENDACIONES_START_Y,
    {
      maxWidth: RECOMENDACIONES_MAX_WIDTH,
      maxLines: RECOMENDACIONES_MAX_LINEAS,
      size: RECETA_FONT_LEGIBLE_MIN,
      lineHeight: RECOMENDACIONES_LINE_HEIGHT,
      sugerencia: `Máx. ~${RECOMENDACIONES_MAX_CHARS} caracteres.`,
    }
  );

  drawText(page, font, PRESCRIPTOR.nombre, 430, 79.5, 6.5);

  return pdfDoc.save();
}
