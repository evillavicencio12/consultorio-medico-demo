import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");
const files = ["receta-plantilla.pdf", "historial-plantilla.pdf"];

for (const file of files) {
  const filePath = path.join(TEMPLATES_DIR, file);
  const bytes = await readFile(filePath);
  const pdfDoc = await PDFDocument.load(bytes);

  console.log(`\n${file}`);
  pdfDoc.getPages().forEach((page, index) => {
    const { width, height } = page.getSize();
    console.log(
      `  página ${index + 1}: ${width.toFixed(2)} x ${height.toFixed(2)} pt`
    );
  });
}
