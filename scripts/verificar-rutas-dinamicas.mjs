// scripts/verificar-rutas-dinamicas.mjs
//
// Falla si el build prerenderizó (sacó ESTÁTICA) una ruta que no esté en la
// lista corta de las que pueden serlo.
//
// Uso (después de `npm run build`):
//   npm run verificar:rutas
//
// Una ruta estática se renderiza una vez, en el build, y se sirve igual a
// todos: la fecha de "hoy" quedaría congelada en el día del despliegue, la
// edad y la regla de menores (ADR-003) se calcularían contra ese día, y un
// conteo como el de /configuracion se quedaría viejo. Ya pasó con
// `/pacientes/nuevo` hasta que se le puso `await connection()`; ver
// docs/arquitectura/Trampas-Recurrentes.md. `tsc`, `eslint` y el propio build
// pasan en verde con la ruta estática: por eso este chequeo.
//
// Es una lista de PERMITIDAS, no de prohibidas: una página nueva es dinámica
// hasta que alguien decida, aquí y a sabiendas, que puede ser estática.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Desde la raíz del repo, no desde el directorio en que se lance.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFIESTO = path.join(raiz, '.next', 'prerender-manifest.json');

/** Las únicas que pueden salir estáticas: no leen datos ni calculan "hoy". */
const PUEDEN_SER_ESTATICAS = new Set([
  '/',
  '/_global-error',
  '/_not-found',
  '/favicon.ico',
  '/historial',
  '/nueva-consulta',
]);

if (!fs.existsSync(MANIFIESTO)) {
  console.error('No existe .next/prerender-manifest.json. Corre `npm run build` primero.');
  process.exit(1);
}

const manifiesto = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf-8'));
// `routes`: las prerenderizadas. `dynamicRoutes`: las que se prerenderizan por
// parámetro (generateStaticParams). Las dos cuentan como estáticas.
const estaticas = [...Object.keys(manifiesto.routes ?? {}), ...Object.keys(manifiesto.dynamicRoutes ?? {})].sort();
const mal = estaticas.filter((ruta) => !PUEDEN_SER_ESTATICAS.has(ruta));

console.log(`Prerenderizadas en el build: ${estaticas.join(', ') || '(ninguna)'}`);
if (mal.length > 0) {
  console.error(`\nSalieron estáticas y no están permitidas: ${mal.join(', ')}`);
  console.error('Si calculan "hoy" o leen datos, les falta leer algo de la petición (cookies(), connection()…);');
  console.error('ver Trampas-Recurrentes.md. Si de verdad pueden ser estáticas, agrégalas a PUEDEN_SER_ESTATICAS.');
  process.exit(1);
}
console.log('\nSolo salieron estáticas las rutas permitidas; el resto es dinámico.');
