// Prueba de "hoy": que la app use el día de ECUADOR aunque el proceso corra en
// UTC, como en Vercel.
//
//   npm run test:hoy
//
// El proceso se pone en TZ=UTC (y se comprueba que de verdad quedó así) y el
// reloj se fija en tres instantes alrededor de la medianoche de Ecuador:
//
//   2026-10-16T04:00:00Z  → 23:00 del 15 en Ecuador → día 15
//   2026-10-16T04:59:59Z  → 23:59:59 del 15         → día 15
//   2026-10-16T05:00:00Z  → 00:00 del 16            → día 16
//
// En cada uno se comprueba lo que decide un día de calendario: el `hoyISO` que
// las páginas pasan a los formularios, la edad de ADR-003 (quien cumple 18 el
// 16 es menor el 15 y adulto el 16) y la FECHA IMPRESA EN LA RECETA, generando
// el PDF desde los datos iniciales de la consulta y leyendo su texto.
//
// Antes, contra la zona del proceso: el mismo reloj leído con `new Date()` y
// getters locales daba el 16 en los dos primeros instantes. Ese es el error que
// esta prueba existe para no dejar volver. Ver docs/arquitectura/Trampas-Recurrentes.md.

// TZ se fija ANTES de cargar cualquier módulo de la app: en ESM los `import`
// estáticos se evalúan antes que el cuerpo del archivo, y un módulo que
// calculara algo con la zona local al cargarse lo haría en la zona de la
// máquina. Por eso los módulos de la app se importan dinámicamente, abajo. Los
// `import type` se borran al compilar y no cargan nada.
process.env.TZ = "UTC";

import type { DatosPaciente } from "../lib/pacientes/formulario";
import type { ConsultaRow, PacienteRow } from "../lib/supabase/tipos";
import { instalarFetchDePublic, registrar } from "./ayudas";

const { hoyEnEcuador, hoyISOEnEcuador } = await import("../lib/fechas");
const { comoValorDeInput, requiereAcompanante } = await import("../lib/pacientes/formulario");
const { datosIniciales } = await import("../lib/consultas/formulario");
const { consultaParaPdf, pacienteParaPdf } = await import("../lib/consultas/pdf");
const { generateRecetaPdf } = await import("../lib/pdf");

function ok(cond: boolean, texto: string) {
  registrar(texto, cond);
}

// --- El entorno de la prueba es el de Vercel ---------------------------------
const zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
ok(zona === "UTC" || zona === "Etc/UTC", `el proceso corre en UTC (Intl: ${zona})`);
ok(new Date(2026, 9, 15).getTimezoneOffset() === 0, "los getters locales leen en UTC (offset 0)");

// --- Plantilla de la receta: stub de fetch para leer /public -----------------
instalarFetchDePublic();
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function textoDe(bytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const contenido = await (await doc.getPage(1)).getTextContent();
  return contenido.items.map((it) => ("str" in it ? it.str.trim() : "")).filter(Boolean);
}

// Paciente sintético. Su edad (40) y la falta de documento y de número de
// receta dejan fuera de la hoja cualquier "15" o "16" que no sea la fecha.
const paciente: PacienteRow = {
  id: "00000000-0000-0000-0000-000000000001",
  documento: null,
  tipo_documento: "cedula",
  nombre_completo: "PRUEBA RELOJ FIJO",
  fecha_nacimiento: "1986-03-03",
  sexo: "F",
  telefono: null,
  correo: null,
  domicilio: null,
  ocupacion: null,
  antecedentes_heredofamiliares: null,
  alergia_actual: null,
  nombre_acompanante: null,
  documento_acompanante: null,
  tipo_documento_acompanante: "cedula",
  correo_acompanante: null,
  telefono_acompanante: null,
  created_at: "2026-01-01T00:00:00Z",
  estado_civil: null,
};

// Quien cumple 18 el 16 de octubre de 2026, sin acompañante.
const cumple18el16 = { fecha_nacimiento: "2008-10-16" } as DatosPaciente;

const RELOJES = [
  { utc: "2026-10-16T04:00:00Z", ecuador: "23:00 del 15", dia: "2026-10-15" },
  { utc: "2026-10-16T04:59:59Z", ecuador: "23:59:59 del 15", dia: "2026-10-15" },
  { utc: "2026-10-16T05:00:00Z", ecuador: "00:00 del 16", dia: "2026-10-16" },
];

for (const reloj of RELOJES) {
  const ahora = new Date(reloj.utc);
  const diaNum = reloj.dia.slice(-2).replace(/^0/, "");
  const otroDia = diaNum === "15" ? "16" : "15";
  console.log(`\n--- Reloj ${reloj.utc} (${reloj.ecuador} en Ecuador) → ${reloj.dia} ---`);

  // Control: la zona del proceso da otra cosa en los dos primeros relojes.
  const delProceso = comoValorDeInput(ahora);
  if (reloj.dia !== delProceso) ok(true, `control: con la zona del proceso saldría ${delProceso} (el error que se evita)`);

  // hoyISO de las páginas
  const hoyISO = hoyISOEnEcuador(ahora);
  ok(hoyISO === reloj.dia, `hoyISOEnEcuador() = ${hoyISO}`);
  const hoy = hoyEnEcuador(ahora);
  ok(comoValorDeInput(hoy) === reloj.dia, `hoyEnEcuador() leído con getters locales = ${comoValorDeInput(hoy)}`);

  // Edad (ADR-003)
  const esDia16 = reloj.dia === "2026-10-16";
  const menor = requiereAcompanante(cumple18el16, hoy);
  ok(menor === !esDia16, `quien cumple 18 el 16 ${menor ? "todavía es menor (exige acompañante)" : "ya es adulto"}`);

  // Fecha impresa en la receta: datos iniciales de la consulta → PDF → texto
  const datos = datosIniciales({ hoyISO, paciente, ultimaConsulta: null });
  ok(datos.fecha === reloj.dia, `la consulta nueva arranca con fecha ${datos.fecha}`);
  const fila = {
    id: "00000000-0000-0000-0000-000000000002",
    paciente_id: paciente.id,
    fecha: datos.fecha,
    numero_receta: null,
    created_at: reloj.utc,
  } as unknown as ConsultaRow;
  const texto = await textoDe(await generateRecetaPdf(pacienteParaPdf(paciente, hoy), consultaParaPdf(fila), []));
  // La plantilla imprime día, mes con mayúscula ("Octubre") y año de 2 cifras.
  const tieneMes = texto.some((t) => t.toLowerCase() === "octubre");
  ok(texto.includes(diaNum) && tieneMes && texto.includes("26"),
    `la receta imprime el día ${diaNum} de octubre de (20)26`);
  ok(!texto.includes(otroDia), `la receta NO imprime el día ${otroDia}`);
}

