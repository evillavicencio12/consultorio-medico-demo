---
tags: [diseno, ui]
---

# Sistema de Diseño

Cada token tiene una razón concreta, no solo estética — así se evita que una IA rellene con su plantilla genérica por defecto.

## Tipografía
- **Encabezados/títulos:** IBM Plex Sans, semibold (600) — más carácter geométrico e identidad "técnica/institucional" que Inter (default de casi cualquier IA).
- **Cuerpo/formularios:** IBM Plex Sans, regular (400).
- **Identificadores** (número de receta, código CIE-10, cédula): IBM Plex Mono, regular — comunica "esto es un código", no prosa, y alinea columnas de números.

## Iconos
Lucide Icons únicamente, trazo 1.5px, outline, esquinas redondeadas. Nunca mezclar librerías ni usar iconos multicolor tipo emoji.
- Color por defecto: navy `#163A5B` → turquesa `#2E9C97` en activo/hover. Rojo `#D64545` exclusivo para alertas.

## Colores

| Token | Hex | Uso |
|---|---|---|
| Navy (primario) | `#163A5B` | Texto, encabezados, iconografía por defecto |
| Navy tint 10% | `#E8EEF2` | Fondo de bloques de datos fijos/no editables |
| Teal (acento) | `#2E9C97` | Botones primarios, estados activos, check válido |
| Teal hover/pressed | `#237872` | Botón al presionar |
| Teal tint 10% | `#E3F3F2` | Fondo de etiquetas/badges suaves |
| Rojo (alerta) | `#D64545` | Exclusivo alergias y errores de validación |
| Rojo tint 10% | `#FBEAEA` | Fondo de mensajes de error |
| Texto secundario | `#5B7185` | Gris derivado del navy |
| Borde de input | `#C9D3DB` | Reposo; 2px azul marino en foco |

No hay un tercer color de "éxito" separado — el turquesa cumple ese rol.

## Bordes, radios, sombra
- Radio: 10px tarjetas, 8px inputs/botones — consistente en todo el sistema.
- Sombra: `0 1px 3px rgba(22,58,91,0.08)` — teñida de navy, no negro puro.

## Elemento distintivo — línea de tiempo
Línea conectora turquesa, puntos circulares navy con anillo blanco, fechas en IBM Plex Mono. Es lo que hace reconocible al sistema.

Implementado en la Fase 3 dentro de la ficha del paciente. Dos detalles que se
decidieron al dibujarlo: el conector **se detiene en la última consulta** (una
línea que sigue más allá sugiere que hay más y no hay), y la fecha va en formato
compacto con el mes en letras —`21 ago 2026`— porque la mono invita a escribir
`21/08/2026`, que es la forma ambigua que el proyecto ya descartó.

## Patrones de interacción
- **Navegación:** breadcrumb arriba ("Pacientes / Historial Clínico / Consulta"), secciones colapsables, panel de contexto lateral, jerarquía clara entre botón secundario (discreto) y primario (color sólido).
- **Validación de formulario:** etiqueta siempre visible arriba del campo (nunca solo placeholder); campos relacionados agrupados en fila; borde/texto rojo + ícono de alerta para inválido, borde/check turquesa para válido.
- **Dos columnas en la consulta:** historial clínico a la izquierda (cinco secciones) y receta a la derecha, a partir de `xl` (1280px). Por debajo colapsan a una sola columna apilada. **Ninguna columna tiene scroll propio** — ver [Armazon-de-Pantalla](../arquitectura/Armazon-de-Pantalla.md): `<main>` sigue siendo el único elemento que se desplaza.
- **Rejillas que responden al contenedor, no a la ventana:** dentro de una columna, `sm:`/`lg:` mienten — miden el ancho de la ventana, no el del hueco real. La tarjeta de medicamento usa `@container` y sus rejillas `@sm:` / `@3xl:`, así que se parte en dos mitades solo si de verdad hay sitio. Con `lg:` en una columna de 500px cada campo quedaba en 90px.
- **Áreas de texto que se imprimen:** sin saltos de línea. La tecla Enter no hace nada y lo pegado se une con un espacio, con un aviso en gris —no en rojo: no se pierde nada de lo escrito— que dice por qué. El texto se ajusta solo al ancho del renglón impreso; ver [06-Generador-PDF](../modulos/06-Generador-PDF.md).
- **Secciones colapsables:** `<details>`/`<summary>` nativos, con el chevron de Lucide en lugar del triángulo del navegador (`list-none`). Es el mismo criterio que el `<dialog>` de la vista previa y los tooltips de CSS del rail: teclado y lectores de pantalla salen gratis. Van **abiertas por defecto**, y una sección que esconda un campo con error se abre sola al intentar guardar — un botón que no responde porque el campo culpable está plegado es indistinguible de un botón roto.
- **Barra lateral colapsable (navigation rail):** Pacientes / Nueva Consulta. *(Eran tres: "Historial Clínico" se quitó en la Fase 3, porque el historial de un paciente es su ficha — ver [03-Historial-Clinico](../modulos/03-Historial-Clinico.md). El ejemplo de breadcrumb de arriba, `Pacientes / Historial Clínico / Consulta`, ya lo trataba como algo que cuelga de un paciente.)* Expandido ~240px (ícono + etiqueta); colapsado ~72px (solo ícono + tooltip en hover). Botón de "panel" alterna el estado con animación breve. Ítem activo: fondo teal tint 10% + borde izquierdo sólido turquesa. Útil para maximizar espacio en "Nueva Consulta".

