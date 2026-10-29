import "server-only";

import { createClient } from "@supabase/supabase-js";
import { claveSecreta, urlSupabase } from "./env";
import type { Database } from "./tipos";

/**
 * Cliente ADMINISTRATIVO: usa la clave secreta y por lo tanto **salta RLS**.
 *
 * ⚠️ Es la única puerta del sistema que ve todas las filas sin importar la
 * sesión. Antes de usarlo, la pregunta es siempre: ¿de verdad hace falta saltar
 * RLS, o alcanza con `./server`? Para cualquier cosa que la doctora hace desde
 * la aplicación, alcanza con `./server`.
 *
 * Usos legítimos: importaciones de catálogos y tareas de mantenimiento que
 * corren fuera de una sesión.
 *
 * `server-only` hace que el build FALLE si este módulo termina alcanzado desde
 * un componente de cliente — la protección no depende de recordar la regla.
 *
 * No persiste sesión ni refresca tokens: no hay usuario, hay una clave.
 */
export function crearClienteAdmin() {
  return createClient<Database>(urlSupabase(), claveSecreta(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
