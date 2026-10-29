// Prueba de humo del módulo real lib/pdf/*: simula el `fetch` del navegador
// contra /public para poder ejecutar en Node vía tsx, sin servidor de por medio.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  generateHistorialPdf,
  generateRecetaPdf,
  ContenidoExcedeEspacioError,
  EDAD_NO_REGISTRADA_HISTORIAL,
  EDAD_NO_REGISTRADA_RECETA,
  RECOMENDACIONES_MAX_CHARS,
  recomendacionesCabenEnReceta,
  SIGNOS_ALARMA_MAX_LINEAS,
} from "../lib/pdf/index";
import type { Consulta, Paciente, RecetaMedicamento } from "../lib/pdf/types";
import { formatFecha, formatFechaPartes } from "../lib/pdf/format";
import { instalarFetchDePublic, registrar } from "./ayudas";

// Mismo lector que scripts/extract-text-positions.mjs, para comprobar qué
// quedó impreso de verdad en el PDF en vez de confiar en lo que se le pasó.
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

async function extraerTexto(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
}

const OUTPUT_DIR = path.join(process.cwd(), "scripts", "output");

instalarFetchDePublic();

const paciente: Paciente = {
  id: "p1",
  documento: "0923456701",
  nombreCompleto: "Ana Lucía Ejemplo Démo",
  fechaNacimiento: "1992-03-10",
  sexo: "F",
  estadoCivil: "Casada",
  telefono: "0991234567",
  domicilio: "Calle Ficticia 123, Ciudad Ejemplo",
  ocupacion: "Comerciante",
  antecedentesHeredoFamiliares:
    "Madre: hipertensión arterial diagnosticada a los 50 años. Padre: diabetes mellitus tipo 2, en tratamiento con metformina. Sin antecedentes oncológicos familiares conocidos.",
  esMenorDeEdad: false,
  // Fecha de la migración masiva desde el Sheet (RF-02) — a propósito NO es la
  // fecha de su primera consulta real, para probar que historial.ts ya no la usa.
  fechaCreacion: "2026-08-01",
};

const consulta: Consulta = {
  id: "c1",
  pacienteId: "p1",
  fecha: "2026-08-16",
  motivoConsulta:
    "Paciente acude por cefalea frontal de 3 días de evolución, sin fiebre ni náusea. Refiere mejoría parcial con analgésicos de venta libre.",
  alergias: "Penicilina",
  patologias: "Hipertensión arterial controlada",
  quirurgicos: "Apendicectomía (2015)",
  transfusionales: "Ninguno",
  // `pa` sigue siendo texto ("120/80" no es un número); las otras cuatro son
  // `numeric` en la base. `peso` era "65 kg": la unidad no es parte de la
  // medición y la base habría rechazado ese valor.
  exploracionFisica: { pa: "120/80", fc: 72, fr: 18, temperatura: 36.5, peso: 65 },
  impresionDiagnostica: "Cefalea tensional",
  codigoCie10: "G44.2",
  tratamiento: "Ibuprofeno 400mg cada 8 horas por 3 días",
  signosAlarma: "Fiebre alta o dificultad para respirar.",
  recomendacionesNoFarmacologicas:
    "Hidratación abundante con agua y líquidos claros. Reposo relativo durante 48 horas. Evitar exposición solar prolongada y cambios bruscos de temperatura.",
  numeroReceta: 941,
};

const medicamentos: RecetaMedicamento[] = [
  {
    id: "m1",
    consultaId: "c1",
    nombreGenerico: "Amoxicilina + Ácido Clavulánico",
    nombreComercial: "Augmentin 875/125mg",
    presentacion: "tableta",
    cantidad: 14,
    dosis: "875/125mg",
    viaAdministracion: "oral",
    frecuencia: "cada 12 horas",
    duracion: "7 días",
  },
  {
    id: "m2",
    consultaId: "c1",
    nombreGenerico: "Ibuprofeno",
    nombreComercial: "Ibuprofeno 400mg",
    presentacion: "tableta",
    cantidad: 9,
    dosis: "400mg",
    viaAdministracion: "oral",
    frecuencia: "cada 8 horas si hay dolor o fiebre",
    duracion: "máx. 3 días",
  },
  {
    id: "m3",
    consultaId: "c1",
    nombreGenerico: "Loratadina",
    nombreComercial: "Loratadina 10mg",
    presentacion: "tableta",
    cantidad: 7,
    dosis: "10mg",
    viaAdministracion: "oral",
    frecuencia: "cada 24 horas",
    duracion: "7 días",
  },
  {
    id: "m4",
    consultaId: "c1",
    nombreGenerico: "Omeprazol",
    nombreComercial: "Omeprazol 20mg",
    presentacion: "capsula",
    cantidad: 14,
    dosis: "20mg",
    viaAdministracion: "oral",
    frecuencia: "cada 24 horas en ayunas",
    duracion: "14 días",
  },
  {
    id: "m5",
    consultaId: "c1",
    nombreGenerico: "Paracetamol",
    nombreComercial: "Paracetamol 500mg",
    presentacion: "tableta",
    cantidad: 10,
    dosis: "500mg",
    viaAdministracion: "oral",
    frecuencia: "cada 8 horas si hay dolor o fiebre",
    duracion: "5 días",
  },
  {
    id: "m6",
    consultaId: "c1",
    nombreGenerico: "Salbutamol",
    nombreComercial: "Salbutamol inhalador",
    presentacion: "solucion_inyectable",
    cantidad: 1,
    dosis: "100mcg/puff",
    viaAdministracion: "inhalada",
    frecuencia: "2 puffs cada 6 horas si hay dificultad respiratoria",
    duracion: "según necesidad",
  },
  {
    id: "m7",
    consultaId: "c1",
    nombreGenerico: "Complejo B",
    nombreComercial: "Complejo B",
    presentacion: "ampolla",
    cantidad: 5,
    dosis: "1 ampolla",
    viaAdministracion: "intramuscular",
    frecuencia: "una vez al día",
    duracion: "5 días",
  },
];

