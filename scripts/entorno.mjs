// scripts/entorno.mjs
//
// Dice a qué proyecto de Supabase apunta cada archivo de entorno, sin mostrar
// ningún valor: solo el entorno, el ref (que es público, va en la URL) y qué
// variables están presentes.
//
// Uso:
//   npm run entorno                                         # solo .env (dev)
//   npm run entorno -- --produccion "<ruta del .env.produccion>"  # también producción
//
// `.env.produccion` vive fuera del repo y no tiene ruta por defecto: con
// --produccion, la ruta es obligatoria. Si aparece uno en la raíz del repo, falla.
// Es la comprobación que se hace después de tocar `.env` o `.env.produccion`.
// Ver docs/arquitectura/Entornos.md.

import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { entornoDe, refDe } from '../lib/entorno.ts';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const iProduccion = process.argv.indexOf('--produccion');
const rutaProduccion = iProduccion === -1 ? null : process.argv[iProduccion + 1];
if (iProduccion !== -1 && (!rutaProduccion || rutaProduccion.startsWith('--'))) {
  console.log('--produccion necesita la ruta del .env.produccion (vive fuera del repo).');
  process.exit(1);
}
// [nombre que se muestra, ruta, entorno esperado]
const ESPERADO = [['.env', path.join(raiz, '.env'), 'dev']];
if (rutaProduccion) ESPERADO.push(['.env.produccion', path.resolve(rutaProduccion), 'produccion']);
// Cada grupo vale si está cualquiera de sus nombres (el código acepta los dos).
const VARIABLES = {
  url: ['NEXT_PUBLIC_SUPABASE_URL'],
  publicable: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  secreta: ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  google: ['GOOGLE_SERVICE_ACCOUNT_KEY_BASE64'],
  sheetMedicamentos: ['GOOGLE_SHEET_ID_MEDICAMENTOS'],
  usuarioPrueba: ['USUARIO_PRUEBA_CORREO'],
  clavePrueba: ['USUARIO_PRUEBA_CLAVE'],
};

// Next carga estos solos, y por ENCIMA de `.env` (docs/arquitectura/Entornos.md):
// uno olvidado apuntando a producción haría que `npm run dev` se conecte ahí
// aunque `.env` diga dev. En este proyecto no debe existir ninguno.
const CARGADOS_POR_NEXT = [
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
];

let problemas = 0;
// Solo se comprueba que exista; no se lee.
if (fs.existsSync(path.join(raiz, '.env.produccion'))) {
  console.log(`${'.env.produccion'.padEnd(16)} MAL está en la raíz del repo: muévelo fuera (Entornos.md)`);
  problemas++;
}
for (const archivo of CARGADOS_POR_NEXT) {
  if (fs.existsSync(path.join(raiz, archivo))) {
    console.log(`${archivo.padEnd(16)} MAL existe, y Next lo cargaría solo por encima de .env: bórralo o renómbralo`);
    problemas++;
  }
}

for (const [archivo, ruta, esperado] of ESPERADO) {
  if (!fs.existsSync(ruta)) {
    console.log(`${archivo.padEnd(16)} no existe`);
    problemas++;
    continue;
  }
  const vars = parseEnv(fs.readFileSync(ruta, 'utf8'));
  const url = vars.NEXT_PUBLIC_SUPABASE_URL;
  const entorno = entornoDe(url);
  const ok = entorno === esperado;
  if (!ok) problemas++;
  const presentes = Object.entries(VARIABLES)
    .map(([grupo, nombres]) => `${grupo}=${nombres.some((n) => vars[n]) ? 'sí' : 'no'}`)
    .join('  ');
  console.log(`${archivo.padEnd(16)} ${ok ? 'OK ' : 'MAL'} ${entorno} (ref ${refDe(url) ?? '—'}), se esperaba ${esperado}`);
  console.log(`${''.padEnd(20)} ${presentes}`);
}
process.exit(problemas ? 1 : 0);
