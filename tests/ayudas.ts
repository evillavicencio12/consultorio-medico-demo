/**
 * Puente entre las suites de humo de `scripts/` (Fases 2–5) y Vitest.
 *
 * Las suites calculaban cada comprobación de inmediato y la imprimían como
 * "OK — …" o "FALLÓ — …". Al pasar a Vitest se conservó ese cuerpo tal cual y
 * solo cambió el final: en vez de imprimir, cada comprobación registra un
 * `test()` con el resultado ya calculado. Así cada "OK" de antes es exactamente
 * un test de ahora, con el mismo nombre, y la migración se pudo comprobar por
 * nombre (557 de 557).
 *
 * La comparación de `comprobar` sigue siendo `JSON.stringify` y no `toEqual` a
 * propósito: es la que tenían las suites, y cambiarla durante la migración
 * habría cambiado qué cuenta como igual sin que el comparador lo notara.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";

export function registrar(descripcion: string, ok: boolean, detalle?: string): void {
  test(descripcion, () => {
    expect(ok, detalle ?? descripcion).toBe(true);
  });
}

export function comprobar(descripcion: string, obtenido: unknown, esperado: unknown): void {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  registrar(descripcion, ok, `esperado: ${JSON.stringify(esperado)}\nobtenido: ${JSON.stringify(obtenido)}`);
}

export function cierto(descripcion: string, condicion: boolean): void {
  comprobar(descripcion, condicion, true);
}

/**
 * Las plantillas PDF se cargan con `fetch("/plantilla.pdf")`, como en el
 * navegador. En Node se sirven leyendo `public/`; cualquier otra URL va al
 * `fetch` real.
 */
export function instalarFetchDePublic(): void {
  const PUBLIC_DIR = path.join(process.cwd(), "public");
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/")) {
      const b = await readFile(path.join(PUBLIC_DIR, input.slice(1)));
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      } as Response;
    }
    return fetchReal(input, init);
  }) as typeof fetch;
}
