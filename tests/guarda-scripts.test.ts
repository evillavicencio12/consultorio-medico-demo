// Ningún script de `scripts/` llega a Supabase sin pasar por la guarda de
// entorno (docs/arquitectura/Entornos.md).
//
// La regla era "un script nuevo que toque la base tiene que llamar a exigirDev
// o a exigirConfirmacionSiProduccion antes de crear el cliente", y dependía de
// la memoria. Desde el Paso 4 el cliente de un script sale de UN solo sitio,
// `clienteParaScript()` de lib/entorno.ts, que aplica la guarda y solo después
// lo crea. Esta prueba falla si algún script consigue acceso a Supabase por
// otro camino: importando supabase-js, llamando a createClient o pegándole a
// la API REST/Auth/Storage con fetch.
//
// Detectar "llama a la guarda ANTES de crear el cliente" leyendo el orden del
// código sería frágil; prohibir el otro camino no lo es.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/** Lo que cuenta como acceso directo a Supabase. */
const ACCESOS_DIRECTOS: [RegExp, string][] = [
  [/from\s+["']@supabase\/supabase-js["']|require\(\s*["']@supabase\/supabase-js["']\s*\)/, "importa @supabase/supabase-js"],
  [/\bcreateClient\s*\(/, "llama a createClient()"],
  [/\/(rest|auth|storage)\/v1\b/, "llama a la API de Supabase (/rest, /auth o /storage) a mano"],
];

/** Los motivos por los que un script se salta la regla. Cada uno, explícito. */
const EXCEPCIONES: Record<string, string> = {};

function accesosDirectos(codigo: string): string[] {
  // Sin comentarios: una línea que explica `createClient` no es una llamada.
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return ACCESOS_DIRECTOS.filter(([re]) => re.test(sinComentarios)).map(([, motivo]) => motivo);
}

describe("el detector distingue (prueba de la prueba)", () => {
  test("un script que usa clienteParaScript pasa", () => {
    expect(accesosDirectos(`import { clienteParaScript } from '../lib/entorno.ts';
      const supabase = clienteParaScript('x', { produccion: 'nunca' });
      // createClient no se llama aquí: este comentario no cuenta
      await supabase.from('pacientes').select('id');`)).toEqual([]);
  });
  test("un script que crea su propio cliente falla", () => {
    expect(accesosDirectos(`import { createClient } from '@supabase/supabase-js';
      const supabase = createClient(url, clave);`)).toEqual([
      "importa @supabase/supabase-js",
      "llama a createClient()",
    ]);
  });
  test("un script que llama a la API REST con fetch falla", () => {
    expect(accesosDirectos("await fetch(`${url}/rest/v1/pacientes?select=id`, { headers });")).toEqual([
      "llama a la API de Supabase (/rest, /auth o /storage) a mano",
    ]);
  });
});

// `e2e/` también: la prueba E2E siembra y limpia en dev, y tiene que hacerlo por
// la misma puerta (su limpieza usa clienteParaScript).
for (const carpeta of ["scripts", "e2e"]) {
  const DIR = join(process.cwd(), carpeta);
  const archivos = readdirSync(DIR).filter((a) => /\.(m?[jt]s|tsx|cjs)$/.test(a)).sort();

  describe(`${carpeta}/: el acceso a Supabase pasa por clienteParaScript()`, () => {
    test(`hay archivos que revisar en ${carpeta}/`, () => {
      expect(archivos.length).toBeGreaterThan(0);
    });

    for (const archivo of archivos) {
      const codigo = readFileSync(join(DIR, archivo), "utf8");
      const encontrados = accesosDirectos(codigo);
      if (EXCEPCIONES[archivo]) {
        test(`${archivo}: excepción (${EXCEPCIONES[archivo]})`, () => {
          // Una excepción que ya no hace falta se quita de la lista.
          expect(encontrados.length, `${archivo} ya no accede directo: sácalo de EXCEPCIONES`).toBeGreaterThan(0);
        });
      } else {
        test(`${archivo}: sin acceso directo a Supabase`, () => {
          expect(encontrados, `${archivo} debe obtener el cliente con clienteParaScript() (lib/entorno.ts)`).toEqual([]);
        });
      }
    }
  });
}
