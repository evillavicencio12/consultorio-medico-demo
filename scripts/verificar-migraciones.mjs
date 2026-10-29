// scripts/verificar-migraciones.mjs
//
// Comprueba que aplicar supabase/migrations/ sobre una base VACÍA produce el
// mismo esquema que tiene producción.
//
// Cómo funciona:
//   1. Lee la huella del esquema de PRODUCCIÓN (solo lectura, vía Management API).
//   2. Aplica supabase/migrations/ sobre una base LOCAL vacía y lee su huella.
//   3. Compara las dos y reporta cada diferencia.
//
// Ambas huellas salen de EJECUTAR EL MISMO ARCHIVO supabase/huella-esquema.sql.
//
// PRODUCCIÓN NUNCA SE MODIFICA: contra producción solo se manda ese SELECT, y
// además se envía con `read_only: true`.
//
// Dos motores para la base local:
//
//   --motor=pglite  (por defecto)  PostgreSQL compilado a WASM, dentro de Node.
//                   No necesita Docker ni servicios: funciona con solo
//                   `npm ci`. Es PG18 mientras producción es PG17, diferencia
//                   que este script neutraliza (ver esNotNullDePg18).
//
//   --motor=docker  El stack real de Supabase. Es la verificación canónica,
//                   porque corre sobre el MISMO PostgreSQL que producción.
//                   Requiere Docker y, antes:
//                       npx supabase start
//                       npx supabase db reset
//
// Uso:
//   node --env-file=.env scripts/verificar-migraciones.mjs
//   node --env-file=.env scripts/verificar-migraciones.mjs --motor=docker
//
// Requiere en .env:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_ACCESS_TOKEN   (https://supabase.com/dashboard/account/tokens)

import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL = readFileSync(join(RAIZ, 'supabase', 'huella-esquema.sql'), 'utf8');

// Objetos que pertenecen a la plataforma Supabase y no a este proyecto. No se
// versionan en nuestras migraciones, así que se excluyen de la comparación:
// aparecen en producción y no en local (o al revés) sin que eso sea un error.
// Ver la nota sobre `ensure_rls` en docs/arquitectura/Modelo-de-Datos.md.
const IGNORAR_EVENT_TRIGGERS = new Set([
  'issue_graphql_placeholder', 'issue_pg_cron_access', 'issue_pg_graphql_access',
  'issue_pg_net_access', 'pgrst_ddl_watch', 'pgrst_drop_watch', 'ensure_rls',
]);
const IGNORAR_FUNCIONES = new Set(['rls_auto_enable']);

// PostgreSQL 18 materializa cada NOT NULL como una fila con nombre propio en
// pg_constraint (contype = 'n'); PostgreSQL 17 y anteriores solo lo guardan en
// pg_attribute.attnotnull. Comparar esas filas haría que una base local de PG18
// pareciera distinta de una producción en PG17 sin que nada real cambie.
// Se excluyen sin perder cobertura: la nullability YA se compara columna por
// columna en la sección `columnas`, vía information_schema.is_nullable.
const esNotNullDePg18 = (c) => c.tipo === 'n';

async function huellaProduccion() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL en .env');
  if (!token) throw new Error('Falta SUPABASE_ACCESS_TOKEN en .env (crear en https://supabase.com/dashboard/account/tokens)');
  const ref = new URL(url).host.split('.')[0];

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL, read_only: true }),
  });
  const cuerpo = await r.text();
  if (!r.ok) throw new Error(`Management API HTTP ${r.status}: ${cuerpo.slice(0, 400)}`);
  return JSON.parse(cuerpo)[0].huella;
}

/**
 * Aplica las migraciones sobre un PostgreSQL efímero en memoria (PGlite) y
 * devuelve su huella. No toca disco ni red: la base nace vacía y muere al
 * terminar el proceso.
 */
async function huellaPglite() {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    throw new Error('Falta @electric-sql/pglite. Instálalo con `npm ci` (es devDependency).');
  }
  const db = await PGlite.create();

  // Roles y auth.role() que Supabase ya trae y que las migraciones asumen.
  await db.exec(readFileSync(join(RAIZ, 'supabase', 'entorno-pglite.sql'), 'utf8'));

  const dir = join(RAIZ, 'supabase', 'migrations');
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (archivos.length === 0) throw new Error('No hay migraciones en supabase/migrations/');
  for (const f of archivos) {
    try {
      await db.exec(readFileSync(join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`La migración ${f} falló al aplicarse sobre una base vacía: ${e.message}`);
    }
  }
  console.log(`  (pglite) ${archivos.length} migraciones aplicadas sobre una base vacía`);

  const res = await db.query(SQL);
  return res.rows[0].huella;
}