// Simula lo que ya carga la pantalla de Historial Clínico para el timeline
// (RF-20): todas las consultas del paciente, de donde se toma la más antigua.
const fechasConsultasDelPaciente = ["2024-01-10", "2024-11-02", consulta.fecha];
const fechaPrimeraConsulta = new Date(
  Math.min(...fechasConsultasDelPaciente.map((f) => new Date(f).getTime()))
);

await mkdir(OUTPUT_DIR, { recursive: true });

const historialBytes = await generateHistorialPdf(paciente, consulta, fechaPrimeraConsulta);
await writeFile(path.join(OUTPUT_DIR, "historial-modulo.pdf"), historialBytes);

const recetaBytes = await generateRecetaPdf(paciente, consulta, medicamentos.slice(0, 4));
await writeFile(path.join(OUTPUT_DIR, "receta-modulo.pdf"), recetaBytes);

// --- 7 medicamentos: a tamaño legible fijo ya NO caben (antes se resolvía
// encogiendo la letra). Debe lanzar, no desbordar sobre "Signos de alarma". ---
// Antes de Vitest, los fallos de este archivo salían por console.error sin
// cambiar el código de salida: pasaban en silencio. Ahora cada uno es un test.
try {
  await generateRecetaPdf(paciente, consulta, medicamentos);
  registrar("7 medicamentos lanzan ContenidoExcedeEspacioError como se espera", false,
    "7 medicamentos debían exceder el espacio y no lo hicieron");
} catch (err) {
  // Un error de OTRO tipo es un test fallido, no un `throw` que tumbe la
  // recolección del archivo entero y esconda los demás resultados.
  if (err instanceof ContenidoExcedeEspacioError) {
    registrar(`7 medicamentos lanzan ContenidoExcedeEspacioError como se espera: ${err.message}`, true);
  } else {
    registrar("7 medicamentos lanzan ContenidoExcedeEspacioError como se espera", false, `lanzó otro error: ${err}`);
  }
}

// --- Paciente migrado sin fecha de nacimiento ni sexo (ADR-006) ---
// Así llega de Supabase: `null`, no cadena vacía (verificado contra la base:
// de 164 pacientes, 29 sin fecha de nacimiento y 164 sin sexo). Antes esto
// imprimía "56 años" —la época Unix— en el historial, una edad falsa pero
// creíble; ahora debe salir la raya en el historial y "No registrada" en la
// receta, sin romper el resto del documento.
const pacienteSinFechaNacimiento: Paciente = {
  ...paciente,
  id: "p2",
  nombreCompleto: "EJEMPLO DÉMO ROSA ELENA",
  documento: null,
  fechaNacimiento: null,
  sexo: null,
};

const historialSinFecha = await generateHistorialPdf(
  pacienteSinFechaNacimiento,
  consulta,
  fechaPrimeraConsulta
);
await writeFile(path.join(OUTPUT_DIR, "historial-sin-fecha-nacimiento.pdf"), historialSinFecha);

const recetaSinFecha = await generateRecetaPdf(
  pacienteSinFechaNacimiento,
  consulta,
  medicamentos.slice(0, 3)
);
await writeFile(path.join(OUTPUT_DIR, "receta-sin-fecha-nacimiento.pdf"), recetaSinFecha);

