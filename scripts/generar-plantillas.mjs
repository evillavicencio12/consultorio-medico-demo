// scripts/generar-plantillas.mjs
//
// Genera desde cero las dos plantillas impresas sobre las que lib/pdf/ escribe
// los datos de cada consulta (overlay): public/templates/historial-plantilla.pdf
// y public/templates/receta-plantilla.pdf.
//
// Son genéricas: «Consultorio Demo», sin imágenes, logos ni datos de contacto
// reales. La geometría (renglones, tabla de la receta, títulos de sección) es
// la de las plantillas del consultorio real, medida con
// scripts/medir-lineas-plantilla.mjs, para que el overlay y los límites de
// lib/pdf/*-limits.ts sigan cuadrando sin cambios.
//
// Uso:
//   node scripts/generar-plantillas.mjs

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const SALIDA = path.join(process.cwd(), "public", "templates");
const FECHA_FIJA = new Date("2026-01-01T00:00:00Z"); // para que el PDF no cambie en cada corrida

async function nuevoDocumento(titulo, ancho, alto, origenY = 0) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.setCreator("scripts/generar-plantillas.mjs");
  doc.setProducer("pdf-lib");
  doc.setCreationDate(FECHA_FIJA);
  doc.setModificationDate(FECHA_FIJA);
  const page = doc.addPage([ancho, alto + origenY]);
  // La caja visible puede no empezar en y = 0 (la receta original empieza en
  // 8,67): se copia tal cual, porque lib/pdf/ escribe en esas coordenadas.
  page.setMediaBox(0, origenY, ancho, alto);
  page.setCropBox(0, origenY, ancho, alto);
  const fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
    cursiva: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  return { doc, page, fuentes };
}

const linea = (page, x1, x2, y, grosor, color) =>
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: grosor, color });
const vertical = (page, x, y1, y2, grosor, color) =>
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: grosor, color });

// ---------------------------------------------------------------------------
// Historia clínica: A4 vertical (596 x 842), texto negro, renglones finos.
// ---------------------------------------------------------------------------
async function historial() {
  const { doc, page, fuentes } = await nuevoDocumento("Plantilla de historia clínica (demo)", 596, 842);
  const negro = rgb(0, 0, 0);
  const gris = rgb(0.35, 0.35, 0.35);

  // Encabezado genérico en lugar del logo y el nombre del consultorio.
  const centrado = (texto, fuente, size, y, color = negro) =>
    page.drawText(texto, { x: (596 - fuente.widthOfTextAtSize(texto, size)) / 2, y, size, font: fuente, color });
  centrado("CONSULTORIO DEMO", fuentes.negrita, 13, 792);
  centrado("Dra. Ana Ejemplo · Medicina general", fuentes.cursiva, 9.5, 776, gris);
  linea(page, 236, 360, 766, 0.6, gris);
  centrado("HISTORIAL CLÍNICO", fuentes.negrita, 20, 710.6);

  // Renglones: las mismas posiciones que la plantilla original (y del renglón).
  const RENGLONES = [
    [96.3, 211.8, 657.75], // Nombre
    [85.5, 91.0, 630.6], [124.6, 130.1, 630.6], // Edad, Sexo
    [201.3, 282.2, 630.6], [350.5, 454.5, 630.6], // Estado civil, Ocupación
    [103.3, 178.5, 603.4], [241.3, 558.5, 603.4], // Teléfono, Domicilio
    [166.5, 299.2, 576.35], [376.7, 555.5, 576.35], // Fecha de elaboración, Fecha actual
    [53.8, 555.5, 522.1], [53.8, 555.5, 502.9], [53.8, 555.5, 483.75], // Heredofamiliares
    [100.2, 555.7, 429.4], [111.0, 555.0, 402.25], [116.8, 555.0, 375.1], [136.0, 556.8, 347.9], // Antecedentes
    [72.7, 130.5, 293.6], [156.7, 214.3, 293.6], [240.3, 298.2, 293.6], [374.7, 432.5, 293.6], [502.8, 555.0, 293.6], // Signos
    [35.8, 554.8, 220.1], [35.8, 554.8, 200.9], [35.8, 554.8, 181.75], // Padecimiento actual
    [71.8, 423.7, 127.4], // Impresión diagnóstica
    [53.8, 405.7, 73.1], // Tratamiento
  ];
  for (const [x1, x2, y] of RENGLONES) linea(page, x1, x2, y, 0.8, negro);

  // Etiquetas: [texto, x, y, negrita, hasta]. `hasta` es dónde empieza su
  // renglón; si el texto no cabe en 11 pt, se achica para no pisarlo.
  const ETIQUETAS = [
    ["1.", 54, 686, true], ["Ficha de identificación", 72, 686, true],
    ["Nombre:", 54, 658.8, false, 96.3],
    ["Edad:", 54, 631.7, false, 85.5], ["Sexo:", 97.6, 631.7, false, 124.6],
    ["Estado Civil:", 136.8, 631.7, false, 201.3], ["Ocupación:", 292, 631.7, false, 350.5],
    ["Teléfono:", 54, 604.5, false, 103.3], ["Domicilio:", 188.3, 604.5, false, 241.3],
    ["Fecha de Elaboración:", 54, 577.3, false, 166.5], ["Fecha Actual:", 305.7, 577.3, false, 376.7],
    ["2.", 54, 550.2, true], ["Antecedentes Heredo Familiares", 72, 550.2, true],
    ["3.", 54, 457.6, true], ["Antecedentes Personales Patológicos", 72, 457.6, true],
    ["Alergias:", 54, 430.4, false, 100.2], ["Patologías:", 54, 403.2, false, 111.0],
    ["Quirúrgicos:", 54, 376.1, false, 116.8], ["Transfusionales:", 54, 348.9, false, 136.0],
    ["4.", 54, 321.8, true], ["Exploración Física", 72, 321.8, true],
    ["PA:", 54, 294.6, false, 72.7], ["FC:", 137, 294.6, false, 156.7], ["FR:", 221, 294.6, false, 240.3],
    ["Temperatura:", 304.7, 294.6, false, 374.7], ["Peso Actual:", 439.1, 294.6, false, 502.8],
    ["5.", 54, 267.4, true], ["Padecimiento Actual", 72, 267.4, true],
    ["6.", 54, 155.6, true], ["Impresión Diagnóstica", 72, 155.6, true],
    ["7.", 54, 101.3, true], ["Tratamiento", 72, 101.3, true],
  ];
  for (const [texto, x, y, negrita, hasta] of ETIQUETAS) {
    const fuente = negrita ? fuentes.negrita : fuentes.normal;
    let size = 11;
    if (hasta) {
      const disponible = hasta - x - 2;
      const ancho = fuente.widthOfTextAtSize(texto, size);
      if (ancho > disponible) size = (size * disponible) / ancho;
    }
    page.drawText(texto, { x, y, size, font: fuente, color: negro });
  }

  await writeFile(path.join(SALIDA, "historial-plantilla.pdf"), await doc.save());
}

