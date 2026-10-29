import { readFile } from "node:fs/promises";
import path from "node:path";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");
const file = process.argv[2];
if (!file) {
  console.error("uso: node scripts/extract-text-positions.mjs <archivo.pdf>");
  process.exit(1);
}

const bytes = new Uint8Array(await readFile(path.join(TEMPLATES_DIR, file)));
const doc = await pdfjs.getDocument({ data: bytes }).promise;
const page = await doc.getPage(1);
const { height } = page.getViewport({ scale: 1 });
const content = await page.getTextContent();

const items = content.items
  .filter((it) => it.str.trim().length > 0)
  .map((it) => ({
    str: it.str,
    x: Math.round(it.transform[4] * 100) / 100,
    // pdfjs origin es esquina superior-izquierda para el viewport,
    // pero transform[5] ya viene en espacio PDF (origen inferior-izquierdo).
    y: Math.round(it.transform[5] * 100) / 100,
    width: Math.round(it.width * 100) / 100,
    fontSize: Math.round(it.transform[0] * 100) / 100,
    xEnd: Math.round((it.transform[4] + it.width) * 100) / 100,
  }))
  .sort((a, b) => b.y - a.y || a.x - b.x);

for (const it of items) {
  console.log(
    `y=${it.y.toFixed(1).padStart(7)}  x=${it.x.toFixed(1).padStart(7)}  xEnd=${it.xEnd
      .toFixed(1)
      .padStart(7)}  fs=${it.fontSize.toFixed(1).padStart(5)}  "${it.str}"`
  );
}
console.log(`\nalto de página: ${height}`);