## Dónde viven los tokens (Fase 1)

Todos están en `app/globals.css`, dentro del bloque `@theme` de Tailwind v4, con
**nombre de negocio** (`--color-navy`, `--color-teal`, `--color-rojo`) y no
genérico tipo `primary`/`secondary`. Es a propósito: si alguien pega markup de
Stitch —que trae su propia paleta Material— el choque se ve al instante en vez
de colarse.

Tailwind genera las utilidades desde esos tokens, así que en el markup se
escribe `bg-teal`, `text-navy`, `rounded-tarjeta`, `rounded-control`,
`shadow-clinica`, `w-rail-expandido`. **No se escriben hex sueltos en las
clases.**

Las fuentes se cargan con `next/font/local` en `app/layout.tsx`: IBM Plex Sans
(400 y 600) e IBM Plex Mono (400). Solo esos tres pesos, que son los que este
sistema usa. Tres combinaciones del markup no tienen archivo, igual que con
Google:

- `font-medium` (500): el navegador lo pinta con el 400.
- La cursiva: el navegador la sintetiza.
- Mono en 600 (`identificador` con `font-semibold`): también sintetizado. Lo
  usan la fecha de la línea de tiempo, el N.º de receta, el código CIE-10 de la
  consulta y los contadores de la importación de medicamentos.

Cargar esos archivos cambiaría cómo se ve la app, y eso sería una decisión de
diseño aparte.

**Los archivos viven en el repositorio** (`app/_fuentes/ibm-plex/`, con su
`OFL.txt` y un `README.md` con origen y huellas): el build no descarga nada.
Hasta el 17 de octubre de 2026 salían de Google con `next/font/google`. Ese día
se cambió porque el build dependía de un servicio externo: el CI del PR #5 falló
una vez al pedirlas. Son los `.woff2` **`complete`** de los paquetes oficiales de
IBM, **sin modificar**:

- **No el corte `Latin1`:** le falta el espacio de cifra (U+2007), que
  `formatFechaCorta` usa para alinear los días en la línea de tiempo.
- **No un corte propio:** la OFL reserva el nombre «Plex», y un archivo recortado
  sería una versión modificada.

**Diferencia con la versión de Google: solo antialiasing, sin cambios de
layout.** Google sirve Plex Sans como fuente variable; los `complete` de IBM son
estáticos y tienen su propio *hinting*, así que cambian unos tonos en el borde de
cada letra. Se midió el 17 de octubre de 2026 en Chromium (`next build && next
start`, 1280×720), con las dos versiones, en el login, la lista y la ficha de
pacientes, la consulta, Configuración, el historial y la línea de tiempo:

- **Ancho del texto:**
  - Sans 400 y Mono 400: idéntico al centésimo de píxel.
  - Sans 600: hasta 0,5 px más ancho en 1 300 px de texto a 100 px de cuerpo
    (+0,04 %). Son unos 0,08 px por línea en los encabezados de 16–17 px.
- **Capturas:**
  - Mismos cortes de línea, mismas posiciones y mismos tamaños de caja.
  - Solo cambian píxeles del borde del texto: entre 7 000 y 28 000 de 921 600
    por pantalla. Con el umbral por defecto de Playwright quedan entre 357 y 837.
  - La línea de tiempo sigue alineando «5 oct» con «17 sep». Es Mono 600
    sintetizado, como antes. No se midió en Safari ni Firefox, donde la negrita
    sintética puede ensanchar distinto.
- **Fuente de respaldo:** el Arial ajustado que se ve antes de que cargue Plex
  ahora se calcula con las métricas del archivo de IBM. En Mono, `size-adjust`
  pasa de 134,59 % a 131,49 %. Solo se nota en ese instante, y las fuentes van
  precargadas.

Una actualización de los archivos se trata como esta: misma comparación antes y
después.

**No hay modo oscuro.** El scaffold de Next traía un bloque
`prefers-color-scheme: dark`; se quitó, porque el sistema define una sola paleta
pensada para leerse igual en pantalla y en papel.

### Sobre Stitch

Stitch aporta **composición**, no color ni tipografía. Su proyecto guarda los
tokens correctos en los campos `override*Color`, pero su `namedColors` es la
paleta Material derivada (`primary #002441`, `secondary #006a66`) y es esa la
que aparece en el markup que exporta. Ante cualquier choque mandan los tokens de
esta nota. Ver [Prompts-Stitch](Prompts-Stitch.md).

## Ver también
- [Prompts-Stitch](Prompts-Stitch.md)
- [Índice](../README.md)
