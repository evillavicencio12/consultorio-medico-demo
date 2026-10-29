// El flujo completo de la doctora, contra dev y con un paciente ficticio:
// entrar → registrar paciente → consulta con CIE-10 y un medicamento del
// catálogo → receta en PDF, leída de verdad (su texto, no una captura).
//
// Solo dev: la guarda de playwright.config.ts mira el `.env`, y entrarEnDev()
// mira el servidor (e2e/sesion.ts). Crea un paciente "PRUEBA E2E …" y su
// consulta, y consume un número del correlativo de recetas de dev (aceptado).
// La limpieza va en afterAll y corre aunque la prueba falle.

import { expect, test, type Page } from "@playwright/test";
import { clienteParaScript } from "../lib/entorno";
import { hoyISOEnEcuador, MESES } from "../lib/fechas";
import { digitoVerificador } from "../lib/pacientes/documento";
import { entrarEnDev } from "./sesion";

const marca = Date.now().toString().slice(-6);
const NOMBRE = `PRUEBA E2E ${marca}`;
// Cédula sintética válida: provincia 09, tercer dígito 0, secuencia de la marca.
const nueve = `090${marca}`;
const CEDULA = `${nueve}${digitoVerificador(nueve)}`;

let pacienteId: string | null = null;

test.afterAll(async () => {
  const admin = clienteParaScript("La limpieza de la prueba E2E", { produccion: "nunca" });
  // Si la prueba falló antes de leer el id de la URL, se busca por el nombre.
  if (!pacienteId) {
    const { data, error } = await admin.from("pacientes").select("id").eq("nombre_completo", NOMBRE).limit(1);
    if (error) throw new Error(`limpieza: no se pudo buscar el paciente de prueba: ${error.message}`);
    pacienteId = data?.[0]?.id ?? null;
  }
  if (!pacienteId) return; // La prueba falló antes de registrarlo: no hay nada que borrar.

  // Solo se borra lo que esta prueba creó: un paciente "PRUEBA E2E …".
  const { data: paciente, error } = await admin.from("pacientes").select("nombre_completo").eq("id", pacienteId).single();
  if (error) throw new Error(`limpieza: no se pudo leer el paciente de prueba: ${error.message}`);
  if (!paciente.nombre_completo?.startsWith("PRUEBA E2E ")) {
    throw new Error("limpieza: se niega a borrar un paciente que no es de la prueba E2E");
  }
  // receta_medicamentos se borra en cascada con la consulta.
  const consultas = await admin.from("consultas").delete().eq("paciente_id", pacienteId);
  if (consultas.error) throw new Error(`limpieza: no se pudieron borrar las consultas: ${consultas.error.message}`);
  const borrado = await admin.from("pacientes").delete().eq("id", pacienteId);
  if (borrado.error) throw new Error(`limpieza: no se pudo borrar el paciente: ${borrado.error.message}`);
});

/** El texto de la primera página del PDF que muestra el `<iframe src="blob:…">` del diálogo. */
async function textoDelPdf(pagina: Page, tituloDialogo: string): Promise<string> {
  const iframe = pagina.getByRole("dialog", { name: tituloDialogo }).locator('iframe[src^="blob:"]');
  await expect(iframe).toHaveCount(1);
  const src = (await iframe.getAttribute("src"))!;
  // En base64: un arreglo de números por byte serían megas por el protocolo.
  const base64 = await pagina.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    return new Promise<string>((resolver) => {
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result).split(",")[1]);
      lector.readAsDataURL(blob);
    });
  }, src);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // En pdfjs 6 se libera la tarea de carga, que se lleva el documento.
  const tarea = pdfjs.getDocument({ data: new Uint8Array(Buffer.from(base64, "base64")) });
  try {
    const contenido = await (await (await tarea.promise).getPage(1)).getTextContent();
    return contenido.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " ");
  } finally {
    await tarea.destroy();
  }
}

/** "día Mes aa" contiguos, como los imprime la plantilla (16 Octubre 26). */
function fechaImpresa(iso: string): RegExp {
  const [anio, mes, dia] = iso.split("-");
  return new RegExp(`(^|\\s)${Number(dia)}\\s+${MESES[Number(mes) - 1]}\\s+${anio.slice(2)}(\\s|$)`, "i");
}

