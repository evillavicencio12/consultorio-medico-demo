// Toda Server Action verifica la sesión DENTRO de sí misma
// (docs/arquitectura/Seguridad-OWASP.md).
//
// proxy.ts protege páginas, no acciones: el POST de una Server Action (cabecera
// `next-action`) pasa el proxy sin sesión a propósito, para que la acción
// responda SESION_CADUCADA y la pantalla no pierda lo escrito. Así que esta
// prueba es la que sostiene el control de acceso de las acciones:
//
//   1. Descubre SOLA todas las acciones: recorre el proyecto, encuentra los
//      archivos "use server" e importa cada exportación. Una acción nueva entra
//      en la prueba sin que nadie la anote.
//   2. Sin sesión, cada una tiene que responder SESION_CADUCADA y NO tocar la
//      base (nada del cliente salvo `auth.getUser`, ni el cliente admin, ni el
//      Sheet, ni `fetch`, ni `revalidatePath` o `redirect`).
//   3. Con sesión, tiene que pasar la verificación y seguir. Esa parte necesita
//      argumentos válidos para cada firma, así que va con una lista explícita
//      — y la lista tiene que coincidir con lo descubierto.
//
// Como en guarda-scripts.test.ts, el detector se prueba a sí mismo con un
// ejemplo malo (tests/fixtures/accion-sin-verificacion.ts) que tiene que marcar.
//
// Todas comparten `clienteConSesion()` (lib/supabase/sesion.ts).

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { instalarFetchDePublic } from "./ayudas";

// --- Lo que no puede correr fuera de Next, o que saldría a la red ------------
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ crearClienteServidor: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  crearClienteAdmin: vi.fn(() => {
    throw new Error("el cliente admin no debía usarse en esta prueba");
  }),
}));
vi.mock("../lib/medicamentos/sheet", () => ({
  ConfiguracionIncompletaError: class extends Error {},
  SheetVacioError: class extends Error {},
  leerSheetMedicamentos: vi.fn(async () => {
    throw new Error("Sheet falso: no se lee en la prueba");
  }),
}));

const { crearClienteServidor } = await import("@/lib/supabase/server");
const { crearClienteAdmin } = await import("@/lib/supabase/admin");
const { leerSheetMedicamentos } = await import("../lib/medicamentos/sheet");
const { SESION_CADUCADA } = await import("@/lib/supabase/sesion");
const { crearPaciente, actualizarPaciente } = await import("@/lib/pacientes/acciones");
const { ESTADO_INICIAL } = await import("@/lib/pacientes/formulario");
const { buscarCie10Accion, buscarMedicamentosAccion, guardarConsultaAccion } = await import("@/lib/consultas/acciones");
const { DATOS_VACIOS } = await import("@/lib/consultas/formulario");
const { previsualizarImportacion, confirmarImportacion } = await import("@/lib/medicamentos/acciones");
const { revalidatePath } = await import("next/cache");
const { redirect } = await import("next/navigation");
const { accionSinVerificacion, accionQueRevalidaAntes, accionQueUsaStorageAntes } = await import(
  "./fixtures/accion-sin-verificacion"
);

instalarFetchDePublic();

type Accion = (...argumentos: unknown[]) => Promise<unknown>;

/** Las acciones que se saltan la regla. Cada una, con su motivo. */
const EXCEPCIONES: Record<string, string> = {
  iniciarSesion: "su trabajo ES autenticar: no puede exigir una sesión que todavía no existe",
  cerrarSesion: "solo cierra la sesión que haya; sin sesión no hay nada que leer ni escribir",
};

// --- El cliente falso ----------------------------------------------------------

/** Una cadena de PostgREST falsa: cualquier método la devuelve y `await` da un error de base. */
function cadena(): unknown {
  const resultado = { data: null, error: { code: "PRUEBA", message: "base falsa de la prueba" }, count: 0 };
  const p: unknown = new Proxy(function () {}, {
    get(_objetivo, propiedad) {
      if (propiedad === "then") {
        return (resolver: (v: unknown) => unknown, rechazar: (e: unknown) => unknown) =>
          Promise.resolve(resultado).then(resolver, rechazar);
      }
      return () => p;
    },
  });
  return p;
}

