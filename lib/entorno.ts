/**
 * A qué proyecto de Supabase apunta este proceso, y las guardas que impiden
 * que un script de pruebas, de siembra o de importación toque producción sin
 * que nadie lo haya pedido.
 *
 * Hay dos proyectos (docs/arquitectura/Entornos.md): `.env` apunta a dev y
 * `.env.produccion` a producción, y este último Next no lo carga nunca solo.
 * Los refs de los dos proyectos no están escritos en el código: vienen de
 * `SUPABASE_REF_DEV` y `SUPABASE_REF_PRODUCCION` (ver `.env.example`).
 * Pero un archivo de entorno se puede pasar por error, y por eso los scripts
 * no se fían del nombre del archivo: miran la URL que de verdad recibieron.
 *
 * ## Por qué la regla es doble
 *
 * Bastaría, en apariencia, con frenar si la URL contiene el ref de producción.
 * No basta: si producción pasa a un dominio propio, o se recrea con otro ref,
 * esa comparación deja de reconocerla y la guarda la deja pasar en silencio.
 * Así que las guardas también EXIGEN un entorno conocido: dev o local. Un ref
 * que no es ninguno de los dos se trata como producción. La guarda falla
 * cerrada, no abierta: sin `SUPABASE_REF_DEV`, ninguna URL de Supabase cuenta
 * como dev y las pruebas y la siembra se detienen.
 *
 * Sin alias `@/` ni `server-only`: la importan scripts `.mjs` con extensión
 * explícita (Node 24 borra los tipos). Mismo principio que lib/edad.ts y
 * lib/medicamentos/importar.ts.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Ref del proyecto de dev, de `SUPABASE_REF_DEV`. Se lee en cada llamada, no al importar. */
export function refDev(): string | null {
  return process.env.SUPABASE_REF_DEV?.trim() || null;
}

/** Ref del proyecto de producción, de `SUPABASE_REF_PRODUCCION`. */
export function refProduccion(): string | null {
  return process.env.SUPABASE_REF_PRODUCCION?.trim() || null;
}

export type Entorno = "produccion" | "dev" | "local" | "desconocido" | "sin-configurar";

/**
 * El ref de un proyecto es el subdominio de su URL (`<ref>.supabase.co`).
 * Para cualquier otro host (localhost, un dominio propio) no hay ref: devuelve
 * null y quien informa muestra el host, no un "ref" inventado.
 */
export function refDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  } catch {
    return null;
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "URL ilegible";
  }
}

export function entornoDe(url: string | undefined): Entorno {
  if (!url || !url.trim()) return "sin-configurar";
  // En cualquier parte del texto, no solo en el host: ante una URL rara,
  // mejor reconocer producción de más que de menos.
  const produccion = refProduccion();
  if (produccion && url.includes(produccion)) return "produccion";
  const dev = refDev();
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "desconocido";
  }
  if (dev && host === `${dev}.supabase.co`) return "dev";
  if (host === "localhost" || host === "127.0.0.1") return "local";
  return "desconocido";
}

function detener(lineas: string[]): never {
  console.error(["", "⛔ DETENIDO POR LA GUARDA DE ENTORNO (lib/entorno.ts)", ...lineas, ""].join("\n"));
  process.exit(1);
}

function describir(url: string | undefined): string {
  const entorno = entornoDe(url);
  if (entorno === "sin-configurar") return "sin NEXT_PUBLIC_SUPABASE_URL (¿falta --env-file=.env?)";
  if (entorno === "desconocido" && !refDev()) return "un entorno desconocido: falta SUPABASE_REF_DEV en el archivo de entorno";
  const ref = refDe(url);
  return ref ? `${entorno} (ref ${ref})` : `${entorno} (host ${hostDe(url ?? "")})`;
}

/**
 * Para pruebas y siembra de datos sintéticos: solo corren contra dev o local.
 * Cualquier otra cosa —producción, un ref desconocido, ninguna URL— detiene el
 * proceso ANTES de conectarse.
 */
export function exigirDev(motivo: string, url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): Entorno {
  const entorno = entornoDe(url);
  if (entorno === "dev" || entorno === "local") return entorno;
  detener([
    `${motivo} solo corre contra el proyecto de dev o una base local.`,
    `Este proceso apunta a: ${describir(url)}.`,
    "Usa el entorno de dev: --env-file=.env",
  ]);
}

/**
 * Para importadores que SÍ tienen uso legítimo en producción (catálogos):
 * contra dev o local corren sin más; contra producción exigen, además del
 * archivo de entorno, la bandera `--produccion` escrita a mano. Un ref
 * desconocido o la falta de URL detienen siempre.
 */
export function exigirConfirmacionSiProduccion(
  motivo: string,
  argv: string[] = process.argv,
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): Entorno {
  const entorno = entornoDe(url);
  if (entorno === "dev" || entorno === "local") return entorno;
  if (entorno === "produccion" && argv.includes("--produccion")) {
    console.warn(`\n⚠  ${motivo} contra PRODUCCIÓN (ref ${refProduccion()}), confirmado con --produccion.\n`);
    return entorno;
  }
  if (entorno === "produccion") {
    detener([
      `${motivo} apunta a PRODUCCIÓN (ref ${refProduccion()}).`,
      "Si de verdad es lo que quieres, vuelve a correrlo agregando --produccion.",
    ]);
  }
  detener([`${motivo}: entorno no reconocido, ${describir(url)}.`, "Solo se aceptan dev, local o producción confirmada."]);
}

/**
 * El ÚNICO camino por el que un script de `scripts/` obtiene un cliente de
 * Supabase. Aplica la guarda que corresponde y SOLO DESPUÉS crea el cliente,
 * así que no hay forma de tener el cliente sin haber pasado por ella:
 *
 *   - `produccion: "nunca"` → `exigirDev` (pruebas, siembra).
 *   - `produccion: "con-bandera"` → `exigirConfirmacionSiProduccion`
 *     (importadores de catálogos, que sí tienen uso legítimo en producción).
 *
 * Usa la clave secreta (salta RLS): es para importaciones y mantenimiento,
 * nunca para código que llegue al navegador. `tests/guarda-scripts.test.ts`
 * falla si un script crea un cliente o llama a la API REST de Supabase por
 * otro camino. Ver docs/arquitectura/Entornos.md.
 */
export function clienteParaScript(
  motivo: string,
  { produccion }: { produccion: "nunca" | "con-bandera" },
  argv: string[] = process.argv,
): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (produccion === "nunca") exigirDev(motivo, url);
  else exigirConfirmacionSiProduccion(motivo, argv, url);

  // `||` y no `??`: una variable vacía copiada de .env.example no debe tapar a la otra.
  const clave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) {
    detener([`${motivo}: falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en el archivo de entorno.`]);
  }
  // `url` ya pasó la guarda, así que existe.
  return createClient(url!, clave, { auth: { persistSession: false } });
}
