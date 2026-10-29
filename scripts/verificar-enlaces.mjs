// scripts/verificar-enlaces.mjs
//
// Comprueba que ningún enlace del repositorio apunte a un archivo que no
// existe. Sale con código 1 si encuentra alguno, así que sirve para el CI.
//
// Uso:
//   npm run verificar:enlaces
//
// ---------------------------------------------------------------------------
// QUÉ REVISA
// ---------------------------------------------------------------------------
//
//  1. Los enlaces Markdown relativos [texto](ruta) de todos los .md.
//  2. Las rutas `docs/...` citadas en cualquier archivo de texto: comentarios
//     de código, scripts, SQL, .env.example.
//  3. Las rutas de la antigua bóveda de Obsidian que siguen en los comentarios
//     de supabase/migrations/ (las migraciones aplicadas no se editan): se
//     traducen con la tabla de rutas antiguas de docs/README.md y se comprueba
//     que el destino exista.
//  4. Que no quede ningún [[wikilink]] de Obsidian en un .md.
//
// La existencia se comprueba con las MAYÚSCULAS EXACTAS. Windows no las
// distingue y Linux sí: un enlace a la carpeta del ERS escrita en mayúsculas
// resuelve en la máquina de desarrollo y se rompe en Vercel o en el CI. Pasó
// al mover la bóveda a docs/.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignorar = new Set(['node_modules', '.next', '.git', 'scripts/output']);

const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(raiz, p).split(path.sep).join('/');
    if (ignorar.has(e.name) || ignorar.has(rel)) continue;
    if (e.isDirectory()) recorrer(p);
    else if (/\.(md|mjs|mts|ts|tsx|js|css|sql|json|example)$/.test(e.name) && e.name !== 'package-lock.json') {
      archivos.push(p);
    }
  }
})(raiz);

/** Existe con las mayúsculas exactas, segmento por segmento. */
function existeExacto(abs) {
  const rel = path.relative(raiz, abs);
  if (rel.startsWith('..')) return fs.existsSync(abs);
  let actual = raiz;
  for (const parte of rel.split(path.sep).filter(Boolean)) {
    if (!fs.existsSync(actual) || !fs.statSync(actual).isDirectory()) return false;
    if (!fs.readdirSync(actual).includes(parte)) return false;
    actual = path.join(actual, parte);
  }
  return true;
}

// Carpetas de la antigua bóveda → carpetas actuales (tabla de docs/README.md).
const CARPETA_NUEVA = {
  'Decisiones-ADR': 'adr',
  Arquitectura: 'arquitectura',
  Modulos: 'modulos',
  Integraciones: 'integraciones',
  Diseno: 'diseno',
  Setup: 'setup',
  ERS: 'ers',
};

const rotos = [];
let enlaces = 0;
let rutasDocs = 0;
let rutasAntiguas = 0;
let wikilinks = 0;

for (const abs of archivos) {
  const rel = path.relative(raiz, abs).split(path.sep).join('/');
  const lineas = fs.readFileSync(abs, 'utf8').split('\n');
  // La tabla de rutas antiguas de docs/README.md cita rutas viejas a propósito.
  const inicioTabla =
    rel === 'docs/README.md' ? lineas.findIndex((l) => l.startsWith('## Rutas antiguas')) : -1;

  lineas.forEach((linea, i) => {
    const donde = `${rel}:${i + 1}`;

    if (rel.endsWith('.md')) {
      wikilinks += (linea.match(/\[\[[^\]]+\]\]/g) || []).length;
      for (const m of linea.matchAll(/\]\(([^)\s]+)\)/g)) {
        const destino = m[1].split('#')[0];
        if (!destino || /^[a-z]+:/i.test(destino)) continue; // ancla local, http:, mailto:
        enlaces++;
        if (!existeExacto(path.resolve(path.dirname(abs), decodeURIComponent(destino)))) {
          rotos.push(`${donde}  enlace → ${m[1]}`);
        }
      }
    }

    if (inicioTabla !== -1 && i > inicioTabla) return;
    for (const m of linea.matchAll(/(?<![\w/.-])docs\/[\w./-]*[\w/]/g)) {
      const ruta = m[0];
      // Solo rutas a archivos o carpetas; "docs/" suelto en prosa no es un enlace.
      if (!/\.(md|docx)$|\/$/.test(ruta) && !fs.existsSync(path.join(raiz, ruta))) continue;
      rutasDocs++;
      if (!existeExacto(path.join(raiz, ruta))) rotos.push(`${donde}  ruta → ${ruta}`);
    }

    if (rel.startsWith('supabase/migrations/')) {
      const antigua = /(?<![\w/])(Decisiones-ADR|Arquitectura|Modulos|Integraciones|Diseno|Setup|ERS)\/([\w.-]+\.md)/g;
      for (const m of linea.matchAll(antigua)) {
        rutasAntiguas++;
        const nueva = `docs/${CARPETA_NUEVA[m[1]]}/${m[2]}`;
        if (!existeExacto(path.join(raiz, nueva))) {
          rotos.push(`${donde}  migración → ${m[0]} (hoy sería ${nueva})`);
        }
      }
    }
  });
}

console.log(`Archivos revisados: ${archivos.length}`);
console.log(`  Enlaces Markdown relativos:                 ${enlaces}`);
console.log(`  Rutas docs/ citadas en el repo:             ${rutasDocs}`);
console.log(`  Rutas antiguas en migraciones (traducidas): ${rutasAntiguas}`);
console.log(`  Wikilinks [[...]] restantes:                ${wikilinks}`);

if (rotos.length || wikilinks) {
  if (wikilinks) console.error(`\n${wikilinks} wikilink(s) de Obsidian sin convertir.`);
  if (rotos.length) console.error(`\n${rotos.length} enlace(s) roto(s):`);
  for (const r of rotos) console.error(`  ${r}`);
  process.exit(1);
}
console.log('\nNingún enlace roto.');