// Comprobación textual, además de la visual: ni "NaN" ni la edad de 1970.
const textoHistorial = await extraerTexto(historialSinFecha);
const textoReceta = await extraerTexto(recetaSinFecha);
for (const [nombre, texto, esperado] of [
  ["historial", textoHistorial, EDAD_NO_REGISTRADA_HISTORIAL],
  ["receta", textoReceta, EDAD_NO_REGISTRADA_RECETA],
] as const) {
  const problemas: string[] = [];
  if (texto.includes("NaN")) problemas.push('imprime "NaN"');
  // 56 = años transcurridos desde 1970, la edad falsa que salía con `null`.
  if (/\b56\b/.test(texto)) problemas.push('imprime "56" (edad calculada desde la época Unix)');
  if (!texto.includes(esperado)) problemas.push(`no imprime el marcador "${esperado}"`);
  registrar(
    `${nombre} sin fecha de nacimiento: marca "${esperado}", sin edad inventada`,
    problemas.length === 0,
    problemas.join("; ")
  );
}

// Un paciente con fecha sí debe seguir mostrando su edad real.
const edadReal = (await extraerTexto(historialBytes)).includes("34");
registrar("con fecha de nacimiento, el historial sigue imprimiendo la edad real (34)", edadReal,
  "se perdió el cálculo normal de la edad");

// --- Casos límite: texto justo en el máximo documentado debe pasar ---
const consultaEnElLimite: Consulta = {
  ...consulta,
  signosAlarma: "Fiebre alta, dificultad para respirar o dolor torácico.", // 55 chars (justo el límite)
  // Exactamente RECOMENDACIONES_MAX_CHARS (195). El texto anterior tenía 200
  // —por encima del techo medido de 198— y pasaba de casualidad, porque sus
  // palabras caían del lado bueno del ajuste de línea. Ver ADR-005.
  recomendacionesNoFarmacologicas:
    "Reposo relativo 48 horas. Hidratación abundante con agua y líquidos claros, evitando bebidas con cafeína. Evitar exposición solar directa y cambios bruscos de temperatura durante la recuperación.",
};

// El contador de caracteres y el ajuste real deben coincidir en el límite: si
// alguien sube RECOMENDACIONES_MAX_CHARS por encima de lo que cabe, esto lo
// caza aquí y no en la impresora de la doctora.
{
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const alLimite = consultaEnElLimite.recomendacionesNoFarmacologicas!;
  const coincideElConteo = alLimite.length === RECOMENDACIONES_MAX_CHARS;
  const cabeDeVerdad = recomendacionesCabenEnReceta(alLimite, helvetica);
  registrar(
    `un texto de exactamente ${RECOMENDACIONES_MAX_CHARS} caracteres cabe en los 3 renglones`,
    coincideElConteo && cabeDeVerdad,
    `texto de ${alLimite.length} chars (límite ${RECOMENDACIONES_MAX_CHARS}) — ${
      cabeDeVerdad ? "el conteo no coincide" : "NO cabe: el límite documentado es mayor que el espacio real"
    }`
  );
}
// Antes solo escribía el PDF y un fallo salía por console.error sin hacer
// fallar nada; ahora es un test (no tenía "OK" propio en la suite vieja).
try {
  const bytes = await generateRecetaPdf(paciente, consultaEnElLimite, medicamentos.slice(0, 2));
  await writeFile(path.join(OUTPUT_DIR, "receta-limite.pdf"), bytes);
  registrar("la receta con signos y recomendaciones justo en el límite se genera", true);
} catch (err) {
  registrar("la receta con signos y recomendaciones justo en el límite se genera", false, String(err));
}

// --- Recalibración: "Signos de alarma" con 2 renglones (ADR-005) ---
// El texto que antes NO cabía en un renglón ahora debe caber en dos.
const consultaSignosDosLineas: Consulta = {
  ...consulta,
  signosAlarma: "Fiebre alta por más de 48 horas, dificultad para respirar o dolor torácico intenso.",
};
const descripcionDosLineas = `"Signos de alarma" de ${consultaSignosDosLineas.signosAlarma!.length} chars cabe en ${SIGNOS_ALARMA_MAX_LINEAS} renglones`;
try {
  const bytes = await generateRecetaPdf(paciente, consultaSignosDosLineas, medicamentos.slice(0, 3));
  await writeFile(path.join(OUTPUT_DIR, "receta-signos-2-lineas.pdf"), bytes);
  registrar(descripcionDosLineas, true);
} catch (err) {
  registrar(descripcionDosLineas, false, `debería caber en dos renglones — ${err}`);
}

