import { PDFDocument, StandardFonts } from "pdf-lib";
import { fetchTemplateBytes } from "./load-template";
import { drawAfterLabel, drawFixedOrThrow } from "./text";
import { formatEdadHistorial } from "./edad";
import { formatFecha, formatVital, SIN_DATO_COMPACTO, UNIDAD_VITAL } from "./format";
import {
  HISTORIAL_FONT_SIZE,
  HISTORIAL_LINE_HEIGHT,
  IMPRESION_DIAGNOSTICA_MAX_CHARS,
  IMPRESION_DIAGNOSTICA_MAX_LINEAS,
  IMPRESION_DIAGNOSTICA_MAX_WIDTH,
  TRATAMIENTO_MAX_CHARS,
  TRATAMIENTO_MAX_LINEAS,
  TRATAMIENTO_MAX_WIDTH,
  textoImpresionDiagnostica,
  ANTECEDENTES_PATOLOGICOS,
  ANTECEDENTE_FONT_SIZE,
  ANTECEDENTE_MAX_LINEAS,
  HEREDOFAMILIARES_LINE_HEIGHT,
  HEREDOFAMILIARES_MAX_CHARS,
  HEREDOFAMILIARES_MAX_LINEAS,
  HEREDOFAMILIARES_MAX_WIDTH,
  MOTIVO_LINE_HEIGHT,
  MOTIVO_MAX_CHARS,
  MOTIVO_MAX_LINEAS,
  MOTIVO_MAX_WIDTH,
} from "./historial-limits";
import type { Consulta, Paciente } from "./types";

const TEMPLATE_URL = "/templates/historial-plantilla.pdf";

/**
 * Genera el PDF del historial clínico de UNA consulta (nunca un acumulado del
 * historial completo — ver 06-Generador-PDF.md) sobre la plantilla física.
 * Corre enteramente en el navegador: recibe datos ya obtenidos vía Supabase.
 *
 * `fechaPrimeraConsulta` es la fecha de la consulta más antigua del paciente
 * (el primer punto de su línea de tiempo, RF-20) — la calcula quien llama,
 * que ya tiene todas las consultas cargadas para el timeline, tomando el
 * mínimo de sus fechas. No es `paciente.fechaCreacion`: para pacientes
 * importados en bloque desde el Sheet (RF-02) esa fecha es el día de la
 * migración, no su primera consulta real.
 *
 * Puede lanzar `ContenidoExcedeEspacioError` si "Impresión Diagnóstica" o
 * "Tratamiento" no caben en su espacio impreso (ADR-007). Igual que en la
 * receta, es la red de seguridad: el formulario debe validar antes con
 * ./historial-limits.
 */
