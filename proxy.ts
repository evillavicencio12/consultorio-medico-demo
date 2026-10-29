import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { esBorrado, type CookiesAEscribir } from "@/lib/supabase/cookies";
import { clavePublicable, urlSupabase } from "@/lib/supabase/env";

/**
 * Protección de rutas + refresco de sesión.
 *
 * Se llama `proxy.ts` y no `middleware.ts` a propósito: la convención
 * `middleware` quedó **deprecada en Next.js 16** y se renombró a `proxy`
 * (ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 * Misma funcionalidad, otro nombre de archivo y de export.
 *
 * Hace dos cosas, y las dos importan:
 *
 *  1. **Refresca el token de Supabase.** Los tokens caducan; un Server
 *     Component no puede escribir cookies, así que si nadie los renueva la
 *     doctora se queda sin sesión a mitad de una consulta. Aquí sí se puede
 *     escribir, por eso el refresco vive en este archivo.
 *
 *  2. **Redirige al login lo no autenticado.** Sin esto, las pantallas de
 *     pacientes e historial serían accesibles con solo escribir la URL.
 */

/** Rutas alcanzables sin sesión. Todo lo demás exige estar autenticado. */
const RUTAS_PUBLICAS = ["/login"];

export async function proxy(request: NextRequest) {
  // La respuesta se va mutando con las cookies que Supabase quiera renovar.
  let respuesta = NextResponse.next({ request });
  // Y se anotan, para el POST de acción sin sesión (ver más abajo).
  let escritas: CookiesAEscribir = [];

  const supabase = createServerClient(urlSupabase(), clavePublicable(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesAEscribir) {
        escritas = escritas.concat(cookiesAEscribir);
        for (const { name, value } of cookiesAEscribir) {
          request.cookies.set(name, value);
        }
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesAEscribir) {
          respuesta.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` y no `getSession()`: getSession lee la cookie sin validarla,
  // así que una cookie manipulada pasaría. getUser la verifica contra el
  // servidor de Supabase. Es la diferencia entre comprobar la sesión y creerle.
  //
  // Cuesta 356-470 ms por petición, y es lo más caro de toda la app: más que
  // las consultas a la base. Medido, aceptado y documentado en
  // docs/modulos/01-Autenticacion.md y docs/modulos/02-Gestion-Pacientes.md. Si vienes
  // aquí a optimizar, lee esas notas primero: cambiarlo por getSession() es la
  // regresión de seguridad que este comentario describe, no una mejora.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esPublica = RUTAS_PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (!user && !esPublica) {
    // Única excepción: el POST de una Server Action (Next lo marca con la
    // cabecera `next-action`). Redirigirlo no protege nada —la acción verifica
    // la sesión dentro de sí misma con `clienteConSesion()`, y
    // tests/sesion-acciones.test.ts lo exige a todas— y en cambio rompe la
    // pantalla: el fetch de la acción recibía el HTML del login, el cliente
    // lanzaba y la doctora veía "catálogo caído" o "revisa la conexión" en vez
    // de "la sesión caducó", con lo escrito en riesgo. Dejándolo pasar, la
    // acción responde SESION_CADUCADA y el formulario conserva lo escrito.
    // Un GET, o un POST sin la cabecera, se redirige como siempre.
    //
    // Y SIN propagar el borrado de las cookies, ni a la respuesta ni a la
    // petición:
    // - no `respuesta`: con la sesión revocada lleva el borrado que pidió
    //   getUser(), y una respuesta de Server Action que cambia cookies hace que
    //   Next vuelva a renderizar la página, ya sin sesión; la consulta termina
    //   en notFound() con lo escrito perdido. Una renovación que sí salió bien
    //   (y después falló `/user`, por la red) se propaga igual: tirarla dejaría
    //   en el navegador un refresh token ya consumido (ver lib/supabase/cookies.ts);
    // - `next()` sin `{ request }`: así la acción recibe la petición tal como
    //   llegó, y es `clienteConSesion()` la que ve la sesión revocada y descarta
    //   el borrado. Con `{ request }` reenviaría las cookies ya vaciadas por el
    //   setAll de arriba y esa segunda capa no se ejercitaría nunca.
    // El borrado lo hace la siguiente navegación: el GET se redirige al login,
    // y el proxy, en /login, borra las cookies. Comprobado en Chromium contra
    // dev; ver docs/arquitectura/Seguridad-OWASP.md.
    if (request.method === "POST" && request.headers.has("next-action")) {
      const siguiente = NextResponse.next();
      for (const cookie of escritas) {
        if (!esBorrado(cookie)) siguiente.cookies.set(cookie.name, cookie.value, cookie.options);
      }
      return siguiente;
    }

    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    // Se recuerda a dónde iba para devolverla ahí después de entrar, en vez de
    // dejarla siempre en la pantalla inicial.
    destino.searchParams.set("volverA", `${ruta}${request.nextUrl.search}`);
    return NextResponse.redirect(destino);
  }

  // Ya autenticada, el login no tiene nada que ofrecerle.
  if (user && esPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/pacientes";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  /*
   * Sin `matcher`, esto correría también sobre _next/static, las imágenes
   * optimizadas y todo lo de public/ — y la redirección al login dejaría al CSS
   * y al JS sin cargar. Se excluyen esas rutas y cualquier archivo con
   * extensión (las plantillas PDF de public/templates entre ellas: son
   * formularios en blanco, sin dato de paciente).
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
