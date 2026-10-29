/**
 * Resolución de las variables de entorno de Supabase.
 *
 * Supabase renombró sus claves: `anon key` pasó a llamarse **publishable key** y
 * `service_role key` pasó a **secret key**. Este proyecto se creó con los
 * nombres viejos, así que se aceptan los dos y se prefiere el nuevo. Así el
 * `.env` actual sigue funcionando y migrar es solo renombrar una variable.
 */

function requerida(nombre: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Ver .env.example en la raíz del repositorio.`
    );
  }
  return valor;
}

export function urlSupabase(): string {
  return requerida("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Clave PÚBLICA. Puede verse en el navegador sin riesgo: lo que protege los
 * datos es RLS, no que esté oculta (Seguridad-OWASP.md).
 *
 * Las dos variantes llevan prefijo `NEXT_PUBLIC_` a propósito — tienen que
 * llegar al bundle del cliente. Next reemplaza estos accesos en tiempo de
 * compilación, por eso se escriben completos y no como `process.env[nombre]`.
 */
export function clavePublicable(): string {
  // `||` y no `??`: una variable presente pero vacía (`X=` copiado de
  // .env.example) no debe tapar a la otra.
  const valor =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return requerida(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    valor
  );
}

/**
 * Clave SECRETA. Salta RLS por completo.
 *
 * ⚠️ NUNCA lleva prefijo `NEXT_PUBLIC_`: ese prefijo es literalmente la
 * instrucción a Next de incrustar el valor en el JavaScript que se descarga el
 * navegador. Con esta clave expuesta, cualquiera leería y borraría el historial
 * clínico completo, RLS incluida.
 *
 * Solo se usa desde `lib/supabase/admin.ts`, que a su vez solo puede importarse
 * desde código de servidor.
 */
export function claveSecreta(): string {
  const valor = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return requerida("SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY)", valor);
}