export async function generateHistorialPdf(
  paciente: Paciente,
  consulta: Consulta,
  fechaPrimeraConsulta: Date
): Promise<Uint8Array> {
  const templateBytes = await fetchTemplateBytes(TEMPLATE_URL);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];

  // Coordenadas medidas sobre la plantilla real con scripts/extract-text-positions.mjs
  // (fuente de la plantilla: Helvetica-ish 11pt).
  const L = (
    label: string,
    x: number,
    y: number,
    value?: string | number | null,
    opts?: Parameters<typeof drawAfterLabel>[6]
  ) => drawAfterLabel(page, font, label, x, y, value, opts);

  L("Nombre:", 54, 658.8, paciente.nombreCompleto);

  // ADR-006: sin fecha de nacimiento va la raya, nunca una edad calculada
  // desde una fecha inexistente. El sexo no está cargado en NINGÚN paciente
  // migrado (el Sheet de origen no traía esa columna), así que hoy este campo
  // sale con raya en todos ellos: dejarlo en blanco haría dudar de si se
  // olvidó llenarlo.
  L("Edad: ", 54, 631.7, formatEdadHistorial(paciente.fechaNacimiento, consulta.fecha), { gap: 3, size: 8 });
  L("Sexo:", 97.7, 631.7, paciente.sexo ?? SIN_DATO_COMPACTO, { gap: 3, size: 8 });
  L("Estado Civil: ", 136.8, 631.7, paciente.estadoCivil, { maxWidth: 140 , maxLines: 2, campo: "Estado civil" });
  L("Ocupación: ", 292.0, 631.7, paciente.ocupacion, { maxWidth: 155 , maxLines: 2, campo: "Ocupación" });

  L("Teléfono: ", 54, 604.5, paciente.telefono, { maxWidth: 115 , maxLines: 2, campo: "Teléfono" });
  L("Domicilio: ", 188.3, 604.5, paciente.domicilio, { maxWidth: 360, size: 9 , maxLines: 2, campo: "Domicilio" });

  // "Fecha de Elaboración" = fecha de la primera consulta del paciente (cuando
  // se abrió su historial); "Fecha Actual" = fecha de la consulta que
  // documenta este PDF. Ninguna depende de cuándo se genera o reimprime.
  L("Fecha de Elaboración :", 54, 577.4, formatFecha(fechaPrimeraConsulta), { maxWidth: 130 });
  L("Fecha Actual: ", 305.7, 577.4, formatFecha(consulta.fecha), { maxWidth: 130 });

  // Tres renglones impresos, ni uno más: la cuarta línea se montaría sobre
  // "3. Antecedentes Personales Patológicos". Antes era `drawWrapped`, o sea
  // sin tope, y por eso podía invadirla.
  drawFixedOrThrow(
    page,
    font,
    "Antecedentes heredofamiliares",
    paciente.antecedentesHeredoFamiliares,
    58,
    525,
    {
      maxWidth: HEREDOFAMILIARES_MAX_WIDTH,
      maxLines: HEREDOFAMILIARES_MAX_LINEAS,
      size: HISTORIAL_FONT_SIZE,
      lineHeight: HEREDOFAMILIARES_LINE_HEIGHT,
      sugerencia: `Máx. ~${HEREDOFAMILIARES_MAX_CHARS} caracteres.`,
    }
  );

  // Dos renglones cada uno: el tercero se montaría sobre el antecedente de
  // abajo, que está solo 27,2pt más abajo.
  const A = (etiqueta: string, y: number, campo: keyof typeof ANTECEDENTES_PATOLOGICOS, valor?: string | null) =>
    L(etiqueta, 54, y, valor, {
      maxWidth: ANTECEDENTES_PATOLOGICOS[campo].maxWidth,
      maxLines: ANTECEDENTE_MAX_LINEAS,
      size: ANTECEDENTE_FONT_SIZE,
      campo: etiqueta.replace(/[:\s]+$/, ""),
    });
  A("Alergias: ", 430.4, "alergias", consulta.alergias);
  A("Patologías: ", 403.2, "patologias", consulta.patologias);
  A("Quirúrgicos: ", 376.1, "quirurgicos", consulta.quirurgicos);
  A("Transfusionales: ", 348.9, "transfusionales", consulta.transfusionales);

  // La unidad se pega AQUÍ, al imprimir: el dato viaja como número puro desde
  // la base (ver formatVital). `pa` es la excepción — es texto ("120/80") y su
  // unidad se omite por convención en la hoja.
  const ef = consulta.exploracionFisica;
  L("PA: ", 54, 294.6, ef.pa, { maxWidth: 55 });
  L("FC: ", 137.0, 294.6, formatVital(ef.fc, UNIDAD_VITAL.fc), { maxWidth: 55 });
  L("FR: ", 221.0, 294.6, formatVital(ef.fr, UNIDAD_VITAL.fr), { maxWidth: 55 });
  L("Temperatura: ", 304.8, 294.6, formatVital(ef.temperatura, UNIDAD_VITAL.temperatura), { maxWidth: 60 });
  L("Peso Actual: ", 439.1, 294.6, formatVital(ef.peso, UNIDAD_VITAL.peso), { maxWidth: 40, size: 9 });

  // El desborde que motivó esta ronda: con `drawWrapped` no había tope y la
  // cuarta línea caía encima de "6. Impresión Diagnóstica".
  drawFixedOrThrow(page, font, "Motivo de consulta", consulta.motivoConsulta, 40, 223, {
    maxWidth: MOTIVO_MAX_WIDTH,
    maxLines: MOTIVO_MAX_LINEAS,
    size: HISTORIAL_FONT_SIZE,
    lineHeight: MOTIVO_LINE_HEIGHT,
    sugerencia: `Máx. ~${MOTIVO_MAX_CHARS} caracteres.`,
  });

  // ADR-007: estos dos campos ya no son una sola línea sin ajuste. Se envuelven
  // hasta el espacio real medido y, si no caben, lanzan en vez de desbordarse
  // sobre la etiqueta de abajo o salirse de la hoja.
  drawFixedOrThrow(
    page,
    font,
    "Impresión Diagnóstica",
    textoImpresionDiagnostica(consulta.impresionDiagnostica, consulta.codigoCie10),
    76,
    131,
    {
      maxWidth: IMPRESION_DIAGNOSTICA_MAX_WIDTH,
      maxLines: IMPRESION_DIAGNOSTICA_MAX_LINEAS,
      size: HISTORIAL_FONT_SIZE,
      lineHeight: HISTORIAL_LINE_HEIGHT,
      sugerencia: `Máx. ~${IMPRESION_DIAGNOSTICA_MAX_CHARS} caracteres, incluido el código CIE-10.`,
    }
  );

  drawFixedOrThrow(page, font, "Tratamiento", consulta.tratamiento, 58, 77, {
    maxWidth: TRATAMIENTO_MAX_WIDTH,
    maxLines: TRATAMIENTO_MAX_LINEAS,
    size: HISTORIAL_FONT_SIZE,
    lineHeight: HISTORIAL_LINE_HEIGHT,
    sugerencia: `Máx. ~${TRATAMIENTO_MAX_CHARS} caracteres.`,
  });

  return pdfDoc.save();
}
