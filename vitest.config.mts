import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Termina en separador ("…/consultorio-medico-demo/"), así "@/lib/x" queda "…/lib/x".
const raiz = fileURLToPath(new URL("./", import.meta.url));

// `.env` es el entorno de DEV (docs/arquitectura/Entornos.md). Si existe, las
// pruebas que tocan la base corren contra dev; si no existe —el CI—, se saltan
// con `skip`, no fallan. Nunca se carga `.env.produccion`: las pruebas que
// tocan la base comprueban además que la URL sea la de dev (lib/entorno.ts).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    // Solo `@/…`: un alias "@" a secas también capturaría "@supabase/ssr".
    alias: [{ find: /^@\//, replacement: raiz }],
  },
  test: {
    globalSetup: ["tests/preparar.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unidad",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/hoy.test.ts"],
        },
      },
      {
        // El proceso en UTC, como en Vercel: el día de "hoy" tiene que salir
        // igual de lib/fechas.ts (docs/arquitectura/Trampas-Recurrentes.md).
        extends: true,
        test: {
          name: "hoy",
          environment: "node",
          include: ["tests/hoy.test.ts"],
          env: { TZ: "UTC" },
        },
      },
    ],
  },
});
