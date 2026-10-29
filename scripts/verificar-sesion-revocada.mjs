// scripts/verificar-sesion-revocada.mjs
//
// Qué ve la doctora si su sesión se REVOCA (cerró sesión en otra pestaña) con
// la consulta a medio escribir, y después busca en CIE-10:
//
//   - el aviso "La sesión caducó", sin 404 y conservando lo escrito;
//   - ningún Set-Cookie de `sb-` en la respuesta de la acción (escribir cookies
//     en una respuesta de acción hace que Next vuelva a renderizar la página
//     sin sesión, y la consulta termina en notFound());
//   - y que la siguiente navegación (GET /pacientes) termine en el login con las
//     cookies de sesión borradas.
//
// El caso lo encontró la revisión del Paso 4 y está explicado en
// docs/arquitectura/Seguridad-OWASP.md. Solo contra dev y una app LOCAL, con el
// usuario de prueba de `.env`, sobre el paciente sintético "PRUEBA ADULTO
// COMPLETO UNO" (scripts/sembrar-pacientes-sinteticos.mjs) y la base sin tocar
// (búsquedas, ninguna escritura). Cierra TODAS las sesiones del usuario de
// prueba (signOut global).
//
// Uso, con `npm run dev` levantado:
//   npm run verificar:sesion-revocada
//
// No imprime tokens ni datos de pacientes.

import { createRequire } from 'node:module';
import path from 'node:path';
import { exigirDev, refDev } from '../lib/entorno.ts';

exigirDev('La verificación de sesión revocada');

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
// `exigirDev` mira el proyecto de Supabase del `.env`; esto mira a qué app le
// habla el navegador. Un BASE_URL al despliegue de Vercel abriría producción.
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) {
  console.error(`BASE_URL tiene que ser una app local (localhost o 127.0.0.1): ${new URL(BASE).host}`);
  process.exit(1);
}
const PACIENTE_SINTETICO = 'PRUEBA ADULTO COMPLETO UNO';
const MOTIVO = 'PRUEBA SESION REVOCADA motivo sintetico';
const enmascarar = (u) => new URL(u).pathname.replace(/[0-9a-f-]{36}/, '<id>');
const fallos = [];
const comprobar = (cond, texto) => {
  console.log(`  ${cond ? 'OK ' : 'MAL'} ${texto}`);
  if (!cond) fallos.push(texto);
};

async function entrar(contexto) {
  const p = await contexto.newPage();
  p.setDefaultTimeout(30000);
  await p.goto(`${BASE}/login`);
  await p.fill('#correo', process.env.USUARIO_PRUEBA_CORREO);
  await p.fill('#password', process.env.USUARIO_PRUEBA_CLAVE);
  await Promise.all([p.waitForURL(/\/pacientes/, { timeout: 60000 }), p.click('button[type="submit"]')]);
  await p.waitForSelector('a[href^="/pacientes/"]');
  // `exigirDev` mira el `.env` de este proceso; el servidor de :3000 pudo
  // levantarse con otro. La cookie de sesión lleva el ref del proyecto al que
  // le habla el SERVIDOR: se exige el de dev antes de seguir (y antes del
  // signOut global).
  const refs = (await contexto.cookies(BASE))
    .map((c) => /^sb-([a-z0-9]+)-auth-token(\.\d+)?$/.exec(c.name)?.[1])
    .filter(Boolean);
  if (refs.length === 0 || refs.some((r) => r !== refDev())) {
    throw new Error('el servidor de :3000 no está conectado al proyecto de dev: me detengo');
  }
  return p;
}

const navegador = await chromium.launch();
try {
  // A: la consulta a medio escribir.
  const a = await navegador.newContext();
  const pa = await entrar(a);
  const href = await pa
    .locator('a[href^="/pacientes/"]')
    .filter({ hasText: PACIENTE_SINTETICO })
    .evaluateAll((as) => as.map((x) => x.getAttribute('href')).find((h) => /^\/pacientes\/[0-9a-f-]{36}$/.test(h)));
  if (!href) throw new Error(`no encontré al paciente sintético "${PACIENTE_SINTETICO}" (¿falta sembrar dev?)`);
  await pa.goto(`${BASE}${href}/consulta`, { timeout: 60000 });
  const urlConsulta = pa.url();
  await pa.fill('#motivo_consulta', MOTIVO);
  const cie = pa.getByPlaceholder('Ej. faringitis aguda, o J069');
  await cie.fill('faringitis');
  await pa.getByRole('listbox', { name: 'Códigos CIE-10 encontrados' }).waitFor();

  // B: otra pestaña (otra sesión del mismo usuario) cierra sesión: signOut global.
  const b = await navegador.newContext();
  const pb = await entrar(b);
  await Promise.all([
    pb.waitForURL(/\/login/, { timeout: 60000 }),
    pb.locator('button[title="Cerrar sesión"], button:has-text("Cerrar sesión")').first().click(),
  ]);
  await b.close();

  // A busca otra vez.
  const respuestas = [];
  pa.on('response', async (r) => {
    if (r.request().method() === 'POST' && r.request().headers()['next-action']) {
      const sb = (await r.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('sb-')).length;
      respuestas.push({ estado: r.status(), sb });
    }
  });
  await cie.fill('amigdalitis');
  await pa.getByRole('alert').filter({ hasText: 'La sesión caducó' }).first().waitFor({ timeout: 15000 }).catch(() => {});
  await pa.waitForTimeout(2000);

  console.log('\nSesión revocada, búsqueda en CIE-10:');
  comprobar(respuestas.length > 0 && respuestas.every((r) => r.estado === 200), `la acción responde 200 (${respuestas.map((r) => r.estado).join(', ')})`);
  comprobar(respuestas.every((r) => r.sb === 0), `ningún Set-Cookie de sb- en la respuesta (${respuestas.map((r) => r.sb).join(', ')})`);
  comprobar(pa.url() === urlConsulta, `la pantalla sigue en la consulta (${enmascarar(pa.url())})`);
  comprobar((await pa.getByRole('alert').filter({ hasText: 'La sesión caducó' }).count()) > 0, "se ve el aviso 'La sesión caducó'");
  comprobar((await pa.getByText(/no se encontr|not found|404/i).count()) === 0, 'no hay 404');
  const motivo = (await pa.locator('#motivo_consulta').count()) ? await pa.inputValue('#motivo_consulta') : null;
  comprobar(motivo === MOTIVO, 'el motivo escrito se conserva');

  console.log('\nLa siguiente navegación:');
  await pa.goto(`${BASE}/pacientes`, { timeout: 60000 });
  comprobar(new URL(pa.url()).pathname === '/login', `GET /pacientes termina en el login (${enmascarar(pa.url())})`);
  const quedan = (await a.cookies(BASE)).filter((c) => c.name.startsWith('sb-') && c.value !== '').length;
  comprobar(quedan === 0, `las cookies de sesión quedaron borradas (quedan ${quedan})`);
  await a.close();
} catch (e) {
  console.error('FALLO:', e.message);
  fallos.push(e.message);
} finally {
  await navegador.close();
  console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nTodo OK');
  process.exitCode = fallos.length ? 1 : 0;
}
