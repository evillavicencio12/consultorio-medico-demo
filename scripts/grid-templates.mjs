import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");
const OUTPUT_DIR = path.join(process.cwd(), "scripts", "output");
const STEP = 50;

// Área de la tabla "Prescripción" (mitad derecha) en receta-plantilla.pdf,
// en puntos, origen inferior-izquierdo. null hasta confirmar coordenadas.
const RECETA_TABLA_PRESCRIPCION = { x: 343, y: 145, width: 232, height: 130 };

async function addGrid(pdfDoc, page) {
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const gridColor = rgb(0, 0.4, 0.9);
  const labelSize = 6;

  for (let x = 0; x <= width; x += STEP) {
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      thickness: 0.4,
      color: gridColor,
      opacity: 0.35,
    });
    page.drawText(String(x), {
      x: x + 1,
      y: height - labelSize - 2,
      size: labelSize,
      font,
      color: gridColor,
    });
    page.drawText(String(x), {
      x: x + 1,
      y: 2,
      size: labelSize,
      font,
      color: gridColor,
    });
  }

  for (let y = 0; y <= height; y += STEP) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      thickness: 0.4,
      color: gridColor,
      opacity: 0.35,
    });
    page.drawText(String(y), {
      x: 2,
      y: y + 1,
      size: labelSize,
      font,
      color: gridColor,
    });
    page.drawText(String(y), {
      x: width - 18,
      y: y + 1,
      size: labelSize,
      font,
      color: gridColor,
    });
  }
}

async function processTemplate(fileName, { rectangle } = {}) {
  const inputPath = path.join(TEMPLATES_DIR, fileName);
  const bytes = await readFile(inputPath);
  const pdfDoc = await PDFDocument.load(bytes);

  for (const page of pdfDoc.getPages()) {
    await addGrid(pdfDoc, page);

    if (rectangle) {
      page.drawRectangle({
        x: rectangle.x,
        y: rectangle.y,
        width: rectangle.width,
        height: rectangle.height,
        borderColor: rgb(1, 0, 0),
        borderWidth: 1.5,
        color: undefined,
      });
    }
  }

  const outName = fileName.replace(".pdf", "-grid.pdf");
  const outPath = path.join(OUTPUT_DIR, outName);
  await writeFile(outPath, await pdfDoc.save());
  console.log(`generado: ${path.relative(process.cwd(), outPath)}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await processTemplate("receta-plantilla.pdf", {
  rectangle: RECETA_TABLA_PRESCRIPCION,
});
await processTemplate("historial-plantilla.pdf");
