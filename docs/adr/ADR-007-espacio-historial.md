---
tags: [adr]
---

# ADR-007 — Espacio de los campos en las plantillas físicas

**Estado:** Implementada por completo desde la Fase 4. El PDF la respeta
(`lib/pdf/historial-limits.ts`) y el formulario de consulta también:
`lib/consultas/formulario.ts` trae el contador visible y el bloqueo, midiendo
con la MISMA fuente Helvetica que dibuja el PDF (`lib/pdf/medicion.ts`).
[ADR-005-limites-contenido-receta](ADR-005-limites-contenido-receta.md) sigue esperando su formulario, que es el de
la receta.

**Contexto:** La doctora pidió más espacio en "Impresión Diagnóstica" y "Tratamiento". Hasta ahora el PDF del historial escribía cada uno con `drawText` en **una sola línea, sin ajuste de texto**: un tratamiento con dos o tres medicamentos se salía del ancho de la hoja y el texto sobrante simplemente se perdía de vista al imprimir, sin aviso. Es el mismo problema que ADR-005 resolvió en la receta, pero en la otra plantilla y sin haberse detectado antes porque los textos de prueba eran cortos.

**Medición.** Con `scripts/medir-lineas-plantilla.mjs` sobre `historial-plantilla.pdf` (detecta las líneas vectoriales impresas, que `extract-text-positions.mjs` no ve porque solo lee texto):

| | Raya impresa | Espacio libre debajo | Renglones que caben |
|---|---|---|---|
| Impresión Diagnóstica | y=127.8, x 71.8→423.7 | hasta la etiqueta "7. Tratamiento" (base y=101.3, ascendentes a ~109.2) | **2** |
| Tratamiento | y=73.5, x 53.8→405.7 | nada impreso debajo hasta el borde de la hoja | **3** |

- **Impresión Diagnóstica: 2 renglones.** Bases en y=131 y y=118, con ~6.8pt de aire sobre la etiqueta de abajo. Una tercera línea caería en y=105 y se montaría sobre "7. Tratamiento", que ocupa de x=54 a x=134 — justo donde empieza este texto.
- **Tratamiento: 3 renglones.** Bases en 77, 64 y 51. Es el último bloque de la hoja: debajo de su raya no hay nada impreso (verificado con las dos herramientas), así que el límite lo pone el margen inferior, no un vecino. Quedan ~49pt.
- **Interlínea 13pt**, no los 19.1pt de los renglones impresos de la parte superior de la hoja: estas líneas extra no tienen raya debajo, y a 19.1pt la segunda línea de "Impresión Diagnóstica" chocaría con la etiqueta siguiente.
- **Tamaño 9.5pt**, el que ya usaba el historial. No se reduce: la hoja completa da espacio de sobra y las etiquetas impresas son de 11pt.

**Decisión:**

1. Ambos campos se ajustan con `wrapText` hasta los renglones medidos, y si no caben lanzan `ContenidoExcedeEspacioError` identificando el campo. **No se encoge la letra ni se trunca con "…"** — la misma regla que ADR-005 fijó para la receta.
2. Límites de caracteres para el contador del formulario, medidos con `scripts/calibrar-limites-pdf.mjs`:
   - **Impresión Diagnóstica:** 145 (techo real 150 con prosa clínica típica, 144 con palabras largas). Cuenta el texto **compuesto con el código CIE-10**, que es lo que se imprime: usar `textoImpresionDiagnostica()` para medir lo mismo que el PDF.
   - **Tratamiento:** 215 (techo real 220 típico, 215 con palabras largas).
3. Igual que en ADR-005, esos números son **aproximaciones**: quien decide es la función de ajuste (`impresionDiagnosticaCabeEnHistorial()`, `tratamientoCabeEnHistorial()`). El formulario debe llamarlas antes de guardar.

**Lo que se aprendió al construir el formulario (Fase 4):**

El contador de caracteres y la función de ajuste **no coinciden**, y hay que
decidir cuál manda sobre lo que ve la doctora. Medido con las métricas reales de
Helvetica, una impresión diagnóstica de **158 caracteres de prosa clínica cabe
de sobra** en los dos renglones, aunque el contador diga 145.

Si el número mandara sobre el color, el contador se pintaría en rojo con un
texto que el sistema acepta —o, peor, en gris con uno que va a rechazar—. Así
que el rojo del contador y el bloqueo del guardado son **la misma decisión**: la
de la función de ajuste. El número se anuncia como "aprox.", que es lo que este
ADR siempre dijo que era.

Mientras la fuente se incrusta (unos milisegundos al abrir la pantalla) se cae
al conteo de caracteres, que es más estricto que la realidad: avisa de más,
nunca de menos.

