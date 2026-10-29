// tests/entorno.test.ts
//
// La guarda de entorno (lib/entorno.ts) con los refs tomados de variables de
// entorno: sin SUPABASE_REF_DEV nada cuenta como dev, y falla cerrada.

import { afterEach, describe, expect, it, vi } from "vitest";
import { entornoDe, refDe, refDev, refProduccion } from "../lib/entorno";

const URL_DEV = "https://devdemo0000000000000.supabase.co";
const URL_PROD = "https://proddemo000000000000.supabase.co";

afterEach(() => vi.unstubAllEnvs());

describe("entornoDe con los refs en variables de entorno", () => {
  it("reconoce dev y producción por su ref", () => {
    vi.stubEnv("SUPABASE_REF_DEV", "devdemo0000000000000");
    vi.stubEnv("SUPABASE_REF_PRODUCCION", "proddemo000000000000");
    expect(entornoDe(URL_DEV)).toBe("dev");
    expect(entornoDe(URL_PROD)).toBe("produccion");
    expect(refDev()).toBe("devdemo0000000000000");
    expect(refProduccion()).toBe("proddemo000000000000");
  });

  it("producción se reconoce en cualquier parte de la URL", () => {
    vi.stubEnv("SUPABASE_REF_PRODUCCION", "proddemo000000000000");
    expect(entornoDe("https://dominio-propio.example/?ref=proddemo000000000000")).toBe("produccion");
  });

  it("sin SUPABASE_REF_DEV, una URL de Supabase es desconocida (falla cerrada)", () => {
    vi.stubEnv("SUPABASE_REF_DEV", "");
    vi.stubEnv("SUPABASE_REF_PRODUCCION", "");
    expect(refDev()).toBeNull();
    expect(entornoDe(URL_DEV)).toBe("desconocido");
  });

  it("un ref que no es ninguno de los dos es desconocido", () => {
    vi.stubEnv("SUPABASE_REF_DEV", "devdemo0000000000000");
    expect(entornoDe("https://otroproyecto00000000.supabase.co")).toBe("desconocido");
  });

  it("localhost es local y sin URL es sin-configurar", () => {
    expect(entornoDe("http://localhost:54321")).toBe("local");
    expect(entornoDe("")).toBe("sin-configurar");
    expect(entornoDe(undefined)).toBe("sin-configurar");
  });

  it("refDe saca el subdominio solo de *.supabase.co", () => {
    expect(refDe(URL_DEV)).toBe("devdemo0000000000000");
    expect(refDe("http://localhost:54321")).toBeNull();
  });
});
