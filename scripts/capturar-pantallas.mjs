// scripts/capturar-pantallas.mjs
//
// Capturas de pantalla para el README (docs/capturas/), contra un `next dev`
// en :3000 conectado al proyecto de DEV, que solo tiene datos sintéticos.
// No escribe nada: navega, busca y abre formularios sin guardarlos.
//
// Uso (con `npm run dev` levantado en otra terminal):
//   node --env-file=.env.local scripts/capturar-pantallas.mjs
//
// Necesita USUARIO_PRUEBA_CORREO, USUARIO_PRUEBA_CLAVE y SUPABASE_REF_DEV. Antes
// de capturar nada comprueba, por la cookie de sesión, que el servidor le habla
// al proyecto de dev (igual que e2e/sesion.ts).

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SALIDA = path.join(process.cwd(), "docs", "capturas");
const faltan = ["USUARIO_PRUEBA_CORREO", "USUARIO_PRUEBA_CLAVE", "SUPABASE_REF_DEV"].filter((v) => !process.env[v]);
if (faltan.length) {
  console.error(`Faltan variables: ${faltan.join(", ")}`);
  process.exit(1);
}

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: "es-EC", timezoneId: "America/Guayaquil" });
const p = await contexto.newPage();
const captura = async (nombre) => {
  await p.waitForLoadState("networkidle");
  // Sin el indicador de Next del modo desarrollo (el botón «N»).
  await p.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await p.screenshot({ path: path.join(SALIDA, `${nombre}.png`) });
  console.log(`  ${nombre}.png`);
};

try {
  await p.goto(`${BASE}/login`);
  await captura("01-login");

  await p.fill("#correo", process.env.USUARIO_PRUEBA_CORREO);
  await p.fill("#password", process.env.USUARIO_PRUEBA_CLAVE);
  await Promise.all([p.waitForURL(/\/pacientes/, { timeout: 60000 }), p.click('button[type="submit"]')]);
  const refs = (await contexto.cookies(BASE))
    .map((c) => /^sb-([a-z0-9]+)-auth-token(\.\d+)?$/.exec(c.name)?.[1])
    .filter(Boolean);
  if (refs.length === 0 || refs.some((r) => r !== process.env.SUPABASE_REF_DEV)) {
    throw new Error("el servidor de :3000 no está conectado al proyecto de dev: me detengo");
  }

  await p.waitForSelector('a[href^="/pacientes/"]');
  await captura("02-pacientes");

  const buscador = p.locator('input[type="search"], input[name="q"]').first();
  await buscador.fill("prueba menor");
  await p.waitForTimeout(1200);
  await captura("03-busqueda");

  await p.goto(`${BASE}/pacientes`);
  const ficha = p.locator('a[href^="/pacientes/"]', { hasText: "PRUEBA MENOR CON MADRE" }).first();
  await ficha.click();
  await p.waitForURL(/\/pacientes\/[0-9a-f-]{36}$/);
  const urlFicha = p.url();
  await captura("04-ficha-paciente");

  await p.goto(`${urlFicha}/consulta`);
  await captura("05-nueva-consulta");

  await p.goto(`${BASE}/pacientes/nuevo`);
  await captura("06-nuevo-paciente");

  await p.goto(`${BASE}/configuracion`);
  await captura("07-configuracion");
} finally {
  await navegador.close();
}
