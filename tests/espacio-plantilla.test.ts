// Ningún campo puede invadir a su vecino en la hoja (ADR-007, alcance ampliado).
//
// Una plantilla física es una hoja de tamaño fijo con secciones que se suceden:
// NO existe un campo "sin límite". Hasta la Fase 4B dos lo eran en el código
// —"Padecimiento Actual" y "Antecedentes Heredo Familiares"— y al cuarto
// renglón se dibujaban encima del título de la sección siguiente. La receta
// tenía lo mismo por el lado del ancho: un renglón de medicamento con un
// genérico real del catálogo (324pt contra 250) se imprimía sobre la mitad que
// se lleva el paciente.
//
// Esta prueba comprueba las dos direcciones: que pasarse LANCE, y que justo en
// el límite se imprima entero sin tocar a ningún vecino — leyendo las
// posiciones del PDF de verdad, no confiando en el cálculo.
//
//   npm run test:espacio
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { generateHistorialPdf } from "../lib/pdf/historial";
import { generateRecetaPdf } from "../lib/pdf/receta";
import { ContenidoExcedeEspacioError } from "../lib/pdf/text";
import {
  HEREDOFAMILIARES_MAX_CHARS, MOTIVO_MAX_CHARS, ANTECEDENTES_PATOLOGICOS,
} from "../lib/pdf/historial-limits";
import type { Consulta, Paciente, RecetaMedicamento } from "../lib/pdf/types";
import { instalarFetchDePublic, registrar } from "./ayudas";

instalarFetchDePublic();

const prosa = (n: number) => {
  const v = "reposo relativo hidratacion abundante evitar exposicion solar dieta blanda sin grasas control en setenta y dos horas fiebre alta dificultad respiratoria dolor toracico vomito persistente odinofagia progresiva adenopatias cervicales dolorosas bilaterales".split(" ");
  let t = ""; let i = 0;
  while (t.length < n) { t = t ? `${t} ${v[i % v.length]}` : v[0]; i++; }
  return t.slice(0, n).trim();
};

const paciente = (extra: Partial<Paciente> = {}): Paciente => ({
  id: "p1", nombreCompleto: "PACIENTE DE PRUEBA", documento: "0912345675",
  fechaNacimiento: "1990-04-12", sexo: "F", esMenorDeEdad: false,
  fechaCreacion: "2026-08-18T00:00:00Z", ...extra,
});
const consulta = (extra: Partial<Consulta> = {}): Consulta => ({
  id: "c1", pacienteId: "p1", fecha: "2026-08-22", exploracionFisica: {},
  impresionDiagnostica: "Faringoamigdalitis aguda", codigoCie10: "J029", ...extra,
});

const ver = (d: string, ok: boolean) => registrar(d, ok);

async function lanza(d: string, fn: () => Promise<unknown>) {
  try { await fn(); ver(d, false); }
  catch (e) { ver(d + " → " + (e as Error).message.slice(0, 60) + "…", e instanceof ContenidoExcedeEspacioError); }
}
async function noLanza(d: string, fn: () => Promise<Uint8Array>) {
  try { const b = await fn(); ver(d, b.length > 0); return b; }
  catch (e) { ver(d + " (lanzó: " + (e as Error).message.slice(0, 50) + ")", false); return null; }
}

console.log("--- Pasado el límite: el PDF se niega, ya no dibuja encima ---");
await lanza("motivo de consulta con 400 caracteres",
  () => generateHistorialPdf(paciente(), consulta({ motivoConsulta: prosa(400) }), new Date(2026, 7, 22)));
await lanza("antecedentes heredofamiliares con 400",
  () => generateHistorialPdf(paciente({ antecedentesHeredoFamiliares: prosa(400) }), consulta(), new Date(2026, 7, 22)));
for (const campo of Object.keys(ANTECEDENTES_PATOLOGICOS) as (keyof typeof ANTECEDENTES_PATOLOGICOS)[]) {
  await lanza(`antecedente "${campo}" con 300`,
    () => generateHistorialPdf(paciente(), consulta({ [campo]: prosa(300) }), new Date(2026, 7, 22)));
}
await lanza("domicilio con 300", () => generateHistorialPdf(paciente({ domicilio: prosa(300) }), consulta(), new Date(2026, 7, 22)));

const medicamento = (extra: Partial<RecetaMedicamento> = {}): RecetaMedicamento => ({
  id: "m1", consultaId: "c1", nombreGenerico: "amoxicilina", nombreComercial: "AMOXIFAR",
  presentacion: "tableta", viaAdministracion: "oral", cantidad: 14,
  dosis: "1 tableta", frecuencia: "cada 12 horas", duracion: "7 dias", ...extra,
});
await lanza("renglón Rp con un genérico real largo del catálogo",
  () => generateRecetaPdf(paciente(), consulta({ numeroReceta: 1 }),
    [medicamento({ nombreGenerico: "betametasona + clotrimazol + gentamicina",
      presentacion: "solucion_inyectable", cantidad: 30, dosis: "aplicar capa fina" })]));
await lanza("nombre de paciente larguísimo en la receta",
  () => generateRecetaPdf(paciente({ nombreCompleto: "PACIENTE FICTICIO DE PRUEBA CON UN NOMBRE LARGUISIMO PARA LA HOJA" }),
    consulta({ numeroReceta: 1 }), [medicamento()]));
const bytes = await noLanza(`historial con ${MOTIVO_MAX_CHARS} de motivo y ${HEREDOFAMILIARES_MAX_CHARS} de heredofamiliares`,
  () => generateHistorialPdf(
    paciente({ antecedentesHeredoFamiliares: prosa(HEREDOFAMILIARES_MAX_CHARS) }),
    consulta({ motivoConsulta: prosa(MOTIVO_MAX_CHARS),
      alergias: prosa(ANTECEDENTES_PATOLOGICOS.alergias.maxChars),
      patologias: prosa(ANTECEDENTES_PATOLOGICOS.patologias.maxChars),
      quirurgicos: prosa(ANTECEDENTES_PATOLOGICOS.quirurgicos.maxChars),
      transfusionales: prosa(ANTECEDENTES_PATOLOGICOS.transfusionales.maxChars) }),
    new Date(2026, 7, 22)));

if (bytes) {
  await writeFile(path.join("scripts", "output", "verif-historial-lleno.pdf"), bytes);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const page = await (await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise).getPage(1);
  const items = (await page.getTextContent()).items as { str: string; transform: number[]; width: number }[];
  // Ninguna línea de texto nuestro puede invadir el espacio de un título impreso.
  const titulos = [
    { nombre: "6. Impresión Diagnóstica", y: 155.7 },
    { nombre: "3. Antecedentes Personales Patológicos", y: 457.6 },
    { nombre: "4. Exploración Física", y: 321.8 },
    { nombre: "7. Tratamiento", y: 101.3 },
  ];
  console.log("");
  for (const t of titulos) {
    const invaden = items.filter((it) => {
      const y = it.transform[5];
      return y > t.y - 1 && y < t.y + 8 && !it.str.includes(t.nombre.split(". ")[1]) && it.str.trim().length > 2 && !/^\d+\.$/.test(it.str.trim());
    });
    ver(`nada invade "${t.nombre}" (y=${t.y})`, invaden.length === 0);
    for (const i of invaden) console.log(`      intruso: y=${i.transform[5].toFixed(1)} "${i.str.slice(0, 40)}"`);
  }
  const maxX = Math.max(...items.map((it) => it.transform[4] + it.width));
  ver(`nada se sale de la hoja (x máx ${maxX.toFixed(1)} < 596)`, maxX < 596);
}

