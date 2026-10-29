---
tags: [modulo, pdf]
---

# Módulo 6 — Generador de PDF (Overlay)

Toma la plantilla física (receta bipartita o historial) como fondo, e imprime encima los datos de la consulta, paciente y medicamentos, usando `pdf-lib` del lado del cliente.

- El nombre del prescriptor y su registro profesional son dato fijo de configuración del sistema — no se escriben en cada consulta.
- El espacio de firma y sello queda en blanco para firma física tras imprimir.

## Dos botones independientes
Uno para el PDF de la receta bipartita y otro para el PDF del historial clínico. Cada botón abre una **vista previa dentro de la misma página** (sin navegar a otra URL ni forzar descarga), con opción de imprimir ahí mismo.

## La vista previa, implementada (RF-19, Fase 3)

`app/(app)/vista-previa-pdf.tsx` — un `<dialog>` nativo sobre la pantalla
actual. Se eligió el elemento nativo y no un `div` con posición fija porque da
gratis lo que casi nadie escribe bien a mano: foco atrapado dentro del modal,
cierre con `Escape`, resto de la página inerte para los lectores de pantalla, y
estar por encima de todo sin pelear con `z-index`.

El PDF **se genera al abrir la vista previa**, no al cargar la pantalla:
generarlo cuesta —cargar la plantilla, incrustar la fuente— y hacerlo por
adelantado significaría generar uno por cada consulta de la línea de tiempo,
incluidos los que nadie va a mirar.

Imprimir imprime **el marco**, no la página: `window.print()` sacaría el rail y
la ficha por la impresora en vez del documento.

El componente vive en `app/(app)/` y no dentro de `pacientes/` porque la Fase 4
lo va a necesitar igual al generar una consulta nueva — ahí es donde más
importa, porque es lo último que se mira antes de imprimir y firmar.

Si el contenido no cabe (ADR-005 / ADR-007), el modal muestra el mensaje del
error, que ya nombra el campo concreto, en vez de un "no se pudo generar" que no
diría qué arreglar.

## Generación por consulta, no por paciente
Cada consulta genera su propio PDF de historial y su propio PDF de receta. No existe un PDF único acumulado. Desde la línea de tiempo del Historial Clínico, cada consulta pasada tiene sus dos botones.

## Pacientes con campos vacíos por migración histórica (resuelto)

Por [ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md) hay pacientes migrados sin `sexo`, `documento` o `fecha_nacimiento`. Supabase entrega esos campos como `null`, nunca como texto vacío (verificado contra la base real: de 164 pacientes, 83 sin cédula, 29 sin fecha de nacimiento y **164 sin sexo**, porque el Sheet de origen no traía esa columna).

El comportamiento ya está implementado y probado:

| Campo ausente | Historial | Receta |
|---|---|---|
| `fecha_nacimiento` | "Edad" imprime `—` | "Edad" imprime `No registrada`; "Meses" queda vacío |
| `sexo` | "Sexo" imprime `—` | no se imprime en la receta |
| `documento` | ninguna plantilla tiene campo de documento — no se imprime en ningún lado | ídem |

**Por qué dos marcadores distintos.** Se midieron los dos huecos con `scripts/extract-text-positions.mjs`: en la receta el campo "Edad" tiene ~122pt libres hasta "Meses:", donde entra texto de sobra; en el historial "Edad: _" y "Sexo:_" son un guion bajo apretado entre dos etiquetas, con ~10pt útiles — dos dígitos a 8pt, y por eso la edad normal se imprime "34" y no "34 años". **En este campo puntual la receta tiene más espacio que el historial, no menos**, aunque la receta sea la plantilla más apretada en conjunto. La raya es lo máximo que cabe ahí, y es la opción que esta misma nota ya admitía ("dejar en blanco o '—', nunca texto roto").

**Revisado sobre papel y aprobado (20 de agosto de 2026).** Existía la duda de si la raya podía confundirse con el guion bajo de la plantilla al leer de corrido. La doctora revisó el impreso y confirma que se distingue bien. El pendiente queda cerrado: el marcador `—` se mantiene tal cual.

**Lo que esto NO resuelve** y sigue pendiente para la UI:
- El formulario de alta debe seguir exigiendo los 3 campos (ADR-006) — la base los acepta vacíos solo por la carga histórica.
- Antes de generar el PDF conviene avisar en pantalla que el paciente no tiene fecha de nacimiento, en vez de que la doctora lo descubra al ver la raya impresa. `lib/pdf` exporta `tieneFechaNacimiento()` para eso.
- No existe ninguna validación que bloquee generar la receta sin fecha de nacimiento, ni aquí ni en [05-Prescripcion-Receta](05-Prescripcion-Receta.md) (una versión anterior de esta nota afirmaba que sí; era falso). La receta se genera igual, marcada como "No registrada".
## Recalibración de las plantillas (resuelto)

