// El salto de línea que tumbaba la aplicación, cerrado en sus dos capas.
//
// EL FALLO, tal como se reprodujo: un Shift+Enter dentro de "Tratamiento" mete
// un `\n` de verdad. pdf-lib codifica en WinAnsi y LANZA ante ese carácter desde
// `font.widthOfTextAtSize()` — o sea desde `wrapText`, que es justo lo que llama
// el contador en vivo en cada tecla. Resultado: Runtime Error a pantalla
// completa, no un mensaje de validación. Un pegado desde Word hace lo mismo con
// `\r\n` y con tabuladores, y ahí no hay tecla que interceptar.
//
// Al revisarlo apareció que la clase era más ancha que el salto de línea: `≥` y
// `→` —que sí se teclean en prosa clínica ("fiebre ≥ 38")— lanzan igual.
//
// Lo que comprueba este archivo:
//   1. `lib/texto-plano.ts`, las dos funciones, incluido que NO estropee lo que
//      alguien escribe a mano (espacios dobles, espacio final).
//   2. Que el repertorio que este código declara imprimible sea el que pdf-lib
//      acepta de verdad — carácter a carácter, no de palabra.
//   3. Que `wrapText` y `drawText` ya no puedan lanzar, venga lo que venga.
//   4. El caso real de punta a punta: el contador en vivo y el PDF de verdad,
//      con un texto pegado desde Word.
//
//   npm run test:texto-plano
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { aLineaUnica, aTextoImprimible, traeSaltosDeLinea } from "../lib/texto-plano";
import { drawText, wrapText } from "../lib/pdf/text";
import {
  impresionDiagnosticaCabeEnHistorial,
  tratamientoCabeEnHistorial,
} from "../lib/pdf/historial-limits";
import {
  recomendacionesCabenEnReceta,
  signosAlarmaCabenEnReceta,
} from "../lib/pdf/receta-limits";
import { generateHistorialPdf } from "../lib/pdf/historial";
import {
  contadorTratamiento,
  validarConsulta,
  DATOS_VACIOS,
} from "../lib/consultas/formulario";
import type { Consulta, Paciente } from "../lib/pdf/types";
import { cierto, comprobar, instalarFetchDePublic } from "./ayudas";

/** Devuelve el mensaje si lanzó, o `null` si no. */
function loQueLanzo(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);

/** Lo que sale de pegar dos renglones de Word en un campo. */
const PEGADO_DE_WORD = "Amoxicilina 500 mg cada 8 h por 7 días.\r\nParacetamol 1 g si fiebre.";
const CON_SHIFT_ENTER = "Amoxicilina 500 mg cada 8 h por 7 días.\nParacetamol 1 g si fiebre.";
const UNIDA = "Amoxicilina 500 mg cada 8 h por 7 días. Paracetamol 1 g si fiebre.";

// ---------------------------------------------------------------------------
console.log("--- aLineaUnica: la capa del formulario ---");
// ---------------------------------------------------------------------------

comprobar("Shift+Enter se convierte en un espacio", aLineaUnica(CON_SHIFT_ENTER), UNIDA);
comprobar("un pegado de Word (\\r\\n), igual", aLineaUnica(PEGADO_DE_WORD), UNIDA);
comprobar("un \\r suelto (Mac clásico), igual", aLineaUnica("Uno.\rDos."), "Uno. Dos.");
comprobar("varios saltos seguidos son UN espacio", aLineaUnica("Uno.\n\n\nDos."), "Uno. Dos.");
comprobar(
  "el espacio que rodea al salto se absorbe: nunca quedan dobles",
  aLineaUnica("Uno. \n Dos."),
  "Uno. Dos."
);
comprobar("el tabulador también separa", aLineaUnica("Uno.\tDos."), "Uno. Dos.");
comprobar("y el separador de línea de Word (U+2028)", aLineaUnica("Uno.\u2028Dos."), "Uno. Dos.");
comprobar(
  "un espacio, no cadena vacía: si no, wrapText no tendría dónde cortar",
  aLineaUnica("mg.\nParacetamol").includes("mg. Paracetamol"),
  true
);
comprobar(
  "los caracteres de control invisibles se van del todo",
  aLineaUnica("Amoxi\u0007cilina"),
  "Amoxicilina"
);

