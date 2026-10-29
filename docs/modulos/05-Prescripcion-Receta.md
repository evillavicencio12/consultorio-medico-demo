---
tags: [modulo, receta]
---

# Módulo 5 — Prescripción y Receta

## Plantillas físicas
Historial y receta usan las plantillas ya diseñadas por la doctora como fondo del PDF. En la mitad "Prescripción", la tabla original se reemplaza por texto corrido (líneas sin bordes ni celdas), manteniendo la misma información.

## Estructura de la receta (una hoja, dos mitades)

**En AMBAS mitades:** fecha, nombre del paciente, nombre del prescriptor (autocompletado), espacio en blanco para firma y sello.

**Mitad "Rp" (queda con la doctora):** edad del paciente, código CIE-10, nombre genérico, nombre comercial, presentación (lista desplegable: cápsula, tableta, ampolla, frasco, solución inyectable, solución oral), cantidad.

**Mitad "Prescripción" (se lleva el paciente, texto corrido sin tabla):** nombre comercial, dosis, vía de administración (lista desplegable: oral, sublingual, intramuscular, intravenosa, subcutánea, tópica, rectal, oftálmica, ótica, inhalada), frecuencia (texto libre), duración (ej. "7 días"), signos de alarma, recomendaciones no farmacológicas.

## Dónde vive el formulario (Fase 4B)

**Dentro de la pantalla de consulta**, `/pacientes/[id]/consulta`, como una
sección más — no como pantalla aparte. Es el mismo criterio que con el
historial: la receta es *de* una consulta, y las dos se guardan en un solo acto.
Separarlas obligaría a decidir qué pasa si se guarda una y no la otra.

Los campos de cada medicamento se agrupan en las **dos mitades de la hoja**
([Prompts-Stitch](../diseno/Prompts-Stitch.md)): "Para la doctora (Rp)" y "Para el paciente
(Prescripción)". No es decoración — la hoja se corta en dos y cada mitad va a un
sitio distinto, así que ver los campos agrupados así es saber qué va a leer el
paciente en su casa y qué queda archivado.

**El catálogo orienta, no encierra.** El buscador (RF-14) autocompleta sobre los
162 medicamentos importados, pero el campo sigue siendo texto: la doctora receta
lo que tiene que recetar, esté o no en un Sheet que todavía se está llenando. Lo
que se guarda son los nombres copiados, no una FK al catálogo — la receta
conserva lo que se recetó ese día aunque el catálogo cambie ([Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)).

## Una consulta puede no llevar receta

Es válido guardar una consulta sin ningún medicamento: un control, una revisión.
[03-Historial-Clinico](03-Historial-Clinico.md) ya lo daba por hecho desde la Fase 3, cuando decidió
esconder el botón de PDF de receta en las consultas sin medicamentos.

Consecuencia importante, resuelta en [ADR-002-numero-receta-global](../adr/ADR-002-numero-receta-global.md): esas
consultas **no consumen número de receta**. Se guardan con `numero_receta` en
NULL y la secuencia no se mueve.

## Número de receta
Correlativo único y **global** para todas las recetas del sistema — nunca se reinicia por paciente. Ver [ADR-002-numero-receta-global](../adr/ADR-002-numero-receta-global.md).

## Límites de contenido
"Signos de alarma", "Recomendaciones no Farmacológicas" y la lista de medicamentos tienen espacio fijo en la plantilla física. Tamaño de fuente mínimo legible y límites de caracteres — ver [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md).

## Los dos campos de texto largo no admiten saltos de línea

"Signos de alarma" y "Recomendaciones no Farmacológicas" se miden con `wrapText`
igual que los campos del historial, así que valen las mismas dos reglas: un
salto puesto a mano le roba un renglón a un espacio ya medido
([ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md)), y hasta la Fase 4 además **tumbaba la
aplicación** — ver [06-Generador-PDF](06-Generador-PDF.md).

Cuando se construya el formulario de receta, sus áreas de texto tienen que usar
el hook `useTextoPlano`, como las del historial. No es una convención de estilo:
`npm run test:texto-plano` recorre `app/` y **falla** si aparece un `<textarea>`
que no pase por él.

## Cuántos medicamentos se pueden agregar

No hay tope fijo — [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md) es explícito en que
depende del largo de cada descripción, no del número. Lo único que el formulario
impide es **apilar un renglón nuevo sobre uno todavía en blanco**: probando se
llegó a veinte renglones vacíos y ciento sesenta campos en pantalla. Son
inofensivos para el guardado —se descartan, no cuentan como receta y no queman
número de correlativo— pero convierten el formulario en un muro.

## Buscador de medicamentos
Autocompletable por nombre genérico o comercial, alimentado por [Contrato-Sheet-Medicamentos](../integraciones/Contrato-Sheet-Medicamentos.md). Sin descuento de inventario — ver [ADR-001-sin-control-inventario](../adr/ADR-001-sin-control-inventario.md).

## Ver también
- [06-Generador-PDF](06-Generador-PDF.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md)
- [Índice](../README.md)
