import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { exigirDev } from "./lib/entorno";

// Pruebas E2E contra DEV (docs/arquitectura/Verificacion-y-CI.md).
//
// Crean un paciente y una consulta y consumen números del correlativo de
// recetas, así que contra producción serían una escritura sobre datos clínicos
// reales (CLAUDE.md). Nunca `.env.produccion`.
if (existsSync(".env")) process.loadEnvFile(".env");

// La guarda va AQUÍ, al cargar la configuración, y no en un globalSetup:
// Playwright levanta el `webServer` antes del globalSetup, así que una guarda
// ahí cortaría con `npm run dev` ya conectado al proyecto equivocado (y, en
// Windows, huérfano). Como esto corre antes de todo, `process.exit` no deja
// nada a medias.
exigirDev("La prueba E2E");
for (const variable of ["USUARIO_PRUEBA_CORREO", "USUARIO_PRUEBA_CLAVE"]) {
  if (!process.env[variable]) throw new Error(`La prueba E2E necesita ${variable} en .env`);
}

const BASE_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  // Una sola usuaria y un solo correlativo: nada en paralelo.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // Apagado: un trace guarda el `fill` de la clave del usuario de prueba en
    // texto plano y las cookies de sesión. Para depurar en local:
    // `npx playwright test --trace on`, y el trace no se comparte.
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Reutiliza un `npm run dev` ya levantado; si no hay, lo levanta (con `.env`).
    // Un servidor ya levantado puede apuntar a otro proyecto: la prueba lo
    // comprueba con la cookie de sesión antes de crear nada (e2e/sesion.ts).
    command: "npm run dev",
    url: `${BASE_URL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
