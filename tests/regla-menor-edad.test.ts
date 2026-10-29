// La regla de menores (ADR-003) dice lo mismo en la base y en la app.
//
//   npm run test:menor-edad
//
// 1. PGlite: aplica supabase/migrations/, lee el CHECK `acompanante_obligatorio_
//    si_menor` tal como quedó GUARDADO (pg_get_constraintdef, no una copia) y lo
//    compara con `esMenorDeEdad` en 1.098 pares de borde —las 366 fechas de
//    nacimiento de 2008, cada una la víspera, el día y el día después de los
//    18— con dos relojes: mediodía y 23:00 de Ecuador (04:00 UTC del día
//    siguiente). `now()` se sustituye por ese instante.
// 2. La prueba de que la prueba distingue: con las migraciones SIN la 9, el
//    mismo barrido tiene que encontrar diferencias. Si algún día no las
//    encuentra, el barrido dejó de ver lo que tenía que ver.
// 3. Contra dev (solo si hay .env que apunte a dev): INSERT reales, sin
//    acompañante, de quien cumple 18 ayer, hoy y mañana según el día de
//    Ecuador. La base tiene que aceptar exactamente a los que `lib/edad.ts`
//    considera adultos. Lo insertado se borra al final, pase lo que pase.
//
// Es la prueba que habría atrapado el error del 15 de octubre de 2026:
// `age() >= '18 years'` daba 18 años la víspera, porque Postgres compara
// intervalos con 1 mes = 30 días.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { esMenorDeEdad } from "../lib/edad";
import { entornoDe } from "../lib/entorno";
import { hoyEnEcuador, hoyISOEnEcuador } from "../lib/fechas";
import { registrar } from "./ayudas";

const RAIZ = process.cwd();
const MIGRACION_9 = "20261015120000";