/**
 * Un mensaje de la CSP en Report-Only. Chrome lo marca: en esta versión escribe
 * "…violates the following Content Security Policy directive… The policy is
 * report-only…"; otras versiones anteponen "[Report Only]". Las dos formas valen.
 */
function esReporte(mensaje: string): boolean {
  return /Content Security Policy/i.test(mensaje) && /report.only/i.test(mensaje);
}

/** Sin ids (de pacientes ni de blobs) en lo que se imprime o se anota. */
const sinIds = (texto: string) => texto.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");

/**
 * Lo que dice el navegador sobre las cabeceras de seguridad (next.config.ts).
 *
 * La CSP va en Report-Only y solo en producción: con `npm run build && npm run
 * start` levantado, esto LISTA lo que la CSP habría bloqueado (la observación
 * para pasarla a aplicada); con `npm run dev` no hay CSP y la lista sale vacía.
 * Lo que sí hace fallar la prueba es un bloqueo real: que el navegador se niegue
 * a mostrar un marco (X-Frame-Options / frame-ancestors).
 *
 * Las violaciones se acumulan en Node a medida que ocurren (exposeBinding), no
 * se leen de `window` al final: así no se pierden las de un documento que ya se
 * fue (el login, una redirección).
 */
async function vigilarCabeceras(pagina: Page) {
  const mensajes: string[] = [];
  const violaciones = new Set<string>();
  pagina.on("console", (mensaje) => {
    const texto = mensaje.text();
    if (/Content Security Policy|Refused to|X-Frame-Options|frame-ancestors/i.test(texto)) mensajes.push(sinIds(texto));
  });
  await pagina.exposeBinding("__anotarCsp", (_origen, violacion: string) => {
    violaciones.add(sinIds(violacion));
  });
  // En cada documento, también en el marco blob: del PDF.
  await pagina.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      // Se busca en cada evento, no al instalar el listener: el binding puede
      // no estar todavía cuando corre este script.
      const anotar = (window as unknown as { __anotarCsp?: (v: string) => void }).__anotarCsp;
      anotar?.(`${e.disposition} ${e.effectiveDirective} ${e.blockedURI.replace(/^blob:.*/, "blob:")}`);
    });
  });
  return { mensajes, violaciones: () => [...violaciones].sort() };
}