/**
 * Un cliente de Supabase falso que anota TODO lo que se le pide además de
 * `auth.getUser`: `from`, `rpc`, `storage`, `functions`, otro método de `auth`...
 * Lo que no conoce lo devuelve como cadena falsa, así la acción sigue y queda
 * anotada en vez de reventar con un TypeError que ella misma podría tragarse.
 */
function clienteFalso(usuario: { id: string } | null) {
  const accesos: string[] = [];
  const getUser = vi.fn(async () => ({ data: { user: usuario }, error: null }));
  const from = vi.fn(() => cadena());
  const rpc = vi.fn(() => cadena());
  const auth = new Proxy({ getUser } as Record<string | symbol, unknown>, {
    get(objetivo, propiedad) {
      if (propiedad === "getUser" || typeof propiedad === "symbol" || propiedad === "then") return objetivo[propiedad];
      accesos.push(`auth.${propiedad}`);
      return () => cadena();
    },
  });
  const conocido: Record<string, unknown> = { auth, from, rpc };
  // `then` lo consulta Promise al resolver el cliente desde una función async: no es un uso.
  const cliente = new Proxy(conocido, {
    get(objetivo, propiedad) {
      if (typeof propiedad === "symbol" || propiedad === "then") return undefined;
      if (propiedad !== "auth") accesos.push(propiedad);
      return propiedad in objetivo ? objetivo[propiedad] : cadena();
    },
  });
  return { cliente, getUser, from, rpc, accesos };
}

/** Las únicas excepciones que la prueba provoca a propósito (ver `cadena` y el mock del Sheet). */
const ERRORES_DE_LOS_FALSOS = /base falsa de la prueba|Sheet falso/;

// --- El descubrimiento -----------------------------------------------------------

const RAIZ = process.cwd();
/** Lo que no es código de la app: dependencias, build, pruebas (el ejemplo malo vive ahí) y scripts. */
const NO_SE_RECORRE = new Set([
  "node_modules", "tests", "e2e", "scripts", "supabase", "docs", "public",
  "coverage", "test-results", "playwright-report",
]);
/** Además, toda carpeta oculta: .next, .git, .vercel y .claude (cuyos worktrees son COPIAS del proyecto). */
const esOculta = (nombre: string) => nombre.startsWith(".");
/** La directiva como sentencia (no dentro de un comentario o de un texto entre comillas invertidas). */
const DIRECTIVA = /^\s*["']use server["'];?\s*$/m;

function archivosDeCodigo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return NO_SE_RECORRE.has(e.name) || esOculta(e.name) ? [] : archivosDeCodigo(join(dir, e.name));
    return /\.(ts|tsx|mts|js|mjs)$/.test(e.name) ? [join(dir, e.name)] : [];
  });
}

