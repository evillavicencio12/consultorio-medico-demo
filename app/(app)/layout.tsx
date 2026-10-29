import { NavigationRail } from "./rail";

/**
 * Layout de las pantallas autenticadas.
 *
 * `(app)` es un grupo de rutas: agrupa sin aparecer en la URL, así
 * /pacientes sigue siendo /pacientes y el login queda fuera de este layout
 * —una pantalla de login con barra lateral no tendría sentido.
 *
 * Quién puede entrar aquí lo decide `proxy.ts`, no este archivo.
 *
 * ## El armazón está FUERA DEL FLUJO, y es la tercera versión
 *
 * Van tres intentos de lo mismo —que haya **un solo scroll, dentro de
 * `<main>`**— y conviene saber por qué el actual es distinto de los otros dos:
 *
 *  1. `min-h-screen`: el contenedor se estiraba con el contenido, así que con
 *     los 164 pacientes en pantalla el rail medía lo mismo que la lista y
 *     "Cerrar sesión" —anclado a su fondo— quedaba a dos mil píxeles de la
 *     vista.
 *  2. `h-dvh` + `overflow-hidden`: arregló el rail y funcionó en el listado,
 *     pero seguía **en el flujo**. `<body>` es `min-h-full`, o sea que puede
 *     crecer; bastaba que algo empujara el documento un poco para que
 *     apareciera una segunda barra de desplazamiento, la del navegador, además
 *     de la de `<main>`. Al bajar, el armazón entero subía: del rail solo
 *     quedaba visible su parte inferior, con "Cerrar sesión" flotando sobre el
 *     hueco vacío de la lista. Pasaba en los formularios de paciente y no en
 *     el listado, con exactamente el mismo marcado — el disparador era de
 *     ejecución, no de estructura.
 *  3. **`fixed inset-0`** (esto). El armazón deja de estar en el flujo del
 *     documento, así que su aportación al alto de `<body>` es **cero**: por
 *     mucho que crezca lo que hay dentro, el documento no tiene nada que
 *     desplazar y el navegador no puede dibujar esa segunda barra. Deja de
 *     depender de que `100dvh` y el `100%` de `<html>` coincidan, que es la
 *     clase de igualdad que se rompe con zoom fraccionario, barras dinámicas o
 *     una barra horizontal inesperada.
 *
 * `inset-0` y no `h-dvh`: el bloque contenedor de un elemento fijo ya es el
 * viewport, así que anclarlo por los cuatro lados lo hace medir exactamente lo
 * visible, sin unidades de por medio. En un navegador móvil eso equivale al
 * viewport pequeño —el que no incluye la barra de direcciones—, que es
 * justamente el criterio por el que en su día se eligió `dvh` sobre `vh`.
 *
 * Lo que NO cambia: `<main>` sigue siendo el único elemento con scroll, y el
 * rail sigue midiendo el alto del armazón (ahora, el de la ventana) para que su
 * pie quede siempre a la vista.
 *
 * `<body>` conserva `min-h-full flex flex-col` porque el LOGIN lo necesita: su
 * tarjeta se centra con `flex-1` contra ese contenedor. Este layout no lo toca.
 */
export default function LayoutApp({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <NavigationRail />
      {/* `overflow-auto` y no solo `-x`: el desplazamiento vertical del
          contenido ocurre aquí dentro, no en el documento. `min-w-0` sigue
          haciendo falta para que un contenido ancho no empuje al rail. */}
      <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
