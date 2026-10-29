// Entrar con el usuario de prueba y comprobar a qué proyecto de Supabase le
// habla el SERVIDOR.
//
// La guarda de playwright.config.ts mira el `.env` del proceso de Playwright,
// pero `reuseExistingServer` acepta cualquier `next dev` que responda en :3000,
// y ese pudo levantarse con otro entorno. El nombre de la cookie de sesión
// lleva el ref del proyecto (`sb-<ref>-auth-token`) y lo pone el servidor, así
// que se comprueba después de entrar y ANTES de crear nada.

import { expect, type Page } from "@playwright/test";
import { refDev } from "../lib/entorno";

export async function entrarEnDev(pagina: Page) {
  await pagina.goto("/login");
  await pagina.fill("#correo", process.env.USUARIO_PRUEBA_CORREO!);
  await pagina.fill("#password", process.env.USUARIO_PRUEBA_CLAVE!);
  await Promise.all([pagina.waitForURL(/\/pacientes/), pagina.click('button[type="submit"]')]);

  const refs = (await pagina.context().cookies())
    .map((c) => /^sb-([a-z0-9]+)-auth-token(\.\d+)?$/.exec(c.name)?.[1])
    .filter(Boolean);
  expect(refs.length, "no apareció la cookie de sesión de Supabase").toBeGreaterThan(0);
  expect(new Set(refs), "el servidor en :3000 no está conectado al proyecto de dev").toEqual(new Set([refDev()]));
}