**Consecuencias:**
- `generateHistorialPdf` ahora puede lanzar. Quien lo llame debe manejar `ContenidoExcedeEspacioError`, como ya hace con la receta.
- `lib/pdf/historial-limits.ts` es la fuente única de estos números, en paralelo a `receta-limits.ts`. Si se recalibra la plantilla, se recalculan ahí y en `scripts/calibrar-limites-pdf.mjs`.
- Un tratamiento que no quepa en 3 renglones obliga a resumir. Si eso resulta insuficiente en la práctica, la conversación siguiente es con la plantilla física, no con el código: la hoja no da más sin rediseñarla.

## Alcance ampliado: NO existe un campo "sin límite" (Fase 4B)

Esta ADR nació midiendo dos campos. Resultó que el problema era de todos, y que
la forma de pensarlo estaba mal.

**El desborde reportado.** "Padecimiento Actual" con texto largo se dibujaba
encima del título "6. Impresión Diagnóstica" y de la sección siguiente. La causa
no era un número mal calculado: era que ese campo se trataba como **sin límite
de renglones** (`drawWrapped` escribe tantas líneas como hagan falta). Lo mismo
"Antecedentes Heredo Familiares".

**El error de fondo:** una plantilla física es una hoja de tamaño fijo con
secciones que se suceden una tras otra. *No hay* espacio ilimitado en ninguna
parte de ella. Lo que había no era un campo sin límite, sino un límite que nadie
había medido.

### Lo medido (extract-text-positions.mjs sobre la plantilla real)

| Campo | Renglones impresos | Qué hay justo debajo | Aire si se pasa |
|---|---:|---|---|
| Padecimiento Actual | 3 (y=221.1 / 202.0 / 182.8) | "6. Impresión Diagnóstica" (base 155.7) | 2,1 pt |
| Antecedentes Heredo Familiares | 3 (y=523.0 / 503.9 / 484.7) | "3. Antecedentes Personales Patológicos" (base 457.6) | 2,2 pt |
| Alergias / Patologías / Quirúrgicos | 2 cada uno | el antecedente de abajo, 27,2pt más abajo | — |
| Transfusionales | 2 | "4. Exploración Física" | — |
| Domicilio / Ocupación / Estado civil / Teléfono | 2 | la fila de campos siguiente | — |

En los dos primeros, una cuarta línea deja **2 puntos** antes de las
ascendentes del título vecino —menos que las descendentes de la propia línea— y
además flotaría sin raya debajo. El techo es 3: los renglones que la plantilla
imprime. Es el mismo razonamiento que ya se usó para dejar "Impresión
Diagnóstica" en 2.

### Y en la receta, por el otro eje: el ancho

La revisión campo por campo destapó dos sitios donde el texto se dibujaba **sin
ancho máximo ni ajuste**, con `drawText` a secas:

- **El renglón de cada medicamento (mitad "Rp")**. Con datos reales del catálogo
  importado: *"betametasona + clotrimazol + gentamicina — (solución inyectable) —
  cant. 30 — aplicar capa fina"* mide **324,7pt contra los 250** disponibles. Se
  imprimía sobre la mitad "Prescripción", que es la que se lleva el paciente.
- **El nombre del paciente**, en las dos mitades, por la misma razón.

### La regla, ahora

**Todo campo de las dos plantillas tiene tope de renglones y de ancho, medido.**
`drawWrapped` —el dibujo sin tope— ya no lo usa ningún campo del historial: solo
queda como primitiva para los campos que aún no tienen vecino debajo, y hoy no
hay ninguno.

Los números viven en `lib/pdf/historial-limits.ts` y `lib/pdf/receta-limits.ts`,
calibrados con `scripts/calibrar-limites-pdf.mjs`:

| Campo | Geometría | Tope del contador |
|---|---|---:|
| Padecimiento Actual | 3 × 505pt @9.5 | 325 |
| Heredo Familiares | 3 × 490pt @9.5 | 315 |
| Alergias | 2 × 420pt @10 | 170 |
| Patologías | 2 × 400pt @10 | 155 |
| Quirúrgicos | 2 × 395pt @10 | 155 |
| Transfusionales | 2 × 380pt @10 | 150 |
| Renglón Rp (receta) | 1 × 250pt @7.5 | 65 |

Los cinco primeros tienen **contador visible y bloqueo** en el formulario de
consulta; "Heredo Familiares", "Domicilio" y "Ocupación" se escriben en la ficha
del paciente, cuyos topes de caracteres se bajaron a lo que la hoja imprime
(estaban en 1000, 200 y 80 contra 315, 155 y 50 reales).

Verificado con PDF real y texto deliberadamente largo en cada campo: pasarse
lanza `ContenidoExcedeEspacioError`, y justo en el límite se imprime entero sin
tocar ningún título vecino — comprobado leyendo las posiciones del PDF, no el
cálculo. Fijado en `npm run test:espacio`.

## Ver también
- [ADR-005-limites-contenido-receta](ADR-005-limites-contenido-receta.md)
- [03-Historial-Clinico](../modulos/03-Historial-Clinico.md)
- [06-Generador-PDF](../modulos/06-Generador-PDF.md)
- [Índice](../README.md)
