---
tags: [arquitectura, ui]
---

# Armazón de pantalla — un solo scroll

Cómo se sostiene la ventana de las pantallas autenticadas: la barra lateral a la
izquierda, el contenido a la derecha, y **una sola barra de desplazamiento**.

Vive en `app/(app)/layout.tsx` y no en [Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md) a propósito: aquello
describe tokens y componentes, esto es una decisión de estructura que ya se
equivocó dos veces y conviene que tenga su propio sitio donde constar.

## El contrato

1. El armazón mide **exactamente la ventana** y nunca crece con el contenido.
2. **`<main>` es el único elemento con scroll.** Ni el documento, ni el rail, ni
   ninguna pantalla de dentro.
3. El rail está **siempre completo y quieto**: logo, los tres ítems y "Cerrar
   sesión" visibles pase lo que pase.

## Tres intentos

Los tres compilaban. Ninguno de los dos primeros fallos lo cazó `tsc`, `eslint`
ni `next build` — por eso hay una prueba que los fija (ver abajo).

### 1. `min-h-screen` — el pie del rail se iba de la vista

El contenedor se estiraba con el contenido. Con los 164 pacientes en pantalla el
rail medía lo mismo que la lista, y "Cerrar sesión" —anclado a su fondo— quedaba
a dos mil píxeles de la vista.

### 2. `h-dvh` + `overflow-hidden` — dos barras a la vez

Arregló el rail y funcionó en el listado durante toda una fase. Pero el armazón
seguía **dentro del flujo del documento**, y `<body>` es `min-h-full`, o sea que
puede crecer. Bastaba que algo empujara el documento un poco para que apareciera
una segunda barra, la del navegador, además de la de `<main>`.

Cómo se veía, que es lo que hace reconocible el fallo: al bajar, el armazón
entero subía; del rail solo quedaba visible su parte inferior, con "Cerrar
sesión" flotando sobre el hueco vacío de la lista de ítems. Al volver arriba,
el fondo blanco del rail repintaba mal y tapaba media pantalla.

Apareció en los formularios de paciente y **no** en el listado, con exactamente
el mismo marcado renderizado. El disparador era de ejecución, no de estructura, y
no llegó a aislarse.

### 3. `fixed inset-0` — el actual

El armazón deja de estar en el flujo, así que su aportación al alto de `<body>`
es **cero**. Por mucho que crezca lo que hay dentro, el documento no tiene nada
que desplazar y el navegador no puede dibujar esa segunda barra: el fallo se
vuelve imposible en lugar de improbable, con cualquier disparador y en cualquier
pantalla.

De paso deja de depender de que `100dvh` y el `100%` de `<html>` coincidan, que
es la clase de igualdad que se rompe con zoom fraccionario, con una barra
horizontal inesperada o con las barras dinámicas de un navegador móvil.

`inset-0` y no `h-dvh`: el bloque contenedor de un elemento fijo ya es el
viewport, así que anclarlo por los cuatro lados lo hace medir exactamente lo
visible, sin unidades de por medio. En móvil eso equivale al viewport pequeño
—el que no incluye la barra de direcciones—, que es el mismo criterio por el que
en su día se prefirió `dvh` sobre `vh`.

## `<body>` no se toca

Sigue siendo `min-h-full flex flex-col` porque **el login lo necesita**: su
tarjeta se centra con `flex-1` contra ese contenedor, y el login está fuera de
este layout. La corrección es solo del armazón autenticado.

Por eso tampoco se recurrió a `overflow: hidden` en `<body>`, que habría sido la
otra salida: en CSS ese valor se propaga al viewport y habría dejado el login sin
poder desplazarse en una ventana baja.

## Dos columnas, y por qué NO tienen scroll propio (Fase 4B)

La pantalla de consulta pasó a dos columnas para reducir el scroll vertical.
La pregunta obligada era si cada columna debía desplazarse por su cuenta. **No.**

- Un scroll por columna exige acotarle el alto, o sea volver a atar una altura a
  la de la ventana. Eso es exactamente lo que rompió el **segundo intento**
  (`h-dvh`): la igualdad entre el alto calculado y el visible se rompe con zoom
  fraccionario, con una barra horizontal inesperada o con las barras dinámicas
  de un navegador móvil.
- La regla 2 del contrato dejaría de ser cierta, y con ella la única propiedad
  que hace imposible el fallo del rail: si nada dentro del armazón se desplaza
  salvo `<main>`, no hay una segunda barra que pueda aparecer.
- Y en uso: dos barras juntas obligan a adivinar cuál mueve la rueda del ratón,
  y el botón de guardar pertenece al formulario entero, no a una columna.

Las dos columnas son una rejilla (`grid`) que crece con su contenido, dentro del
scroll de `<main>` como todo lo demás. `items-start` evita que la columna corta
se estire al alto de la larga.

**Lo que esto implica para el futuro:** cualquier pantalla nueva de dos paneles
se resuelve igual. Si algún día hace falta de verdad un panel que se quede fijo
mientras el otro se desplaza, no se hace con un `overflow` nuevo sino con
`position: sticky`, que no crea un contenedor de scroll.

## Qué lo vigila

`npm run test:formulario-ui` y `npm run test:consulta-ui` comprueban que el armazón siga fuera del flujo, que
no vuelva a depender de un alto en unidades de viewport, que `<main>` sea el
único con `overflow-auto`, que ninguna pantalla bajo `app/` use `min-h-screen`, y
que el formulario de paciente no se traiga su propio contenedor con scroll.

No sustituye a mirar la pantalla —ninguna de estas pruebas ve dos barras de
desplazamiento— pero deja por escrito lo que se rompió y evita que vuelva por
descuido.

## Ver también
- [Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md) — el rail y sus dos anchos
- [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md)
- [Índice](../README.md)
