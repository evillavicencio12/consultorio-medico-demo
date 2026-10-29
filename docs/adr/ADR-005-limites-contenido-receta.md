---
tags: [adr]
---

# ADR-005 — Límites de contenido en la receta (tamaño legible mínimo y caracteres máximos)

**Estado:** Implementada por completo desde la Fase 4B (22 de agosto de 2026).
El PDF la respeta (`lib/pdf/receta-limits.ts`) y el formulario también:
`lib/consultas/receta.ts` trae el contador visible y el bloqueo, midiendo con la
MISMA fuente Helvetica que dibuja el PDF (`lib/pdf/medicion.ts`).

> Igual que en [ADR-007-espacio-historial](ADR-007-espacio-historial.md), el rojo del contador **no** es
> "usados > máximo": es el veredicto de la función de ajuste. Este ADR ya decía
> que los números son aproximaciones y que quien decide es la función; si el
> color siguiera al número, el contador se pintaría en rojo con textos que el
> sistema acepta. Por eso el número lleva "aprox." en pantalla.

**Contexto:** La plantilla física de la receta tiene espacio fijo para el contenido dirigido al paciente: "Indicaciones" (texto corrido que reemplaza la tabla impresa en la mitad Prescripción — ver [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)), "Signos de alarma" (una sola raya impresa; hoy se usan 2 renglones, ver recalibración al final) y "Recomendaciones no Farmacológicas" (2 rayas impresas, 3 renglones de espacio útil). La primera implementación resolvía el desborde con auto-shrink: si el texto no cabía, se reducía la fuente progresivamente (hasta 5pt para "Indicaciones"), y "Signos de alarma" ni siquiera tenía manejo de desborde. El problema con ese enfoque: la doctora se enteraba del recorte o la letra diminuta recién al generar el PDF — después de guardar la consulta — nunca antes. RNF-05 (Usabilidad, ERS) pide una interfaz utilizable por una persona sin formación técnica, priorizando formularios simples: un contador de caracteres visible con una advertencia clara antes de guardar encaja con ese principio; un PDF que calladamente encoge o corta texto médico, no.

**Decisión:**

1. **Tamaño de fuente mínimo legible para contenido dirigido al paciente: 7.5pt. Nunca se reduce por debajo de esto.** Justificación:
   - Es mayor que las etiquetas ya impresas en la plantilla física (5.9–6.9pt, medido con `scripts/extract-text-positions.mjs`) — el texto que el paciente debe leer con cuidado en su casa (síntomas de alarma, cómo tomar cada medicamento) no debería ser menos legible que las etiquetas de campo.
   - Sigue la misma filosofía de "hay un piso, no seguir achicando" que ya usa [Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md) para la interfaz en pantalla (labels nunca bajan de 12px).
   - Validado empíricamente: a 7.5pt fijo, 4 medicamentos y los textos reales de "Signos de alarma"/"Recomendaciones" caben sin desbordar (`tests/pdf-module.test.ts`).

2. **Límites de caracteres**, calculados con las métricas reales de Helvetica sobre el ancho disponible medido en la plantilla física, con margen de seguridad probado contra vocabulario clínico de palabras largas (antiinflamatorios, gastrointestinales, etc.):
   - **Signos de alarma:** ~~55 caracteres (un renglón)~~ → **100 caracteres en DOS renglones** de 201pt. Recalibrado, ver "Recalibración de la plantilla" al final.
   - **Recomendaciones no Farmacológicas:** 195 caracteres (3 renglones, 250pt de ancho por renglón). **Corregido desde 200**, que era inseguro: midiendo con las métricas de Helvetica sobre esos 3×250pt, el techo garantizado es 198 caracteres con prosa clínica normal y 174 si el texto trae solo palabras largas. El 200 anterior pasaba las pruebas solo porque el texto de ejemplo caía del lado bueno del ajuste, no porque cupiera siempre.
   - Estos dos números son **aproximaciones para el contador del formulario**. Igual que con la lista de medicamentos, quien decide de verdad si cabe es la función de ajuste: `signosAlarmaCabenEnReceta()` y `recomendacionesCabenEnReceta()`. Un texto de 180 caracteres de palabras largas puede no caber aunque respete el contador, y uno de 195 de palabras cortas sobra. El contador orienta mientras se escribe; la función bloquea el guardado.
   - **Lista de medicamentos ("Indicaciones"):** sin un número fijo — la cantidad que cabe depende del largo real de cada descripción (dosis, vía, frecuencia, duración), no solo del conteo. Se valida dinámicamente contra 9 renglones disponibles a 7.5pt con `indicacionesCabenEnReceta()` (misma función de ajuste de línea que usa el PDF). En la práctica: ~4–6 medicamentos con descripciones típicas caben cómodos; 7 o más normalmente no.

