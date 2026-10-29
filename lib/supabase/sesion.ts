import "server-only";

/**
 * La verificación de sesión de TODAS las Server Actions, en un solo sitio.
 *
 * `proxy.ts` protege rutas, no acciones: una Server Action es un endpoint POST
 * propio y se ejecuta desde cualquier ruta que incluya su módulo
 * (docs/arquitectura/Seguridad-OWASP.md). Por eso cada acción empieza con
 * `clienteConSesion()` y, si devuelve `null`, responde `SESION_CADUCADA` sin
 * leer ni escribir nada.
 *
 * `getUser()` y nunca `getSession()`: getSession lee la cookie sin validarla y
 * una cookie manipulada pasaría. Es la misma decisión, con su costo medido,
 * que documenta `proxy.ts`.
 *
 * `server-only` explícito: este módulo decide quién está autenticado y no debe
 * terminar nunca en el bundle del navegador, aunque hoy ya lo impida el import
 * de `server.ts`.
 *
 * Antes eran tres copias (pacientes, consultas, medicamentos) con dos textos
 * distintos; tests/sesion-acciones.test.ts prueba las siete acciones contra
 * esta única implementación.
 */
import { cookies } from "next/headers";
import { esBorrado, escribirCookies, type CookiesAEscribir } from "@/lib/supabase/cookies";
import { crearClienteServidor } from "@/lib/supabase/server";

/**
 * Dice dónde volver a entrar a propósito: en OTRA pestaña. Navegar al login
 * desde esta pantalla perdería lo escrito (la consulta no guarda borrador); al
 * entrar en otra pestaña, la cookie nueva vale también para esta, y basta con
 * volver a intentarlo aquí.
 */
export const SESION_CADUCADA =
  "La sesión caducó. Entra de nuevo en otra pestaña y vuelve a intentarlo aquí: lo escrito no se pierde.";

/** El cliente con la sesión de la doctora, tipado con `Database` (RLS aplica). */
export type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>;

/**
 * El cliente si hay una sesión válida; `null` si no.
 *
 * **Las cookies que `getUser()` quiera escribir se acumulan y se deciden al
 * final.** Si la sesión se revocó (la doctora cerró sesión en otra pestaña),
 * auth-js pide BORRAR las cookies, y en una Server Action escribir cookies hace
 * que Next vuelva a renderizar la página — ya sin sesión: RLS oculta al
 * paciente, la página llama a notFound() y la consulta a medio escribir
 * desaparece. Por eso, sin usuario, los borrados se descartan: la acción
 * responde SESION_CADUCADA y la pantalla se queda como estaba. Las cookies se
 * borran en la siguiente navegación, que pasa por `proxy.ts`.
 *
 * Todo lo demás se escribe, con usuario o sin él: con usuario, para que la
 * renovación del token funcione aunque ocurra aquí; sin usuario, porque una
 * renovación que salió bien antes de que fallara `/user` (por la red, por
 * ejemplo) no se puede tirar sin dejar en el navegador un refresh token ya
 * consumido. Comprobado en Chromium contra dev
 * (docs/arquitectura/Seguridad-OWASP.md).
 */
export async function clienteConSesion(): Promise<ClienteServidor | null> {
  let pendientes: CookiesAEscribir = [];
  let decidido = false;
  const supabase = await crearClienteServidor(async (aEscribir) => {
    // Después de verificar (una renovación durante una consulta posterior), se
    // escribe enseguida y se devuelve la promesa: @supabase/ssr la espera.
    if (decidido) return escribirEnAccion(aEscribir);
    pendientes = pendientes.concat(aEscribir);
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  decidido = true;

  const aEscribir = user ? pendientes : pendientes.filter((cookie) => !esBorrado(cookie));
  if (aEscribir.length > 0) await escribirEnAccion(aEscribir);
  return user ? supabase : null;
}

/**
 * Escribe las cookies desde una Server Action. Si fallara, el navegador se
 * quedaría con un refresh token ya usado (Supabase lo tolera mientras sea el
 * padre del activo, pero la cookie no se actualizaría): por eso se avisa, solo
 * con los nombres de las cookies, nunca su valor.
 */
async function escribirEnAccion(aEscribir: CookiesAEscribir): Promise<void> {
  try {
    escribirCookies(await cookies(), aEscribir);
  } catch {
    console.warn("[supabase] no se pudo escribir la cookie de sesión en una acción:", aEscribir.map((c) => c.name).join(", "));
  }
}
