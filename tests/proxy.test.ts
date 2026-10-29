// proxy.ts protege PÁGINAS: sin sesión, todo se redirige al login salvo el POST
// de una Server Action (cabecera `next-action`), que pasa para que la propia
// acción responda SESION_CADUCADA (docs/arquitectura/Seguridad-OWASP.md).
//
// Esta prueba fija:
//   - que la excepción es exactamente esa y no más ancha: un GET con la
//     cabecera, o un POST sin ella, se siguen redirigiendo;
//   - que ese POST, sin usuario válido, pasa SIN propagar el borrado de las
//     cookies (con la sesión revocada, getUser() pide borrarlas, y una respuesta
//     de acción que cambia cookies hace que Next vuelva a renderizar la página
//     sin sesión → notFound() y la consulta a medio escribir se pierde), pero sí
//     una renovación que salió bien;
//   - que el proxy llama a getUser() también en los POST de acciones. Se probó
//     quitarlo (Paso 4): ahorraba ~125 ms por búsqueda, pero la renovación y el
//     borrado pasaban a hacerse dentro de la acción. Antes de volver a quitarlo,
//     lee el motivo en Seguridad-OWASP.md.

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

type Escritura = { name: string; value: string; options: Record<string, unknown> };
type Opciones = { cookies: { setAll: (cookies: Escritura[]) => void } };

let usuario: { id: string } | null = null;
/** Lo que auth-js le pide escribir al proxy durante getUser(): nada, un borrado o una renovación. */
let escrituras: Escritura[] = [];

const BORRADO: Escritura[] = [{ name: "sb-falso-auth-token", value: "", options: { path: "/", maxAge: 0 } }];
const RENOVACION: Escritura[] = [{ name: "sb-falso-auth-token", value: "base64-nuevo", options: { path: "/" } }];

vi.mock("@/lib/supabase/env", () => ({
  urlSupabase: () => "https://falso.supabase.co",
  clavePublicable: () => "clave-falsa",
}));
const getUser = vi.fn();
const createServerClient = vi.fn((_url: string, _clave: string, opciones: Opciones) => ({
  auth: {
    getUser: async () => {
      getUser();
      if (escrituras.length > 0) opciones.cookies.setAll(escrituras);
      return { data: { user: usuario }, error: null };
    },
  },
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const { proxy } = await import("../proxy");

const BASE = "http://localhost:3000";
const ID = "00000000-0000-0000-0000-000000000001";

function peticion(ruta: string, metodo: string, conCabeceraDeAccion: boolean) {
  return new NextRequest(`${BASE}${ruta}`, {
    method: metodo,
    headers: conCabeceraDeAccion ? { "next-action": "0123456789abcdef" } : {},
  });
}

/** `null` si la deja pasar; la ruta de destino si redirige. */
function destino(respuesta: Response): string | null {
  if (respuesta.headers.get("x-middleware-next") === "1") return null;
  expect(respuesta.status).toBe(307);
  const url = new URL(respuesta.headers.get("location") ?? "");
  return `${url.pathname}${url.search}`;
}

const cookiesDe = (respuesta: Response) => respuesta.headers.getSetCookie();

beforeEach(() => {
  usuario = null;
  escrituras = [];
  getUser.mockClear();
  createServerClient.mockClear();
});

describe("sin sesión", () => {
  test("GET a /pacientes redirige al login", async () => {
    expect(destino(await proxy(peticion("/pacientes", "GET", false)))).toBe("/login?volverA=%2Fpacientes");
  });

  test("GET a /pacientes CON cabecera next-action redirige igual", async () => {
    expect(destino(await proxy(peticion("/pacientes", "GET", true)))).toBe("/login?volverA=%2Fpacientes");
  });

  test("POST sin cabecera next-action redirige", async () => {
    expect(destino(await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", false)))).toMatch(/^\/login\?/);
  });

  test("otro método con la cabecera (PUT) redirige", async () => {
    expect(destino(await proxy(peticion(`/pacientes/${ID}/consulta`, "PUT", true)))).toMatch(/^\/login\?/);
  });

  test("POST con cabecera next-action pasa y verifica con getUser(): la acción decide", async () => {
    expect(destino(await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", true)))).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test("POST con next-action: una renovación que salió bien (y luego falló /user) sí se propaga", async () => {
    escrituras = RENOVACION;
    const respuesta = await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", true));
    expect(destino(respuesta)).toBeNull();
    expect(cookiesDe(respuesta).some((c) => c.startsWith("sb-falso-auth-token=base64-nuevo"))).toBe(true);
  });

  test("/login es pública", async () => {
    expect(destino(await proxy(peticion("/login", "GET", false)))).toBeNull();
  });
});

describe("sesión revocada (getUser() pide borrar las cookies)", () => {
  beforeEach(() => {
    escrituras = BORRADO;
  });

  test("POST con next-action pasa SIN propagar el borrado, ni a la respuesta ni a la petición", async () => {
    const respuesta = await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", true));
    expect(destino(respuesta)).toBeNull();
    expect(cookiesDe(respuesta)).toEqual([]);
    // Sin estas cabeceras, la acción recibe las cookies tal como llegaron y es
    // clienteConSesion() la que descarta el borrado.
    expect(respuesta.headers.get("x-middleware-request-cookie")).toBeNull();
    expect(respuesta.headers.get("x-middleware-override-headers")).toBeNull();
  });

  test("GET a /pacientes redirige al login", async () => {
    expect(destino(await proxy(peticion("/pacientes", "GET", false)))).toBe("/login?volverA=%2Fpacientes");
  });

  test("GET a /login (el destino de esa redirección) borra las cookies", async () => {
    const respuesta = await proxy(peticion("/login", "GET", false));
    expect(destino(respuesta)).toBeNull();
    expect(cookiesDe(respuesta).some((c) => c.startsWith("sb-falso-auth-token=") && /Max-Age=0/i.test(c))).toBe(true);
  });
});

describe("con sesión", () => {
  beforeEach(() => {
    usuario = { id: "00000000-0000-0000-0000-0000000000aa" };
  });

  test("GET a /pacientes pasa y llama a getUser() (renueva la cookie)", async () => {
    expect(destino(await proxy(peticion("/pacientes", "GET", false)))).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test("POST con cabecera next-action pasa y el proxy TAMBIÉN llama a getUser()", async () => {
    expect(destino(await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", true)))).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test("POST con next-action y token caducado: la renovación viaja en la respuesta del proxy", async () => {
    escrituras = RENOVACION;
    const respuesta = await proxy(peticion(`/pacientes/${ID}/consulta`, "POST", true));
    expect(destino(respuesta)).toBeNull();
    expect(cookiesDe(respuesta).some((c) => c.startsWith("sb-falso-auth-token=base64-nuevo"))).toBe(true);
  });

  test("GET a /login redirige a /pacientes", async () => {
    expect(destino(await proxy(peticion("/login", "GET", false)))).toBe("/pacientes");
  });
});