Se midieron las **líneas vectoriales** impresas de ambas plantillas con `scripts/medir-lineas-plantilla.mjs`. Era la pieza que faltaba: `extract-text-positions.mjs` solo lee texto, y los marcos de tabla y los renglones son vectores, invisibles para él. Todo lo de abajo está verificado renderizando a imagen, no solo por coordenadas.

**El rectángulo que tapa la tabla impresa, corregido.** Dejaba muñones de las líneas de fila a la vista al imprimir. La tabla real ocupa x 317.2–578.5, y 138.1–259.7; el rectángulo viejo se quedaba corto 25.8pt por la izquierda, 3.5pt por la derecha y 6.9pt por abajo. `TABLA_PRESCRIPCION` vale ahora `{ x: 315.5, y: 136.5, width: 265, height: 131.5 }`. Detalle y vecinos que no se pueden pisar: [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md).

**"Signos de alarma" pasa de 1 a 2 renglones**, de 54 a ~106 caracteres. Dos es el techo físico: una tercera línea se montaría sobre la etiqueta "Recomendaciones no Farmacologicas". Ver [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md).

**"Impresión Diagnóstica" y "Tratamiento" del historial ya ajustan el texto.** Antes se escribían en una sola línea sin wrap y el sobrante se perdía sin aviso. Ahora son 2 y 3 renglones respectivamente, con error explícito si no caben. Ver [ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md).

**Sigue pendiente (UI, no PDF):** el contador de caracteres y el bloqueo de guardado en el formulario, para los cuatro campos. `lib/pdf` ya exporta las funciones de ajuste que deben usarse — `signosAlarmaCabenEnReceta`, `recomendacionesCabenEnReceta`, `indicacionesCabenEnReceta`, `impresionDiagnosticaCabeEnHistorial`, `tratamientoCabeEnHistorial`.

## Unidades de los signos vitales

**Decisión de la doctora (20 de agosto de 2026): la unidad va impresa.** El historial imprime `65 kg`, no `65`.

| Campo | Unidad impresa | |
|---|---|---|
| FC | `lpm` | latidos por minuto |
| FR | `rpm` | respiraciones por minuto |
| Temperatura | `°C` | |
| Peso Actual | `kg` | |
| PA | *ninguna* | es texto ("120/80") y su unidad (mmHg) se omite por convención en la hoja |

**La unidad es presentación, no dato.** El valor se sigue guardando como número puro (`numeric` en la base, `number` en `ExploracionFisica`) y la unidad se pega en el momento de imprimir, con `formatVital()` de `lib/pdf/format.ts`. Mezclarlas fue justo el error que se corrigió al cerrar las divergencias con el esquema: el smoke test pasaba `peso: "65 kg"`, un valor que la base rechaza. Ver [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md).

Si no hay dato, el campo sale en blanco — nunca una unidad suelta ("kg" sin número).

**Caben en el espacio medido**, que en esa fila es estrecho. Peor caso comprobado: `135.5 kg` a 9pt mide 34.5pt contra los 40pt disponibles; `104.8 °C` mide 39.0pt contra 60pt.

## La fecha impresa y el huso horario (corregido en la Fase 3)

Al generar el primer PDF con una consulta **real** apareció un fallo que ninguna
prueba veía: la receta imprimía **el día anterior**.

`new Date("2026-08-21")` es medianoche **UTC**, y `getDate()` lee en hora local:
en Ecuador (UTC-5) la fecha retrocedía al día 20. Es el mismo bug que se había
corregido en `lib/edad.ts` durante la Fase 2; `lib/pdf/format.ts` construía su
propia fecha y se quedó fuera del arreglo.

En una receta eso no es un detalle: es un documento legal que ejecuta un
farmacéutico, fechado un día antes de la consulta.

De paso se quitó `toLocaleDateString("es-EC", …)`, cuyo resultado depende de los
locales instalados en el entorno donde corra. El formato de un documento impreso
no puede depender de eso.

Las dos funciones usan ahora `parseFecha` de `lib/fechas.ts` —el mismo parser
que el cálculo de edad— y arman el formato a mano. Una fecha ilegible imprime
vacío, nunca "Invalid Date" sobre la plantilla. Hay regresión en
`npm run test:pdf`.

## Qué texto puede imprimir una plantilla (corregido en la Fase 4)

`pdf-lib` codifica en **WinAnsi**, y ante un carácter que esa codificación no
tiene **lanza una excepción** — no dibuja un cuadrito ni lo ignora. La excepción
sale de `font.widthOfTextAtSize()`, o sea de `wrapText`, que es lo primero que
toca el texto.

