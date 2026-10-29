// scripts/medir-lineas-plantilla.mjs
//
// Mide las LÍNEAS IMPRESAS (marcos de tabla, renglones) de una plantilla, que
// scripts/extract-text-positions.mjs no puede ver porque solo lee texto.
// Renderiza la página a alta resolución y busca tiras largas de píxeles
// oscuros, devolviendo sus coordenadas en puntos PDF (origen abajo-izquierda),
// listas para usar en lib/pdf/.
//
// Uso:
//   node scripts/medir-lineas-plantilla.mjs <archivo.pdf> [xMin xMax yMin yMax]
//
// Ejemplo (mitad "Prescripción" de la receta):
//   node scripts/medir-lineas-plantilla.mjs receta-plantilla.pdf 300 600 100 300
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const TEMPLATES_DIR = path.join(process.cwd(), "public", "templates");
const SCALE = 6; // px por punto
const OSCURO = 200; // umbral de luminancia
const LARGO_MIN_PT = 12; // una "línea" es una tira de al menos esto

const [file, ...region] = process.argv.slice(2);
if (!file) {
  console.error("uso: node scripts/medir-lineas-plantilla.mjs <archivo.pdf> [xMin xMax yMin yMax]");
  process.exit(1);
}
const [xMin = 0, xMax = Infinity, yMin = 0, yMax = Infinity] = region.map(Number);

const bytes = new Uint8Array(await readFile(path.join(TEMPLATES_DIR, file)));
const doc = await pdfjs.getDocument({ data: bytes }).promise;
const page = await doc.getPage(1);
const { width: wPt, height: hPt } = page.getViewport({ scale: 1 });
const viewport = page.getViewport({ scale: SCALE });
const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, viewport.width, viewport.height);
await page.render({ canvasContext: ctx, viewport, canvas }).promise;

const { data, width: W, height: H } = ctx.getImageData(0, 0, viewport.width, viewport.height);
const esOscuro = (px, py) => {
  const i = (py * W + px) * 4;
  const a = data[i + 3];
  if (a === 0) return false;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < OSCURO;
};

const aPdfX = (px) => px / SCALE;
const aPdfY = (py) => hPt - py / SCALE;
const largoMinPx = LARGO_MIN_PT * SCALE;

// --- tiras horizontales ---
const horizontales = [];
for (let py = 0; py < H; py++) {
  let inicio = null;
  for (let px = 0; px <= W; px++) {
    if (px < W && esOscuro(px, py)) {
      if (inicio === null) inicio = px;
    } else if (inicio !== null) {
      if (px - inicio >= largoMinPx) horizontales.push({ py, x1: aPdfX(inicio), x2: aPdfX(px), y: aPdfY(py) });
      inicio = null;
    }
  }
}

// --- tiras verticales ---
const verticales = [];
for (let px = 0; px < W; px++) {
  let inicio = null;
  for (let py = 0; py <= H; py++) {
    if (py < H && esOscuro(px, py)) {
      if (inicio === null) inicio = py;
    } else if (inicio !== null) {
      if (py - inicio >= largoMinPx) verticales.push({ px, x: aPdfX(px), y1: aPdfY(py), y2: aPdfY(inicio) });
      inicio = null;
    }
  }
}

// Una línea impresa tiene grosor de varios píxeles: se agrupan las tiras
// contiguas y casi solapadas en una sola, para no reportar la misma 5 veces.
function agrupar(tiras, clave, desde, hasta) {
  const orden = [...tiras].sort((a, b) => a[clave] - b[clave]);
  const grupos = [];
  for (const t of orden) {
    const g = grupos[grupos.length - 1];
    const solapa = g && Math.abs(t[clave] - g.ultimo) <= 2 && t[desde] < g[hasta] + 3 && t[hasta] > g[desde] - 3;
    if (solapa) {
      g.ultimo = t[clave];
      g[desde] = Math.min(g[desde], t[desde]);
      g[hasta] = Math.max(g[hasta], t[hasta]);
      g.grosorPx += 1;
    } else {
      grupos.push({ ...t, ultimo: t[clave], grosorPx: 1 });
    }
  }
  return grupos;
}

const enRegion = (x1, x2, y1, y2) => x2 >= xMin && x1 <= xMax && y2 >= yMin && y1 <= yMax;

const hs = agrupar(horizontales, "py", "x1", "x2")
  .filter((l) => enRegion(l.x1, l.x2, l.y, l.y))
  .sort((a, b) => b.y - a.y);
const vs = agrupar(verticales, "px", "y1", "y2")
  .filter((l) => enRegion(l.x, l.x, l.y1, l.y2))
  .sort((a, b) => a.x - b.x);

console.log(`${file} — página ${wPt.toFixed(1)} x ${hPt.toFixed(1)} pt`);
if (region.length) console.log(`región: x ${xMin}–${xMax}, y ${yMin}–${yMax}`);

console.log(`\nLÍNEAS HORIZONTALES (${hs.length})`);
for (const l of hs) {
  console.log(
    `  y=${l.y.toFixed(1).padStart(7)}   x: ${l.x1.toFixed(1).padStart(6)} → ${l.x2
      .toFixed(1)
      .padStart(6)}   (ancho ${(l.x2 - l.x1).toFixed(1)}pt)`
  );
}

console.log(`\nLÍNEAS VERTICALES (${vs.length})`);
for (const l of vs) {
  console.log(
    `  x=${l.x.toFixed(1).padStart(7)}   y: ${l.y1.toFixed(1).padStart(6)} → ${l.y2
      .toFixed(1)
      .padStart(6)}   (alto ${(l.y2 - l.y1).toFixed(1)}pt)`
  );
}

if (hs.length && vs.length) {
  const x1 = Math.min(...hs.map((l) => l.x1), ...vs.map((l) => l.x));
  const x2 = Math.max(...hs.map((l) => l.x2), ...vs.map((l) => l.x));
  const y1 = Math.min(...vs.map((l) => l.y1), ...hs.map((l) => l.y));
  const y2 = Math.max(...vs.map((l) => l.y2), ...hs.map((l) => l.y));
  console.log(
    `\nCAJA ENVOLVENTE de lo detectado en la región:\n  { x: ${x1.toFixed(1)}, y: ${y1.toFixed(
      1
    )}, width: ${(x2 - x1).toFixed(1)}, height: ${(y2 - y1).toFixed(1)} }`
  );
}
