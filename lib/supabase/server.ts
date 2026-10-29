import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { escribirCookies } from "./cookies";
import { clavePublicable, urlSupabase } from "./env";
import type { Database } from "./tipos";

/**
 * Cliente de Supabase para el SERVIDOR, con la sesión de la doctora.
 *
 * Usa la clave PUBLICABLE, no la secreta, y esto es deliberado: lee la sesión
 * desde las cookies, así que las consultas corren como `authenticated` y **RLS
 * se aplica**. CLAUDE.md y Seguridad-OWASP.md exigen RLS en todas las tablas de
 * pacientes y consultas; un cliente de servidor con la clave secreta la saltaría
 * en cada consulta y dejaría esas políticas de adorno.
 *
 * Cuando de verdad haga falta saltar RLS (importaciones, mantenimiento), está
 * `./admin`, separado a propósito para que su uso se vea en el import.
 *
 * `cookies()` es asíncrono en Next 16, por eso esta función es `async`.
 *
 * `escribir`, si se pasa, reemplaza la escritura de cookies: la usa
 * `clienteConSesion()` (./sesion.ts) para decidir ella si una escritura se hace
 * o se descarta. Sin él, se escriben como siempre.
 */
export async function crearClienteServidor(escribir?: SetAllCookies) {
  const cookieStore = await cookies();

  return createServerClient<Database>(urlSupabase(), clavePublicable(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesAEscribir, cabeceras) {
        if (escribir) return escribir(cookiesAEscribir, cabeceras);
        try {
          escribirCookies(cookieStore, cookiesAEscribir);
        } catch {
          // Un Server Component no puede escribir cookies. No es un error: el
          // refresco del token lo hace `proxy.ts` en cada petición, que sí
          // puede. Tragarlo aquí evita reventar el render por eso.
        }
      },
    },
  });
}
