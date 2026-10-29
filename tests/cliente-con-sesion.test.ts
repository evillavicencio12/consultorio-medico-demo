// clienteConSesion() (lib/supabase/sesion.ts) acumula las cookies que getUser()
// quiera escribir y decide al final: sin usuario descarta los BORRADOS y escribe
// lo demás (una renovación que salió bien antes de que fallara /user).
//
// Sin usuario (sesión revocada), auth-js pide BORRAR las cookies; escribir ese
// borrado desde una Server Action haría que Next vuelva a renderizar la página
// sin sesión y la consulta terminaría en notFound() con lo escrito perdido
// (docs/arquitectura/Seguridad-OWASP.md). Con usuario, la renovación del token
// se tiene que escribir.

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { CookiesAEscribir } from "@/lib/supabase/cookies";

let usuario: { id: string } | null = null;
let escriturasDuranteGetUser: CookiesAEscribir = [];
let escribir: ((cookies: CookiesAEscribir, cabeceras: Record<string, string>) => void | Promise<void>) | undefined;
const set = vi.fn();
let setFalla = false;

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (...argumentos: unknown[]) => {
      if (setFalla) throw new Error("Cookies can only be modified in a Server Action");
      set(...argumentos);
    },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  crearClienteServidor: async (alEscribir?: typeof escribir) => {
    escribir = alEscribir;
    return {
      auth: {
        getUser: async () => {
          if (escriturasDuranteGetUser.length > 0) await escribir?.(escriturasDuranteGetUser, {});
          return { data: { user: usuario }, error: null };
        },
      },
    };
  },
}));

const { clienteConSesion } = await import("@/lib/supabase/sesion");

const BORRADO: CookiesAEscribir = [{ name: "sb-falso-auth-token", value: "", options: { path: "/", maxAge: 0 } }];
const RENOVACION: CookiesAEscribir = [{ name: "sb-falso-auth-token", value: "VALOR-SECRETO", options: { path: "/" } }];

beforeEach(() => {
  usuario = null;
  escriturasDuranteGetUser = [];
  escribir = undefined;
  setFalla = false;
  set.mockClear();
});

describe("clienteConSesion: las cookies de getUser() se acumulan", () => {
  test("sin usuario (sesión revocada): devuelve null y descarta el borrado", async () => {
    escriturasDuranteGetUser = BORRADO;
    expect(await clienteConSesion()).toBeNull();
    expect(set).not.toHaveBeenCalled();
  });

  test("sin usuario pero con una renovación que salió bien (falló /user): la escribe", async () => {
    escriturasDuranteGetUser = RENOVACION;
    expect(await clienteConSesion()).toBeNull();
    expect(set).toHaveBeenCalledWith("sb-falso-auth-token", "VALOR-SECRETO", { path: "/" });
  });

  test("sin usuario, renovación y borrado mezclados: escribe solo la renovación", async () => {
    escriturasDuranteGetUser = [...RENOVACION, { name: "sb-falso-auth-token.1", value: "", options: { path: "/", maxAge: 0 } }];
    expect(await clienteConSesion()).toBeNull();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("sb-falso-auth-token", "VALOR-SECRETO", { path: "/" });
  });

  test("con usuario y token renovado: escribe la cookie nueva", async () => {
    usuario = { id: "00000000-0000-0000-0000-0000000000aa" };
    escriturasDuranteGetUser = RENOVACION;
    expect(await clienteConSesion()).not.toBeNull();
    expect(set).toHaveBeenCalledWith("sb-falso-auth-token", "VALOR-SECRETO", { path: "/" });
  });

  test("con usuario: lo que se escriba después de verificar va directo", async () => {
    usuario = { id: "00000000-0000-0000-0000-0000000000aa" };
    expect(await clienteConSesion()).not.toBeNull();
    expect(set).not.toHaveBeenCalled();
    // Se devuelve la promesa: @supabase/ssr la espera, así que al resolverse ya se escribió.
    await escribir?.(RENOVACION, {});
    expect(set).toHaveBeenCalledTimes(1);
  });

  test("si la escritura falla, avisa con el nombre de la cookie y nunca con su valor", async () => {
    usuario = { id: "00000000-0000-0000-0000-0000000000aa" };
    escriturasDuranteGetUser = RENOVACION;
    setFalla = true;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await clienteConSesion();
      expect(aviso).toHaveBeenCalledTimes(1);
      const texto = aviso.mock.calls[0].join(" ");
      expect(texto).toContain("sb-falso-auth-token");
      expect(texto).not.toContain("VALOR-SECRETO");
    } finally {
      aviso.mockRestore();
    }
  });
});