// --- Los pares -------------------------------------------------------------
const f = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const masDias = (y: number, m: number, d: number, n: number) => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return f(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

type Caso = { nacimiento: string; dia: string; ahoraUtc: string; reloj: string };
const casos: Caso[] = [];
for (let t = Date.UTC(2008, 0, 1); t <= Date.UTC(2008, 11, 31); t += 86_400_000) {
  const n = new Date(t);
  const [y, m, d] = [n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate()];
  const dd = m === 2 && d === 29 ? 28 : d; // como Postgres: 29-feb + 18 años = 28-feb
  for (const k of [-1, 0, 1]) {
    const dia = masDias(y + 18, m, dd, k);
    const [ry, rm, rd] = dia.split("-").map(Number);
    casos.push({ nacimiento: f(y, m, d), dia, ahoraUtc: `${dia}T17:00:00Z`, reloj: "12:00 EC" });
    casos.push({ nacimiento: f(y, m, d), dia, ahoraUtc: `${masDias(ry, rm, rd, 1)}T04:00:00Z`, reloj: "23:00 EC" });
  }
}

// La regla anterior a la migración 9 usaba `age(x)` de UN argumento, que mide
// contra "hoy a medianoche" en la zona de la sesión: es `age(date_trunc('day',
// now()), x)`. Se reescribe así para poder evaluarla con el reloj de cada caso.
const AGE_UN_ARGUMENTO = "age((fecha_nacimiento)::timestamp with time zone)";

/** El CHECK con `now()` reemplazado por la columna del instante de cada caso. */
function consultaDesde(definicion: string): string {
  const expr = definicion
    .replace(/^CHECK\s*/, "")
    .replaceAll(AGE_UN_ARGUMENTO, "age(date_trunc('day', now()), (fecha_nacimiento)::timestamp with time zone)");
  if (!expr.includes("now()")) throw new Error(`El CHECK no depende de la fecha actual; revisa la prueba:\n${definicion}`);
  const valores = casos
    .map((c, i) => `(${i}, '${c.nacimiento}'::date, '${c.ahoraUtc}'::timestamptz)`)
    .join(",\n");
  return `select i, coalesce((${expr.replaceAll("now()", "t.ahora")}), true) as permitido
          from (values ${valores}) as t(i, fecha_nacimiento, ahora),
               lateral (select null::text as nombre_acompanante, null::text as documento_acompanante) a
          order by i`;
}

const SQL_DEFINICION = `select pg_get_constraintdef(oid) as def from pg_constraint
                        where conname = 'acompanante_obligatorio_si_menor'`;

/** Cuántos casos difieren entre la base y la app, con hasta 5 ejemplos. */
function diferencias(filas: { i: number; permitido: boolean }[]) {
  const ejemplos: string[] = [];
  let distintos = 0;
  for (const { i, permitido } of filas) {
    const c = casos[i];
    const esperado = !esMenorDeEdad(c.nacimiento, c.dia); // sin acompañante: solo pasa el adulto
    if (permitido !== esperado) {
      distintos++;
      if (ejemplos.length < 5) {
        ejemplos.push(`nacido ${c.nacimiento}, día ${c.dia} a las ${c.reloj}: base=${permitido ? "adulto" : "menor"}, app=${esperado ? "adulto" : "menor"}`);
      }
    }
  }
  return { distintos, ejemplos, completos: filas.length === casos.length };
}

/** Aplica las migraciones (hasta `hasta`, si se da) en PGlite y evalúa el CHECK. */
async function evaluarEnPglite(hasta?: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();
  // Como Supabase: la sesión en UTC. Es lo que hacía visible el error de la hora.
  await db.exec("set timezone to 'UTC'");
  await db.exec(readFileSync(join(RAIZ, "supabase", "entorno-pglite.sql"), "utf8"));
  const dir = join(RAIZ, "supabase", "migrations");
  const archivos = readdirSync(dir).filter((a) => a.endsWith(".sql")).sort()
    .filter((a) => !hasta || a.slice(0, hasta.length) < hasta);
  for (const a of archivos) await db.exec(readFileSync(join(dir, a), "utf8"));
  const def = (await db.query<{ def: string }>(SQL_DEFINICION)).rows[0].def;
  const filas = (await db.query<{ i: number; permitido: boolean }>(consultaDesde(def))).rows;
  await db.close();
  return { migraciones: archivos.length, ...diferencias(filas) };
}

// --- 1. PGlite con todas las migraciones ----------------------------------
{
  const r = await evaluarEnPglite();
  registrar(
    `PGlite (${r.migraciones} migraciones): el CHECK y lib/edad.ts coinciden en los ${casos.length} casos`,
    r.completos && r.distintos === 0,
    `difieren en ${r.distintos} de ${casos.length} casos\n${r.ejemplos.join("\n")}`
  );
}

// --- 2. Sin la migración 9, el barrido TIENE que ver el error ---------------
{
  const r = await evaluarEnPglite(MIGRACION_9);
  registrar(
    `sin la migración 9 (${r.migraciones} migraciones), el barrido detecta que la regla vieja difiere`,
    r.completos && r.distintos > 0,
    "el barrido no encontró diferencias contra la regla vieja: dejó de distinguir"
  );
}

// --- 3. Contra dev: INSERT reales -------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PREFIJO = "PRUEBA REGLA MENOR";

describe.skipIf(!url || !clave)("contra dev: INSERT reales sin acompañante", () => {
  test("el .env apunta a dev, nunca a producción", () => {
    // No exigirDev(): su process.exit tumbaría el proceso de Vitest.
    expect(entornoDe(url)).toBe("dev");
  });

  const cabeceras = {
    apikey: clave!,
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };

  // El borrado se comprueba: si falla, falla el afterAll y se ve, en vez de
  // dejar pacientes "PRUEBA REGLA MENOR" acumulándose en dev.
  afterAll(async () => {
    if (entornoDe(url) !== "dev") return;
    const r = await fetch(`${url}/rest/v1/pacientes?nombre_completo=like.${encodeURIComponent(PREFIJO)}*`, {
      method: "DELETE",
      headers: cabeceras,
    });
    expect(r.ok, `no se pudieron borrar los pacientes de prueba: ${r.status} ${await r.text()}`).toBe(true);
  });

  const iso = (d: Date) => f(d.getFullYear(), d.getMonth() + 1, d.getDate());
  for (const [k, nombre] of [[-1, "ayer"], [0, "hoy"], [1, "mañana"]] as const) {
    test(`cumple 18 ${nombre}, sin acompañante: la base decide lo mismo que lib/edad.ts`, async () => {
      expect(entornoDe(url)).toBe("dev");
      // Las fechas se calculan AQUÍ, justo antes del INSERT, y no al recolectar:
      // si la corrida cruzara la medianoche de Ecuador entre una cosa y la otra,
      // "cumple mañana" ya sería "cumple hoy" para la base.
      const hoy = hoyEnEcuador();
      const nacimiento = iso(new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate() + k));
      const adulto = !esMenorDeEdad(nacimiento, hoy);
      const contexto = `nacido ${nacimiento}, hoy en Ecuador ${hoyISOEnEcuador()}, app: ${adulto ? "adulto" : "menor"}`;
      const r = await fetch(`${url}/rest/v1/pacientes`, {
        method: "POST",
        headers: cabeceras,
        body: JSON.stringify({ nombre_completo: `${PREFIJO} ${nombre.toUpperCase()}`, fecha_nacimiento: nacimiento }),
      });
      if (adulto) {
        expect(r.status, `${contexto} — ${await r.clone().text()}`).toBe(201);
      } else {
        expect(r.status, contexto).toBe(400);
        expect((await r.json()).code, contexto).toBe("23514");
      }
    });
  }
});
