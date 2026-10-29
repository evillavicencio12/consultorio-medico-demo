// scripts/calibrar-limites-pdf.mjs
//
// De dónde salen los números de caracteres de ADR-005 (receta) y ADR-007
// (historial). Uso:  node scripts/calibrar-limites-pdf.mjs
//
// Prueba MUCHOS textos de cada longitud contra el ajuste de línea real
// (métricas de Helvetica, mismo algoritmo que lib/pdf/text.ts) y reporta la
// última longitud que cabe SIEMPRE. Un solo texto de ejemplo que cabe no
// demuestra nada: así se coló el antiguo límite de 200 en "Recomendaciones",
// que estaba por encima del techo real de 198.
//
// Los anchos, renglones y tamaños de aquí deben coincidir con
// lib/pdf/receta-limits.ts y lib/pdf/historial-limits.ts. Si se recalibra una
// plantilla física, se cambian en ambos lados.
import { PDFDocument, StandardFonts } from "pdf-lib";

const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

function wrapText(text, font, size, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Vocabulario real de estos campos.
const TIPICO =
  "reposo relativo hidratacion abundante con agua y liquidos claros evitar exposicion solar prolongada dieta blanda sin grasas ni condimentos no consumir alcohol ni tabaco dormir al menos ocho horas usar ropa ligera control de peso caminar treinta minutos al dia lavado de manos frecuente evitar cambios bruscos de temperatura fiebre alta dificultad para respirar dolor toracico vomito persistente".split(
    " "
  );

// Peor caso realista: solo palabras clínicas largas.
const LARGO =
  "antiinflamatorios gastrointestinales corticoesteroides contraindicaciones recomendaciones inmunosupresores hipersensibilidad broncodilatadores descongestionantes gastroenterologia faringoamigdalitis hipercolesterolemia".split(
    " "
  );

function generar(pool, largoObjetivo, semilla) {
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  let texto = "";
  while (texto.length < largoObjetivo) {
    const w = pool[Math.floor(rnd() * pool.length)];
    texto = texto ? `${texto} ${w}` : w;
  }
  return texto.slice(0, largoObjetivo).trim();
}

function techo(pool, { ancho, lineas, size }, desde, hasta) {
  let ultimo = 0;
  for (let largo = desde; largo <= hasta; largo++) {
    let todas = true;
    for (let semilla = 1; semilla <= 400; semilla++) {
      if (wrapText(generar(pool, largo, semilla), font, size, ancho).length > lineas) {
        todas = false;
        break;
      }
    }
    if (todas) ultimo = largo;
    else break;
  }
  return ultimo;
}

// Cada zona, con las medidas reales tomadas de la plantilla con
// scripts/medir-lineas-plantilla.mjs.
const ZONAS = [
  { nombre: "RECETA · Signos de alarma", ancho: 201, lineas: 2, size: 7.5, desde: 60 },
  { nombre: "RECETA · Recomendaciones", ancho: 250, lineas: 3, size: 7.5, desde: 120 },
  { nombre: "RECETA · Renglón de medicamento (Rp)", ancho: 250, lineas: 1, size: 7.5, desde: 40 },
  { nombre: "HISTORIAL · Impresión Diagnóstica", ancho: 345, lineas: 2, size: 9.5, desde: 80 },
  { nombre: "HISTORIAL · Tratamiento", ancho: 345, lineas: 3, size: 9.5, desde: 120 },
  // Medidos en la Fase 4B: campos que estaban SIN límite o sin comprobar.
  { nombre: "HISTORIAL · Padecimiento Actual", ancho: 505, lineas: 3, size: 9.5, desde: 180 },
  { nombre: "HISTORIAL · Heredo Familiares", ancho: 490, lineas: 3, size: 9.5, desde: 180 },
  { nombre: "HISTORIAL · Alergias", ancho: 420, lineas: 2, size: 10, desde: 80 },
  { nombre: "HISTORIAL · Patologías", ancho: 400, lineas: 2, size: 10, desde: 80 },
  { nombre: "HISTORIAL · Quirúrgicos", ancho: 395, lineas: 2, size: 10, desde: 80 },
  { nombre: "HISTORIAL · Transfusionales", ancho: 380, lineas: 2, size: 10, desde: 80 },
  { nombre: "HISTORIAL · Domicilio", ancho: 360, lineas: 2, size: 9, desde: 80 },
  { nombre: "HISTORIAL · Ocupación", ancho: 155, lineas: 2, size: 10, desde: 20 },
  { nombre: "HISTORIAL · Teléfono", ancho: 115, lineas: 2, size: 10, desde: 20 },
  { nombre: "HISTORIAL · Estado civil", ancho: 140, lineas: 2, size: 10, desde: 20 },
];

console.log("Techo de caracteres que cabe SIEMPRE (400 textos por longitud)\n");
console.log(
  `${"zona".padEnd(36)} ${"geometría".padEnd(22)} ${"típico".padStart(7)} ${"largas".padStart(7)}  sugerido`
);
for (const z of ZONAS) {
  const geo = `${z.lineas}×${z.ancho}pt @ ${z.size}pt`;
  const t = techo(TIPICO, z, z.desde, z.desde + 400);
  const l = techo(LARGO, z, z.desde, z.desde + 400);
  // Se propone el techo típico con un pequeño margen: el peor caso de palabras
  // largas lo cubre la función de ajuste, no el contador.
  const sugerido = Math.floor((t - 3) / 5) * 5;
  console.log(
    `${z.nombre.padEnd(36)} ${geo.padEnd(22)} ${String(t).padStart(7)} ${String(l).padStart(7)}  ${sugerido}`
  );
}