3. **El formulario de "Nueva Consulta" debe importar estas constantes desde `lib/pdf/receta-limits.ts`** (fuente única, no duplicar los números) para:
   - Mostrar un contador de caracteres visible en "Signos de alarma" y "Recomendaciones no Farmacológicas".
   - Bloquear el guardado si se excede el límite, con un mensaje claro de qué acortar. Para "Recomendaciones", el bloqueo debe apoyarse en `recomendacionesCabenEnReceta()`, no solo en el conteo.
   - Llamar a `indicacionesCabenEnReceta()` contra la lista de medicamentos actual y advertir ("reduce la lista o usa una segunda receta") si no cabe, en vez de dejar que la doctora se entere al generar el PDF.

4. **`generateRecetaPdf` ya no trunca contenido con "…" ni lo encoge por debajo de 7.5pt.** Si de todas formas recibe contenido que excede el límite (el formulario no debería permitirlo, pero sirve como red de seguridad — datos importados, un bug futuro), lanza `ContenidoExcedeEspacioError` identificando el campo y sugiriendo cómo corregirlo, en vez de generar un PDF con texto cortado o ilegible en silencio.

**Consecuencias:**
- La doctora se entera de un texto demasiado largo en el formulario, antes de guardar — nunca después de generar o imprimir la receta.
- `lib/pdf/receta-limits.ts` es la fuente única de verdad de estos números: si la plantilla física cambia, se recalculan en un solo lugar (con `scripts/extract-text-positions.mjs` y `scripts/grid-templates.mjs` como herramientas de calibración).
- El límite de medicamentos no es un número fijo documentado sino una función de ajuste dinámico (`indicacionesCabenEnReceta`) — el formulario debe llamarla en cada cambio a la lista, no asumir un conteo fijo tipo "máximo 6".
- Los límites en caracteres se recalculan con `node scripts/calibrar-limites-pdf.mjs`, que prueba muchos textos de cada longitud contra el ajuste de línea real, no con un texto de ejemplo suelto: un solo texto que cabe no demuestra que todos los de esa longitud quepan (así se coló el 200).
- ~~Pendiente: implementar el contador de caracteres y el bloqueo de guardado en el formulario~~ — hecho en la Fase 4B. Los tres bloques se validan antes de guardar: `signosAlarmaCabenEnReceta()`, `recomendacionesCabenEnReceta()` e `indicacionesCabenEnReceta()` sobre la lista de medicamentos de ese momento. La Server Action los vuelve a comprobar antes de escribir, porque un texto que se colara haría lanzar al PDF **después** de haber guardado.

## Recalibración de la plantilla (sesión posterior)

Se midieron las **líneas vectoriales** impresas de `receta-plantilla.pdf` con `scripts/medir-lineas-plantilla.mjs`, una herramienta nueva: `extract-text-positions.mjs` solo lee texto, y todo el marco de la tabla y los renglones son vectores, invisibles para él. De ahí salieron tres correcciones.

**1. "Signos de alarma" pasa de 1 a 2 renglones.** La doctora pidió más espacio. La plantilla trae una sola raya impresa (y=122.1), pero el hueco da para dos líneas de texto:

- Primera línea en y=132, la que ya existía. Hacia arriba no hay margen: queda pegada al borde inferior de la tabla (y=138.6).
- Segunda línea en y=123.5, apoyada justo sobre la raya impresa — donde iría la escritura a mano. Por debajo quedan ~3.9pt hasta la etiqueta "Recomendaciones no Farmacologicas" (base y=113.8, ascendentes a ~118.0).
- **Dos es el techo.** Una tercera línea caería en y=115 y se montaría sobre esa etiqueta. Si la doctora necesitara más, ya no es un problema de código: hay que rediseñar la plantilla física o mover contenido a "Recomendaciones".
- Capacidad: de 54 a **106 caracteres** reales (constante en 100). El viejo 55 no solo asumía un renglón: estaba además por encima de su propio techo de 54.
- Interlínea 8.5pt (`SIGNOS_ALARMA_LINE_HEIGHT`), ajustada para que la segunda línea caiga sobre la raya.