test("registrar paciente, consulta con CIE-10 y receta en PDF", async ({ page }) => {
  const cabeceras = await vigilarCabeceras(page);
  await entrarEnDev(page);

  // --- Alta del paciente ficticio ---
  await page.goto("/pacientes/nuevo");
  await page.fill("#documento", CEDULA);
  await page.fill("#nombre_completo", NOMBRE);
  await page.fill("#fecha_nacimiento", "1985-04-12");
  await page.selectOption("#sexo", "F");
  await Promise.all([
    page.waitForURL(/\/pacientes\/[0-9a-f-]{36}\?nuevo=1/),
    page.getByRole("button", { name: "Registrar paciente" }).click(),
  ]);
  pacienteId = new URL(page.url()).pathname.split("/")[2];

  // --- Consulta ---
  await page.goto(`/pacientes/${pacienteId}/consulta`);
  await page.fill("#motivo_consulta", "Odinofagia y fiebre de dos días (prueba E2E).");
  await page.fill("#impresion_diagnostica", "Faringitis aguda (prueba E2E).");

  await page.getByPlaceholder("Ej. faringitis aguda, o J069").fill("faringitis");
  await page.getByRole("listbox", { name: "Códigos CIE-10 encontrados" }).getByRole("option").first().click();

  // --- Un medicamento del catálogo ---
  const medicamento = page.locator("article").filter({ hasText: "Medicamento 1" });
  await medicamento.getByPlaceholder("Ej. AMOXIFAR, o amoxicilina").fill("amoxicilina");
  await page.getByRole("listbox", { name: "Medicamentos del catálogo" }).getByRole("option").first().click();
  const generico = medicamento.getByLabel("Nombre genérico");
  await expect(generico).not.toHaveValue("");
  const nombreGenerico = (await generico.inputValue()).trim();

  const presentacion = medicamento.getByLabel("Presentación");
  if ((await presentacion.inputValue()) === "") await presentacion.selectOption({ index: 1 });
  await medicamento.getByLabel("Cantidad").fill("1");
  await medicamento.getByLabel("Dosis").fill("1 tableta");
  await medicamento.getByLabel("Vía").selectOption({ index: 1 });
  await medicamento.getByLabel("Frecuencia").fill("cada 8 horas");
  await medicamento.getByLabel("Duración").fill("7 días");

  // --- Guardar: se abre el historial; luego, la receta ---
  // El día de Ecuador antes y después de guardar: si la corrida cruza la
  // medianoche, cualquiera de los dos es correcto.
  const hoyAntes = hoyISOEnEcuador();
  await page.getByRole("button", { name: "Guardar y generar PDF" }).click();
  await expect(page.getByRole("dialog", { name: "Historial clínico" })).toBeVisible();
  const hoyDespues = hoyISOEnEcuador();
  await page.getByRole("button", { name: "Cerrar vista previa" }).click();
  const descargas: string[] = [];
  const anotarDescarga = (descarga: { url(): string }) => descargas.push(descarga.url());
  page.on("download", anotarDescarga);
  await page.getByRole("button", { name: "Ver receta" }).click();

  // --- La vista previa se muestra con las cabeceras activas ---
  // El marco tiene que haber navegado a SU blob: sin que nadie lo impida
  // (X-Frame-Options: DENY no debe tocar un blob:). Con interfaz, Chromium lo
  // muestra en su visor y el marco queda en ese blob:; sin interfaz (headless)
  // no tiene visor y lo DESCARGA, que también prueba que la navegación no se
  // bloqueó. Se compara contra el src del iframe de la receta, no contra
  // cualquier PDF: una descarga atrasada del historial no cuenta. Comprobado con
  // interfaz el 16 de octubre de 2026: carga el visor y no hay violaciones de
  // object-src ni de frame-src.
  const srcReceta = await page.getByRole("dialog", { name: "Receta médica" }).locator("iframe").getAttribute("src");
  expect(srcReceta).toMatch(/^blob:/);
  await expect
    .poll(() => page.frames().some((marco) => marco.url() === srcReceta) || descargas.includes(srcReceta!))
    .toBe(true);
  page.off("download", anotarDescarga);

  // Se recoge ANTES de leer el PDF: la lectura (fetch del blob:) es de la
  // prueba, no de la app, y daría una violación de connect-src que no existe.
  const informe = [
    ...cabeceras.violaciones(),
    ...new Set(cabeceras.mensajes.filter(esReporte).map((m) => m.replace(/\. Either[\s\S]*$/, ""))),
  ];
  console.log(`CSP (Report-Only): ${informe.length ? `\n  ${informe.join("\n  ")}` : "sin violaciones registradas"}`);
  test.info().annotations.push({ type: "csp-report-only", description: informe.join(" | ") || "ninguna" });

  const texto = await textoDelPdf(page, "Receta médica");

  // Un bloqueo de verdad, no un reporte: un "Refused to frame" que solo se
  // reporta (Report-Only) no impidió nada.
  const bloqueos = cabeceras.mensajes.filter(
    (m) => !esReporte(m) && /X-Frame-Options|frame-ancestors|Refused to (display|frame)/i.test(m)
  );
  expect(bloqueos, "el navegador se negó a mostrar un marco").toEqual([]);

  // --- Lo que la receta tiene que llevar impreso ---
  expect(texto).toContain(NOMBRE);
  expect(texto.toLowerCase()).toContain(nombreGenerico.toLowerCase());
  // La fecha de HOY en Ecuador, como secuencia "día Mes aa": un número suelto
  // no prueba nada (la receta ya trae "1", "7", "8" y la edad).
  const fechas = [...new Set([hoyAntes, hoyDespues])];
  expect(
    fechas.some((iso) => fechaImpresa(iso).test(texto)),
    `la receta no imprime ${fechas.join(" ni ")} como "día Mes aa"`
  ).toBe(true);
});