Eso convertía un carácter tecleado en una caída de la aplicación entera. El caso
real: un **Shift+Enter** dentro de "Tratamiento". El contador en vivo mide en
cada pulsación, así que la excepción saltaba **durante el render** y la doctora
veía un Runtime Error a pantalla completa, no un mensaje de validación. Lo mismo
hacía un **copiar y pegar desde Word**, con sus `
` y sus tabuladores, sin
que ninguna tecla lo delatara.

Al revisarlo apareció que la clase era más ancha que el salto de línea: `≥`, `≤`
y `→` —que sí se escriben en prosa clínica: "volver si fiebre ≥ 38"— hacían
exactamente lo mismo. En cambio las comillas curvas, el guion largo, los puntos
suspensivos, `°`, `±` y `µ` sí están en WinAnsi y siempre se imprimieron bien.

**Se cerró en dos capas, y hacen falta las dos:**

1. **En el origen.** Los campos de texto largo que acaban en una plantilla no
   admiten saltos de línea: se frena la tecla y se sanea lo pegado. Ver
   [03-Historial-Clinico](03-Historial-Clinico.md).
2. **En `lib/pdf/text.ts`.** `wrapText`, `drawText` y `medirTexto` sanean todo lo
   que reciben, venga de donde venga — de un formulario, de una importación o de
   un script futuro. `lib/texto-plano.ts` traduce los símbolos que se pueden
   traducir (`≥` → `>=`), convierte cada salto en **un espacio** —cadena vacía
   pegaría dos frases en una palabra que ya no cabría donde debía— y sustituye
   por `?` lo que no tenga traducción: borrarlo en silencio dejaría "fiebre  38"
   impreso en un documento clínico, que se lee como un dato completo y no lo es.

La segunda capa es la que convierte esto en una clase de error cerrada. La
primera es la que evita que el dato se ensucie y explica a la doctora por qué la
tecla no hace nada.

> Los 164 pacientes migrados se revisaron uno a uno: **ninguno** tenía guardado
> un carácter de estos. El fallo era del camino nuevo, no de los datos viejos.

### Lo que enseñó el primer pegado real

Al pegar un "mayor o igual" en "Motivo de consulta", el campo no se rompió pero
el símbolo se veía raro. Diagnosticado con puntos de código, no de vista, salió
esto:

- **El campo mostraba el carácter pegado, intacto, y hace bien.** La capa 1 no
  traduce símbolos: eso cambiaría lo que la doctora escribió. La traducción a
  `>=` ocurre al imprimir. Lo que se veía "mal formado" era el glifo real del
  carácter pegado —`≧` (U+2267) y `⩾` (U+2A7E) se parecen mucho a `≥` (U+2265)
  pero no son él, y la tipografía del sistema no tiene por qué traerlos.
- **El mapa solo cubría el `≥` exacto.** Sus primos visuales acababan en `?`:
  *"volver si fiebre ? 38"* impreso en una receta. Ahora está la familia entera,
  incluidas las formas **negadas**: `≥` seguido de la barra combinable U+0338
  imprimía `">=?"`, o sea que el carácter que INVIERTE el significado se perdía
  en un signo de interrogación.
- **Los pasajeros invisibles se quitan en la capa 1**: espacios de ancho cero,
  BOM, selectores de variación y el guion suave de Word. No se ven en el campo,
  pero contaban para el contador de ADR-007 y llegaban al papel — el guion suave
  se dibujaba como un guion de verdad, partiendo "antiinflamatorio".
- **Y el agujero que más iba a doler, encontrado de camino: los acentos
  descompuestos.** Un pegado desde macOS o Word trae la "ñ" como `n` + U+0303.
  La letra base pasaba y la tilde caía en el `?`: el historial imprimía
  **"migran?a"**. En castellano, o sea en casi cada consulta. Las dos capas
  normalizan ahora a NFC, que además hace que el campo cuente los caracteres que
  de verdad se van a imprimir.

## Herramientas de calibración

| Script | Para qué |
|---|---|
| `extract-text-positions.mjs` | posición y tamaño del **texto** impreso |
| `medir-lineas-plantilla.mjs` | posición de las **líneas vectoriales** (marcos, renglones) |
| `grid-templates.mjs` | cuadrícula de referencia sobre la plantilla |
| `calibrar-limites-pdf.mjs` | techo de caracteres de cada zona, probando muchos textos por longitud |

## Ver también
- [05-Prescripcion-Receta](05-Prescripcion-Receta.md)
- [03-Historial-Clinico](03-Historial-Clinico.md)
- [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md)
- [ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md)
- [Índice](../README.md)