// --- Historial: "Impresión Diagnóstica" y "Tratamiento" con wrap (ADR-007) ---
const consultaTextosLargos: Consulta = {
  ...consulta,
  impresionDiagnostica:
    "Faringoamigdalitis aguda bacteriana con adenopatía cervical reactiva, sin compromiso respiratorio",
  tratamiento:
    "Amoxicilina con ácido clavulánico 875/125mg vía oral cada 12 horas por 7 días. Ibuprofeno 400mg cada 8 horas si hay dolor o fiebre. Control en 72 horas o antes si empeora.",
};
const descripcionTextosLargos =
  "historial: impresión diagnóstica y tratamiento se ajustan completos en varias líneas";
try {
  const bytes = await generateHistorialPdf(paciente, consultaTextosLargos, fechaPrimeraConsulta);
  await writeFile(path.join(OUTPUT_DIR, "historial-textos-largos.pdf"), bytes);
  const texto = await extraerTexto(bytes);
  const completo =
    texto.includes("adenopatía cervical reactiva") && texto.includes("Control en 72 horas");
  registrar(descripcionTextosLargos, completo, "se perdió texto al ajustar en el historial");
} catch (err) {
  registrar(descripcionTextosLargos, false, `estos textos deberían caber — ${err}`);
}

// Y si se pasan del espacio medido, deben lanzar, no desbordarse sobre la
// etiqueta de abajo ni salirse de la hoja.
for (const [campo, consultaExcedida] of [
  [
    "Impresión Diagnóstica",
    {
      ...consulta,
      impresionDiagnostica:
        "Faringoamigdalitis aguda bacteriana con adenopatía cervical reactiva bilateral dolorosa, sin compromiso respiratorio ni signos de dificultad ventilatoria, en paciente con antecedente de hipertensión arterial controlada y alergia documentada a penicilinas",
    },
  ],
  [
    "Tratamiento",
    {
      ...consulta,
      tratamiento:
        "Amoxicilina con ácido clavulánico 875/125mg vía oral cada 12 horas por 7 días, tomar con alimentos. Ibuprofeno 400mg cada 8 horas si hay dolor o fiebre, máximo 3 días. Omeprazol 20mg en ayunas por 14 días. Loratadina 10mg cada 24 horas por 7 días. Control en 72 horas o antes si empeora el cuadro.",
    },
  ],
] as const) {
  const descripcion = `"${campo}" excedido lanza ContenidoExcedeEspacioError`;
  try {
    await generateHistorialPdf(paciente, consultaExcedida as Consulta, fechaPrimeraConsulta);
    registrar(descripcion, false, `"${campo}" excedido debía lanzar y no lo hizo`);
  } catch (err) {
    registrar(descripcion, err instanceof ContenidoExcedeEspacioError, `lanzó otro error: ${err}`);
  }
}

// --- Caso que debe lanzar ContenidoExcedeEspacioError, no truncar con "…" ---
const consultaExcedida: Consulta = {
  ...consulta,
  signosAlarma:
    "Fiebre alta persistente por más de 48 horas, dificultad respiratoria progresiva, dolor abdominal intenso, erupción cutánea extensa o pérdida de conciencia.",
};
try {
  await generateRecetaPdf(paciente, consultaExcedida, medicamentos.slice(0, 2));
  registrar("lanzó ContenidoExcedeEspacioError como se esperaba", false,
    "debía lanzar ContenidoExcedeEspacioError y no lo hizo");
} catch (err) {
  if (err instanceof ContenidoExcedeEspacioError) {
    registrar(`lanzó ContenidoExcedeEspacioError como se esperaba: ${err.message}`, true);
  } else {
    registrar("lanzó ContenidoExcedeEspacioError como se esperaba", false, `lanzó otro error: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Fechas impresas: el huso horario NO puede correr un día (Fase 3)
// ---------------------------------------------------------------------------
// `new Date("2026-08-21")` es medianoche UTC y `getDate()` lee en local: en
// Ecuador (UTC-5) la fecha retrocedia al 20. La receta salio impresa con la
// fecha del dia anterior, y una receta es un documento legal que ejecuta un
// farmaceutico. Se descubrio generando el PDF de una consulta real, no
// compilando: ninguna prueba miraba la fecha impresa.
{
  const partes = formatFechaPartes("2026-08-21");
  registrar(
    "la receta imprime el dia 21 para 2026-08-21, no el 20",
    partes.dia === "21" && partes.mes === "Agosto" && partes.anio2 === "26",
    `la receta corrio la fecha un dia — ${JSON.stringify(partes)}`
  );

  const largo = formatFecha("2026-01-01");
  registrar(
    "el historial imprime 01/01/2026, sin depender de los locales del entorno",
    largo === "01/01/2026",
    `formatFecha devolvio "${largo}"`
  );

  const vacio = formatFecha("no-es-fecha");
  registrar(
    "una fecha ilegible imprime vacio, nunca 'Invalid Date' sobre la plantilla",
    vacio === "",
    `formatFecha devolvio "${vacio}"`
  );
}