function huellaDocker() {
  // El contenedor de Postgres que levanta `supabase start`.
  const contenedor = execFileSync('docker', [
    'ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}',
  ], { encoding: 'utf8' }).trim().split('\n')[0];

  if (!contenedor) {
    throw new Error('No hay contenedor supabase_db_* corriendo. Ejecuta antes:\n' +
                    '  npx supabase start && npx supabase db reset');
  }

  // -t sin encabezados, -A sin alineación: la salida es el jsonb pelado.
  const salida = execFileSync('docker', [
    'exec', '-i', contenedor, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', '-',
  ], { input: SQL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  return JSON.parse(salida.trim());
}

// Compara dos listas de objetos usando `claves` como identidad de cada elemento.
function comparar(seccion, claves, deProd, deLocal) {
  const id = (o) => claves.map((k) => `${o[k]}`).join(' · ');
  const mapProd = new Map((deProd ?? []).map((o) => [id(o), o]));
  const mapLocal = new Map((deLocal ?? []).map((o) => [id(o), o]));
  const dif = [];

  for (const [k, o] of mapProd) {
    if (!mapLocal.has(k)) { dif.push({ seccion, tipo: 'FALTA EN LOCAL', id: k, prod: o }); continue; }
    const l = mapLocal.get(k);
    for (const campo of Object.keys(o)) {
      const a = o[campo], b = l[campo];
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        dif.push({ seccion, tipo: 'DIFIERE', id: k, campo, prod: a, local: b });
      }
    }
  }
  for (const [k, o] of mapLocal) {
    if (!mapProd.has(k)) dif.push({ seccion, tipo: 'SOBRA EN LOCAL', id: k, local: o });
  }
  return dif;
}

const SECCIONES = [
  ['tablas',            ['tabla']],
  ['columnas',          ['tabla', 'columna']],
  ['constraints',       ['tabla', 'nombre']],
  ['indices',           ['nombre']],
  ['secuencias',        ['nombre']],
  ['politicas',         ['tabla', 'nombre']],
  ['grants_tablas',     ['tabla', 'rol', 'privilegio']],
  ['grants_secuencias', ['secuencia', 'rol', 'privilegio']],
  ['funciones_public',  ['nombre']],
  ['event_triggers',    ['nombre']],
  ['triggers',          ['tabla', 'nombre']],
];

const motor = (process.argv.find((a) => a.startsWith('--motor=')) ?? '--motor=pglite').split('=')[1];
if (!['pglite', 'docker'].includes(motor)) {
  console.error(`Motor desconocido: "${motor}". Usa --motor=pglite o --motor=docker.`);
  process.exit(2);
}
console.log(`Motor de la base local: ${motor}`);
console.log();

const prod = await huellaProduccion();
const local = motor === 'docker' ? huellaDocker() : await huellaPglite();

// Filtrar objetos de plataforma antes de comparar.
for (const h of [prod, local]) {
  h.event_triggers = (h.event_triggers ?? []).filter((e) => !IGNORAR_EVENT_TRIGGERS.has(e.nombre));
  h.funciones_public = (h.funciones_public ?? []).filter((f) => !IGNORAR_FUNCIONES.has(f.nombre));
  h.constraints = (h.constraints ?? []).filter((c) => !esNotNullDePg18(c));
}

let total = 0;
for (const [seccion, claves] of SECCIONES) {
  const dif = comparar(seccion, claves, prod[seccion], local[seccion]);
  const n = (prod[seccion] ?? []).length;
  if (dif.length === 0) {
    console.log(`  OK   ${seccion.padEnd(20)} ${String(n).padStart(3)} objetos idénticos`);
  } else {
    total += dif.length;
    console.log(`  DIF  ${seccion.padEnd(20)} ${dif.length} diferencia(s):`);
    for (const d of dif) {
      if (d.tipo === 'DIFIERE') {
        console.log(`         [${d.id}] campo "${d.campo}"`);
        console.log(`            producción: ${JSON.stringify(d.prod)}`);
        console.log(`            local     : ${JSON.stringify(d.local)}`);
      } else {
        console.log(`         ${d.tipo}: [${d.id}]`);
      }
    }
  }
}

console.log();
if (total === 0) {
  console.log('EQUIVALENTES: aplicar supabase/migrations/ sobre una base vacía');
  console.log('reproduce exactamente el esquema de producción.');
  if (motor === 'pglite') {
    console.log();
    console.log('Nota: PGlite es PostgreSQL 18 y producción es 17. Para cerrar la');
    console.log('verificación sobre la misma versión, repite con --motor=docker.');
  }
} else {
  console.log(`${total} diferencia(s). Las migraciones NO reproducen producción todavía.`);
  process.exitCode = 1;
}