/** La directiva al principio del archivo, antes de cualquier import o código. */
function esArchivoDeAcciones(codigo: string): boolean {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  return /^\s*["']use server["']/.test(sinComentarios);
}

const conDirectiva = archivosDeCodigo(RAIZ)
  .map((ruta) => ({ ruta, codigo: readFileSync(ruta, "utf8") }))
  .filter(({ codigo }) => DIRECTIVA.test(codigo));
const archivosDeAcciones = conDirectiva.filter(({ codigo }) => esArchivoDeAcciones(codigo)).map(({ ruta }) => ruta);
/** "use server" dentro de una función: una acción que este barrido no sabría llamar. */
const directivasEnLinea = conDirectiva
  .filter(({ codigo }) => !esArchivoDeAcciones(codigo))
  .map(({ ruta }) => relative(RAIZ, ruta));

const descubiertas: { archivo: string; nombre: string; accion: unknown }[] = [];
for (const ruta of archivosDeAcciones) {
  const modulo = (await import(/* @vite-ignore */ ruta.replaceAll("\\", "/"))) as Record<string, unknown>;
  for (const [nombre, accion] of Object.entries(modulo)) {
    descubiertas.push({ archivo: relative(RAIZ, ruta).replaceAll("\\", "/"), nombre, accion });
  }
}

/**
 * Llama a la acción SIN sesión y devuelve lo que hizo mal (vacío si nada).
 *
 * No conoce la firma de la acción: le pasa un `FormData` vacío en cada
 * posición. Alcanza, porque una acción que verifica primero no mira sus
 * argumentos —como mucho los lee del formulario para devolverlos— y una que
 * revienta por ellos ANTES de verificar queda marcada igual.
 */
async function problemasSinSesion(accion: unknown): Promise<string[]> {
  if (typeof accion !== "function") return ["no es una función: un archivo 'use server' solo exporta acciones"];

  const falso = clienteFalso(null);
  vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never);
  for (const espia of [crearClienteAdmin, leerSheetMedicamentos, revalidatePath, redirect]) vi.mocked(espia).mockClear();
  const espiaFetch = vi.spyOn(globalThis, "fetch");

  let resultado: unknown;
  try {
    resultado = await (accion as Accion)(new FormData(), new FormData(), new FormData(), new FormData());
  } catch (error) {
    // Puede ser un error de PostgREST (`{ code, message }`), no un Error.
    const texto = error && typeof error === "object" && "message" in error ? String(error.message) : String(error);
    return [`lanzó en vez de responder SESION_CADUCADA: ${texto}`];
  } finally {
    espiaFetch.mockRestore();
  }

  const problemas: string[] = [];
  if (falso.getUser.mock.calls.length === 0) problemas.push("no llamó a getUser()");
  if (!JSON.stringify(resultado ?? null).includes(SESION_CADUCADA)) problemas.push("no respondió SESION_CADUCADA");
  if (falso.from.mock.calls.length > 0) problemas.push("llamó a .from() sin sesión");
  if (falso.rpc.mock.calls.length > 0) problemas.push("llamó a .rpc() sin sesión");
  const otros = [...new Set(falso.accesos.filter((a) => a !== "from" && a !== "rpc"))];
  if (otros.length > 0) problemas.push(`usó el cliente sin sesión: ${otros.join(", ")}`);
  if (vi.mocked(revalidatePath).mock.calls.length > 0) problemas.push("llamó a revalidatePath() sin sesión");
  if (vi.mocked(redirect).mock.calls.length > 0) problemas.push("llamó a redirect() sin sesión");
  if (espiaFetch.mock.calls.length > 0) problemas.push("llamó a fetch() sin sesión");
  if (vi.mocked(crearClienteAdmin).mock.calls.length > 0) problemas.push("creó el cliente admin sin sesión");
  if (vi.mocked(leerSheetMedicamentos).mock.calls.length > 0) problemas.push("leyó el Sheet sin sesión");
  return problemas;
}

// --- 1. El detector distingue (prueba de la prueba) ----------------------------

describe("el detector distingue (prueba de la prueba)", () => {
  test("una acción sin verificación queda marcada", async () => {
    const problemas = await problemasSinSesion(accionSinVerificacion);
    expect(problemas).toContain("no respondió SESION_CADUCADA");
    expect(problemas).toContain("llamó a .from() sin sesión");
  });

  test("una acción que revalida la caché antes de verificar queda marcada", async () => {
    expect(await problemasSinSesion(accionQueRevalidaAntes)).toEqual(["llamó a revalidatePath() sin sesión"]);
  });

  test("una acción que usa Storage antes de verificar queda marcada", async () => {
    expect(await problemasSinSesion(accionQueUsaStorageAntes)).toEqual(["usó el cliente sin sesión: storage"]);
  });

  test("una acción que verifica pasa", async () => {
    expect(await problemasSinSesion(buscarCie10Accion)).toEqual([]);
  });

  test("la directiva se reconoce al principio del archivo, no en un comentario ni dentro de una función", () => {
    expect(esArchivoDeAcciones(`// cabecera\n/* otra */\n"use server";\nimport x from "y";`)).toBe(true);
    expect(DIRECTIVA.test(" * Un módulo `\"use server\"` solo exporta acciones.")).toBe(false);
    expect(esArchivoDeAcciones(`import x from "y";\nasync function f() {\n  "use server";\n}`)).toBe(false);
  });
});

// --- 2. Todas las acciones descubiertas rechazan sin sesión --------------------

