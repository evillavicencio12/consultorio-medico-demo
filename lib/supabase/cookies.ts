import type { SetAllCookies } from "@supabase/ssr";

/**
 * Las cookies de sesión que @supabase/ssr pide escribir, y la distinción que
 * importa entre ellas (docs/arquitectura/Seguridad-OWASP.md).
 *
 * Sin `server-only`: lo usan `proxy.ts` y `./sesion.ts`.
 */

/** Lo que @supabase/ssr pasa a `setAll` de una vez: nombre, valor y opciones de cada cookie. */
export type CookiesAEscribir = Parameters<SetAllCookies>[0];

/**
 * Un borrado: así pide auth-js quitar la sesión (valor vacío, `maxAge` 0), por
 * ejemplo cuando descubre que se revocó.
 *
 * Es lo único que se descarta en la respuesta de una Server Action sin sesión:
 * escribir cookies ahí hace que Next vuelva a renderizar la página, ya sin
 * sesión, y la consulta termina en notFound(). Una RENOVACIÓN, en cambio, se
 * escribe aunque después haya fallado `/user` (por la red, por ejemplo):
 * tirarla dejaría en el navegador un refresh token que Supabase ya consumió.
 */
export function esBorrado(cookie: CookiesAEscribir[number]): boolean {
  return cookie.value === "" || cookie.options?.maxAge === 0;
}

/** Lo mínimo que hace falta de `cookies()` de next/headers para escribir. */
type AlmacenDeCookies = { set: (nombre: string, valor: string, opciones?: CookiesAEscribir[number]["options"]) => unknown };

/** Escribe las cookies. Lanza si el contexto no lo permite (un Server Component). */
export function escribirCookies(almacen: AlmacenDeCookies, aEscribir: CookiesAEscribir): void {
  for (const { name, value, options } of aEscribir) almacen.set(name, value, options);
}
