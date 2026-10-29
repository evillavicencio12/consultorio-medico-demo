"use client";

import { createBrowserClient } from "@supabase/ssr";
import { clavePublicable, urlSupabase } from "./env";
import type { Database } from "./tipos";

/**
 * Cliente de Supabase para el NAVEGADOR. Usa la clave publicable, así que todo
 * lo que consulte pasa por RLS con la sesión de la doctora.
 *
 * `createBrowserClient` ya devuelve la misma instancia en llamadas sucesivas,
 * de modo que llamarlo desde varios componentes no abre varias conexiones ni
 * duplica el refresco del token.
 */
export function crearClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase(), clavePublicable());
}