// ---------------------------------------------------------------------------
// Receta: media hoja apaisada (595,5 x 419,25, desde y = 8,67), bipartita. Mitad izquierda: datos
// y "Rp" (lo que se entrega a la farmacia). Mitad derecha: indicaciones al
// paciente, con la tabla de prescripción.
// ---------------------------------------------------------------------------
async function receta() {
  // Lo medido en la imagen (líneas, tabla, encabezado, pie) va relativo al
  // borde de la hoja; las etiquetas, en el espacio de usuario original.
  const O = 8.669995;
  const { doc, page, fuentes } = await nuevoDocumento("Plantilla de receta médica (demo)", 595.5, 419.25, O);
  const azul = rgb(0 / 255, 78 / 255, 123 / 255);

  // Encabezado genérico de cada mitad, sin logo ni decoración.
  for (const dx of [0, 303.8]) {
    page.drawText("Consultorio Demo", { x: 72 + dx, y: 392 + O, size: 15, font: fuentes.negrita, color: rgb(0, 0, 0) });
    page.drawText("Dra. Ana Ejemplo", { x: 79 + dx, y: 373 + O, size: 11, font: fuentes.negrita, color: rgb(0.1, 0.1, 0.1) });
    page.drawText("M E D I C I N A    G E N E R A L", { x: 79 + dx, y: 359.5 + O, size: 8, font: fuentes.normal, color: rgb(0, 0, 0) });
    page.drawText("REG. PROFESIONAL: 0000-00-00000", { x: 82.5 + dx, y: 346.6 + O, size: 6, font: fuentes.negrita, color: azul });
  }

  // Líneas: [x1, x2, y, grosor]. Mismas posiciones que la plantilla original.
  const LINEAS = [
    [15.5, 284.3, 325.9, 1.5], [317.2, 579.2, 325.0, 1.2], // bajo el encabezado
    [38.5, 74.5, 313.2, 0.7], [89.3, 125.3, 312.8, 0.8], [149.7, 185.5, 313.2, 0.7], // Fecha (izq.)
    [337.3, 373.3, 313.2, 0.7], [388.3, 424.2, 312.8, 0.8], [448.5, 484.5, 313.2, 0.7], // Fecha (der.)
    [49.7, 284.3, 294.6, 1.1], [348.5, 583.2, 294.6, 1.1], // Paciente
    [41.8, 162.2, 279.2, 1.0], [189.5, 284.3, 278.8, 0.8], // Edad, Meses
    [79.7, 284.3, 258.4, 0.7], // Diagnóstico CIE-10
    [374.2, 578.8, 121.6, 0.8], [435.8, 578.8, 106.8, 1.1], [318.5, 578.8, 85.9, 1.6], // Signos, Recomendaciones
    [159.0, 279.3, 61.8, 0.8], [159.0, 279.3, 45.2, 0.8], // Prescriptor y firma (izq.)
    [429.0, 549.2, 66.3, 0.8], [429.0, 549.2, 49.6, 0.8], // Prescriptor y firma (der.)
  ];
  for (const [x1, x2, y, g] of LINEAS) linea(page, x1, x2, y + O, g, azul);

  // Tabla de prescripción (mitad derecha): 1 fila de encabezado + 6 renglones.
  const FILAS_Y = [259.3, 242.4, 224.9, 207.5, 190.0, 172.8, 155.4, 138.4];
  const COLUMNAS_X = [317.6, 413.0, 446.4, 496.0, 537.4, 578.3];
  for (const y of FILAS_Y) linea(page, 317.2, 578.5, y + O, 1.2, azul);
  for (const x of COLUMNAS_X) vertical(page, x, 138.1 + O, 259.7 + O, 1.2, azul);
  // Sin los títulos de las columnas: lib/pdf/receta.ts tapa la tabla con un
  // rectángulo blanco y escribe las indicaciones como texto, y un texto tapado
  // seguiría saliendo al copiar o extraer el texto del PDF.

  // Etiquetas: [texto, x, y, estilo, tamaño].
  const ETIQUETAS = [
    ["Fecha:", 20.2, 321.7], ["de", 75.9, 321.2], ["del 20", 131.0, 321.2],
    ["Paciente:", 20.2, 305.0], ["Edad:", 20.2, 286.9], ["Meses:", 162.2, 286.2],
    ["Diagnóstico - CIE 10:", 20.2, 268.2], ["Rp:", 20.2, 251.5],
    ["activo, cantidad del medicamento, dosis.", 104.3, 231.0, "normal", 5.5],
    ["Nombre del Prescriptor:", 82.5, 72.5, "cursiva", 6.9], ["Firma y Sello:", 82.5, 52.0, "cursiva", 6.9],
    ["Fecha:", 319.1, 321.7], ["de", 374.7, 321.2], ["del 20", 429.8, 321.2],
    ["Paciente:", 319.1, 305.0], ["INDICACIONES:", 319.1, 282.6],
    ["Signos de alarma:", 317.2, 130.0, "negrita"], ["Recomendaciones no Farmacológicas", 317.7, 113.8, "negrita"],
    ["Nombre del Prescriptor:", 352.4, 77.0, "cursiva", 6.9], ["Firma y Sello:", 352.4, 56.5, "cursiva", 6.9],
  ];
  for (const [texto, x, y, estilo = "normal", size = 5.9] of ETIQUETAS) {
    page.drawText(texto, { x, y, size, font: fuentes[estilo], color: azul });
  }
  // "DATOS DEL MEDICAMENTO" en negrita, y la explicación después, con el mismo
  // pequeño espacio antes de los dos puntos que tenía la plantilla original.
  const titulo = "DATOS DEL MEDICAMENTO";
  page.drawText(titulo, { x: 26.1, y: 238.3, size: 5.5, font: fuentes.negrita, color: azul });
  page.drawText(": DCI, forma farmacéutica, vía de administración, concentración, principio",
    { x: 26.1 + fuentes.negrita.widthOfTextAtSize(titulo, 5.5) + 0.8, y: 238.3, size: 5.5, font: fuentes.normal, color: azul });

  // Pie: una línea fina y los datos de contacto de ejemplo, en las dos mitades.
  linea(page, 15.5, 579.2, 41.4 + O, 0.6, azul);
  for (const dx of [0, 298.4]) {
    page.drawText("Tel. 000 000 0000", { x: 28.4 + dx, y: 23 + O, size: 6, font: fuentes.normal, color: azul });
    page.drawText("Calle Ficticia 123, Ciudad Ejemplo", { x: 95.3 + dx, y: 26 + O, size: 6, font: fuentes.normal, color: azul });
    page.drawText("contacto@consultorio-demo.example", { x: 95.3 + dx, y: 17 + O, size: 6, font: fuentes.normal, color: azul });
  }

  await writeFile(path.join(SALIDA, "receta-plantilla.pdf"), await doc.save());
}

await historial();
await receta();
console.log("Plantillas generadas en", SALIDA);