// Lo que NO debe tocar: esta función corre en cada pulsación.
comprobar("no se come el espacio recién tecleado", aLineaUnica("Amoxicilina "), "Amoxicilina ");
comprobar("no colapsa los espacios dobles escritos a mano", aLineaUnica("Uno.  Dos."), "Uno.  Dos.");
comprobar("no recorta los extremos", aLineaUnica("  Uno.  "), "  Uno.  ");
comprobar("un texto limpio sale idéntico", aLineaUnica(UNIDA), UNIDA);
cierto("y el formulario puede saber si había algo que quitar", traeSaltosDeLinea(CON_SHIFT_ENTER));
cierto("sin dar falsos positivos", !traeSaltosDeLinea(UNIDA));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "los símbolos clínicos se traducen, no se borran: significan algo",
  aTextoImprimible("Volver si fiebre ≥ 38 °C"),
  "Volver si fiebre >= 38 °C"
);
comprobar("≤ también", aTextoImprimible("FC ≤ 60"), "FC <= 60");
comprobar("y las flechas de una evolución", aTextoImprimible("Control → 72 h"), "Control -> 72 h");
comprobar(
  "lo que no se puede traducir queda como '?': borrarlo dejaría un dato falso completo",
  aTextoImprimible("Fiebre ☃ alta"),
  "Fiebre ? alta"
);
comprobar(
  "las comillas y el guion largo de Word se imprimen tal cual",
  aTextoImprimible("“Faringitis” — aguda"),
  "“Faringitis” — aguda"
);
comprobar("las tildes y la eñe, por supuesto", aTextoImprimible("Niña con migraña"), "Niña con migraña");
comprobar(
  "el espacio duro se vuelve un espacio normal, para poder cortar ahí",
  aTextoImprimible("38\u00a0°C"),
  "38 °C"
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Que `esImprimible` diga la verdad no puede ser una afirmación de confianza: se
// contrasta contra pdf-lib carácter a carácter. Si algún día cambia la
// codificación de las plantillas, esta prueba lo dice antes que un paciente.

const sospechosos =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCXYZ[\\]^_`abcxyz{|}~" +
  "¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÄÇÉÍÑÓÖÚÜßàáäçéíñóöúü÷ÿ" +
  "€‚ƒ„…†‡ˆ‰Š‹Œ‘’“”•–—˜™š›œŸ";

const rechazados = [...sospechosos].filter(
  (c) => loQueLanzo(() => font.widthOfTextAtSize(aTextoImprimible(c), 9.5)) !== null
);
comprobar(
  `los ${sospechosos.length} caracteres que el código da por imprimibles lo son`,
  rechazados,
  []
);

// Y al revés: los que NO están en el repertorio no deben colarse sin traducir.
const problematicos = ["\n", "\r", "\t", "\u2028", "\u00a0", "≥", "≤", "→", "≠", "☃", "😀", "\u0000"];
const cuelan = problematicos.filter(
  (c) => loQueLanzo(() => font.widthOfTextAtSize(aTextoImprimible(c), 9.5)) !== null
);
comprobar("ninguno de los problemáticos hace lanzar tras sanear", cuelan, []);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

comprobar(
  "wrapText con un Shift+Enter: antes lanzaba WinAnsi cannot encode",
  loQueLanzo(() => wrapText(CON_SHIFT_ENTER, font, 9.5, 345)),
  null
);
comprobar(
  "y con lo peor que puede traer un pegado",
  loQueLanzo(() => wrapText("A\r\n\tB ≥ C   D 😀", font, 9.5, 345)),
  null
);
comprobar(
  "el salto además da dónde cortar: el ajuste usa las dos frases",
  wrapText(CON_SHIFT_ENTER, font, 9.5, 200).length >= 2,
  true
);
cierto(
  "y no quedan dos frases pegadas en una sola palabra",
  !wrapText(CON_SHIFT_ENTER, font, 9.5, 345).some((l) => l.includes("días.Paracetamol"))
);

const pagina = doc.addPage();
comprobar(
  "drawText tampoco",
  loQueLanzo(() => drawText(pagina, font, "Uno.\nDos. ≥ 38", 50, 50)),
  null
);
comprobar(
  "un texto que era SOLO un salto no dibuja nada",
  loQueLanzo(() => drawText(pagina, font, "\n", 50, 50)),
  null
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Son las que llama el contador en vivo, o sea las que se ejecutaban en cada
// tecla mientras la doctora escribía. Aquí es donde se caía la pantalla.

for (const [nombre, fn] of [
  ["tratamiento (historial)", () => tratamientoCabeEnHistorial(CON_SHIFT_ENTER, font)],
  [
    "impresión diagnóstica (historial)",
    () => impresionDiagnosticaCabeEnHistorial("Faringitis\naguda", "J029", font),
  ],
  ["signos de alarma (receta)", () => signosAlarmaCabenEnReceta("Fiebre ≥ 38\nDisnea", font)],
  [
    "recomendaciones no farmacológicas (receta)",
    () => recomendacionesCabenEnReceta("Reposo.\r\nLíquidos.", font),
  ],
] as const) {
  comprobar(`${nombre}: mide sin lanzar`, loQueLanzo(fn), null);
}

comprobar(
  "el contador en vivo cuenta el texto ya unido, que es lo que se imprime",
  contadorTratamiento({ ...DATOS_VACIOS, tratamiento: CON_SHIFT_ENTER }, font).excedido,
  false
);
comprobar(
  "y la validación del formulario no lanza con un texto pegado de Word",
  loQueLanzo(() =>
    validarConsulta(
      {
        ...DATOS_VACIOS,
        fecha: "2026-08-22",
        motivo_consulta: "Odinofagia.",
        impresion_diagnostica: "Faringitis aguda",
        tratamiento: PEGADO_DE_WORD,
      },
      { hoy: new Date(2026, 7, 22), font }
    )
  ),
  null
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const OUTPUT_DIR = path.join(process.cwd(), "scripts", "output");

instalarFetchDePublic();

const paciente: Paciente = {
  id: "p1",
  nombreCompleto: "PACIENTE DE PRUEBA",
  documento: "0923456701",
  fechaNacimiento: "1992-03-10",
  sexo: "F",
  estadoCivil: "Casada",
  telefono: "0991234567",
  domicilio: "Av. Siempre Viva 742",
  ocupacion: "Docente",
  antecedentesHeredoFamiliares: "Madre con HTA.\nPadre con DM2.",
  esMenorDeEdad: false,
  fechaCreacion: "2026-08-18T00:00:00Z",
};

const consulta: Consulta = {
  id: "c1",
  pacienteId: "p1",
  fecha: "2026-08-22",
  motivoConsulta: "Odinofagia y fiebre de dos días.\r\nSin tos.",
  alergias: "Penicilina\t— rash",
  exploracionFisica: { pa: "120/80", temperatura: 38.2 },
  impresionDiagnostica: "Faringoamigdalitis aguda",
  codigoCie10: "J029",
  tratamiento: PEGADO_DE_WORD,
};

const bytes = await generateHistorialPdf(paciente, consulta, new Date(2026, 0, 10));
await writeFile(path.join(OUTPUT_DIR, "historial-texto-pegado.pdf"), bytes);
console.log("generado: scripts/output/historial-texto-pegado.pdf");

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const documento = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
const contenido = await (await documento.getPage(1)).getTextContent();
const impreso = contenido.items.map((it) => ("str" in it ? it.str : "")).join(" ");

cierto("el PDF se genera con texto pegado desde Word", bytes.length > 0);
cierto("y el tratamiento sale entero, en una sola frase", impreso.includes("Paracetamol 1 g si fiebre"));
cierto("con las dos frases separadas por un espacio", !impreso.includes("días.Paracetamol"));
cierto("el motivo también", impreso.includes("Sin tos"));
cierto("y los antecedentes heredofamiliares de la ficha", impreso.includes("Padre con DM2"));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Reportado al pegar en 'Motivo de consulta': el símbolo pegado no se veía ni
// como >= ni como un ≥ limpio. El diagnóstico, con puntos de código y no de
// vista: la capa 1 deja el carácter INTACTO —traducir es cosa del PDF, no del
// campo— así que lo que se veía era el carácter pegado de verdad, con el glifo
// que le diera la fuente. Lo que sí estaba mal era lo que llegaba al papel.
//
// Cada fila es: lo pegado -> lo que queda en el campo -> lo que se imprime.

function codigos(texto: string): string {
  return [...texto]
    .map((c) => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
    .join(" ");
}

const VARIANTES: { nombre: string; pegado: string; campo: string; papel: string }[] = [
  { nombre: "≥ estándar (U+2265)", pegado: "\u2265", campo: "\u2265", papel: ">=" },
  { nombre: "≧ de Word (U+2267)", pegado: "\u2267", campo: "\u2267", papel: ">=" },
  { nombre: "⩾ (U+2A7E)", pegado: "\u2A7E", campo: "\u2A7E", papel: ">=" },
  { nombre: "≤ y sus primos (U+2266)", pegado: "\u2266", campo: "\u2266", papel: "<=" },
  // La barra combinable es lo que INVIERTE el significado: antes se perdía en
  // un "?" suelto y "no mayor o igual" se imprimía ">=?".
  // En el campo se COMPONE (U+2265 U+0338 -> U+2271): la capa 1 normaliza a
  // NFC, así que deja de ser una letra con una barra encima —el glifo raro que
  // se reportó— y pasa a ser un carácter de verdad, que además cuenta uno.
  { nombre: "≥ + barra combinable (U+2265 U+0338)", pegado: "\u2265\u0338", campo: "\u2271", papel: "no >=" },
  { nombre: "≱ precompuesto (U+2271)", pegado: "\u2271", campo: "\u2271", papel: "no >=" },
  // Invisibles: no se ven en el campo, pero contaban para el contador y
  // acababan en un "?" perfectamente visible sobre el papel.
  { nombre: "≥ + selector de variación (U+FE0F)", pegado: "\u2265\uFE0F", campo: "\u2265", papel: ">=" },
  { nombre: "≥ + ancho cero (U+200B)", pegado: "\u2265\u200B", campo: "\u2265", papel: ">=" },
  { nombre: "≥ + BOM (U+FEFF)", pegado: "\u2265\uFEFF", campo: "\u2265", papel: ">=" },
];

for (const v of VARIANTES) {
  const enCampo = aLineaUnica(v.pegado);
  const enPapel = aTextoImprimible(v.pegado);
  comprobar(
    `${v.nombre}: queda en el campo como ${codigos(v.campo)}`,
    codigos(enCampo),
    codigos(v.campo)
  );
  comprobar(`${v.nombre}: se imprime ${JSON.stringify(v.papel)}`, enPapel, v.papel);
  comprobar(
    `${v.nombre}: y no hace lanzar a pdf-lib`,
    loQueLanzo(() => wrapText("Fiebre " + enCampo + " 38", font, 9.5, 345)),
    null
  );
}

// El guion suave de Word: invisible en pantalla, pero pdf-lib lo DIBUJA como un
// guion de verdad, así que "antiinflamatorio" salía impreso partido.
comprobar(
  "el guion suave de Word desaparece en vez de imprimirse",
  aTextoImprimible("anti\u00adinflamatorio"),
  "antiinflamatorio"
);

// El otro agujero de la misma clase, y el que más iba a doler: en castellano.
comprobar(
  "una ñ descompuesta se compone, en vez de imprimirse migran?a",
  aTextoImprimible("migran\u0303a"),
  "migraña"
);
comprobar(
  "y una í descompuesta ya cuenta como UN carácter en el contador",
  aLineaUnica("d\u0069\u0301as").length,
  "días".length
);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Esta es la comprobación que mira al futuro: la receta de la sesión siguiente
// trae "Signos de alarma" y "Recomendaciones no Farmacológicas", que son otras
// dos áreas de texto medidas con `wrapText` (ADR-005). Si alguien escribe un
// <textarea> nuevo y se olvida del hook, esto lo dice aquí y no en la cara de
// la doctora.
//
// Es una prueba sobre el CÓDIGO FUENTE, igual que la del armazón de pantalla:
// no hay forma de ver un manejador de eventos en el HTML renderizado.

async function archivosTsx(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const encontrados: string[] = [];
  for (const entrada of entradas) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...(await archivosTsx(completo)));
    else if (entrada.name.endsWith(".tsx")) encontrados.push(completo);
  }
  return encontrados;
}

const conTextarea: string[] = [];
const sinElHook: string[] = [];
for (const archivo of await archivosTsx(path.join(process.cwd(), "app"))) {
  const fuente = await readFile(archivo, "utf8");
  if (!fuente.includes("<textarea")) continue;
  conTextarea.push(path.relative(process.cwd(), archivo));
  if (!fuente.includes("useTextoPlano")) sinElHook.push(path.relative(process.cwd(), archivo));
}

cierto(`hay ${conTextarea.length} pantalla(s) con area de texto`, conTextarea.length > 0);
comprobar("todas pasan por useTextoPlano", sinElHook, []);