**Confirmado por la doctora (20 de agosto de 2026): dos renglones le bastan.**
El pendiente queda cerrado — no hace falta buscar una tercera línea ni rediseñar
la plantilla física por este campo. Los 100 caracteres de
`SIGNOS_ALARMA_MAX_CHARS` se dan por definitivos.

**2. El rectángulo que tapa la tabla impresa, corregido.** `TABLA_PRESCRIPCION` valía `{ x: 343, y: 145, width: 232, height: 130 }`, calibrado a ojo. La tabla real ocupa **x 317.2–578.5, y 138.1–259.7**: el rectángulo se quedaba corto 25.8pt por la izquierda, 3.5pt por la derecha y 6.9pt por abajo, y dejaba muñones de las líneas de fila a la vista al imprimir. Nuevo valor `{ x: 315.5, y: 136.5, width: 265, height: 131.5 }`, con dos vecinos que no se pueden pisar: "INDICACIONES:" arriba (base y=282.6) y la etiqueta "Signos de alarma:" abajo (ascendentes hasta ~134.2). El borde superior sube a 268 para tapar también los encabezados de columna, cuya letra más alta ("VIA") llega a ~265.4. Verificado renderizando a imagen, no solo por coordenadas.

**3. Corrección a esta misma ADR:** decía que "Recomendaciones no Farmacológicas" tiene *3 renglones impresos*. Son **2 rayas** (y=107.4 e y=86.7). El bloque sigue usando 3 líneas de texto porque el espacio vertical libre da para ellas —la tercera cae en y=90.8, con ~7pt hasta "Nombre del Prescriptor:"— pero la tercera línea no tiene raya debajo. El número de renglones útiles lo define el espacio libre, no cuántas rayas se imprimieron.

## La palabra sin espacios: un renglón puede no caber de ANCHO (Fase 4B)

Encontrado probando con datos adversarios, después de dar la ADR por cerrada.

**El fallo.** 136 caracteres sin un solo espacio en "Signos de alarma" mostraban
"136/100 aprox." pero no se pintaban en rojo, no bloqueaban el guardado, y
`generateRecetaPdf` los aceptaba sin lanzar. El motivo: `wrapText` corta por
espacios, así que un texto sin ninguno es **una palabra** que sale en **una
línea**, mida lo que mida. Contar renglones no podía detectarlo nunca — siempre
era 1, y el máximo son 2.

**Lo medido:** 550pt de texto contra los 201pt del hueco, 2,74 veces. **Lo
impreso**, que es lo que importa: de los 136 caracteres solo 54 caían dentro de
la hoja; el resto se dibujaba pasado el borde derecho y no salía en el papel. Un
signo de alarma recortado en silencio es exactamente lo que esta ADR existe para
impedir, y llevaba abierto desde que se escribió la función.

**La regla, ahora explícita:** "¿cabe?" son **dos** condiciones —renglones y
ancho— y las cinco funciones de ajuste (las tres de aquí y las dos de
[ADR-007-espacio-historial](ADR-007-espacio-historial.md)) pasan por un único `cabeEnElEspacio()` que
comprueba las dos. `drawFixedOrThrow` también, así que la red de seguridad del
PDF por fin cubre este caso.

**Qué pasa con una palabra que no cabe**, según el campo:

| | Comportamiento | Por qué |
|---|---|---|
| Campos con límite medido (los tres de esta ADR y los dos de ADR-007) | **Se bloquea el guardado**, con el mensaje de siempre | Hay un tope de renglones que respetar; partir la palabra a la fuerza escondería que el contenido no entra |
| Campos sin límite (motivo de consulta, antecedentes… vía `drawWrapped`) | **Se parte la palabra** | No hay tope que respetar, así que la única alternativa era dejar que la tinta se saliera de la hoja — comprobado: el motivo se salía a x=758 en una hoja de 596pt |

El mensaje de error añade la razón, porque "resume el texto" no ayuda cuando el
problema es una sola palabra: *"el renglón solo se puede cortar en un espacio,
así que una palabra larguísima no cabe aunque el contador diga menos"*.

Fijado en `npm run test:receta`.

## Ver también
- [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)
- [06-Generador-PDF](../modulos/06-Generador-PDF.md)
- [Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md)
- [Índice](../README.md)