describe("descubrimiento: los archivos 'use server' del proyecto", () => {
  test("los encuentra", () => {
    // Si el barrido dejara de encontrar algo, todo lo demás pasaría en vacío.
    expect(archivosDeAcciones.length).toBeGreaterThanOrEqual(4);
    expect(descubiertas.length).toBeGreaterThanOrEqual(9);
  });

  test("ninguno usa 'use server' dentro de una función", () => {
    // Una acción en línea, dentro de un componente, no se puede importar desde
    // aquí y escaparía a la prueba: va a un archivo de acciones.
    expect(directivasEnLinea).toEqual([]);
  });

  test("ningún nombre de acción se repite (la lista de 'con sesión' va por nombre)", () => {
    const nombres = descubiertas.map((d) => d.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  test("las excepciones existen (una excepción huérfana tapa una acción nueva con ese nombre)", () => {
    const nombres = new Set(descubiertas.map((d) => d.nombre));
    for (const nombre of Object.keys(EXCEPCIONES)) expect(nombres.has(nombre), nombre).toBe(true);
  });
});

describe("sin sesión: cada acción descubierta rechaza y no toca la base", () => {
  for (const { archivo, nombre, accion } of descubiertas) {
    if (nombre in EXCEPCIONES) continue;
    test(`${archivo} → ${nombre}`, async () => {
      expect(await problemasSinSesion(accion)).toEqual([]);
    });
  }
});

// --- 3. Con sesión: pasan la verificación y siguen -----------------------------

/** Cada acción con argumentos válidos para su firma. */
const CON_SESION: Record<string, () => Promise<unknown>> = {
  crearPaciente: () => crearPaciente(ESTADO_INICIAL, formularioPaciente()),
  actualizarPaciente: () =>
    actualizarPaciente("00000000-0000-0000-0000-000000000001", ESTADO_INICIAL, formularioPaciente()),
  guardarConsultaAccion: () => guardarConsultaAccion("00000000-0000-0000-0000-000000000001", DATOS_VACIOS, []),
  buscarCie10Accion: () => buscarCie10Accion("faringitis"),
  buscarMedicamentosAccion: () => buscarMedicamentosAccion("amoxicilina"),
  previsualizarImportacion: () => previsualizarImportacion(),
  confirmarImportacion: () => confirmarImportacion("huella-falsa"),
};

function formularioPaciente() {
  const f = new FormData();
  f.set("nombre_completo", "PRUEBA SESION ACCIONES");
  return f;
}

const mensajeDe = (r: unknown) =>
  r && typeof r === "object" && "mensaje" in r ? (r as { mensaje: unknown }).mensaje : undefined;

beforeEach(() => {
  vi.mocked(crearClienteAdmin).mockClear();
});

describe("con sesión: pasan la verificación y siguen", () => {
  test("la lista cubre exactamente las acciones descubiertas", () => {
    const esperadas = descubiertas.map((d) => d.nombre).filter((n) => !(n in EXCEPCIONES));
    expect(Object.keys(CON_SESION).sort()).toEqual(esperadas.sort());
  });

  for (const [nombre, llamar] of Object.entries(CON_SESION)) {
    test(nombre, async () => {
      const falso = clienteFalso({ id: "00000000-0000-0000-0000-0000000000aa" });
      vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never);

      // Lo que pase después de la verificación (un error de la base falsa,
      // una validación que no pasa) no importa aquí: solo que no se rechazó
      // por sesión. Pero solo se toleran las excepciones de los propios falsos;
      // cualquier otra (un TypeError, por ejemplo) es un fallo de verdad.
      let resultado: unknown;
      try {
        resultado = await llamar();
      } catch (error) {
        // Las búsquedas relanzan el error de PostgREST tal cual: `{ code, message }`, no un Error.
        const texto = error && typeof error === "object" ? String((error as { message?: unknown }).message) : "";
        if (!ERRORES_DE_LOS_FALSOS.test(texto)) throw error;
        resultado = { mensaje: texto };
      }

      expect(falso.getUser).toHaveBeenCalledTimes(1);
      expect(mensajeDe(resultado)).not.toBe(SESION_CADUCADA);
    });
  }
});
