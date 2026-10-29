---
tags: [integracion, sheets]
---

# Contrato — Sheet de Medicamentos

**Formato de origen:** tabla ancha. La primera fila trae los principios activos (nombres genéricos) como encabezado de columna; debajo de cada uno, los nombres comerciales correspondientes.

**Transposición:** el script toma cada encabezado como nombre genérico y cada celda de esa columna como un nombre comercial asociado, generando una fila por medicamento comercial en `medicamentos_catalogo`.

**Reimportación (manual, desde Configuración):** el Sheet se sigue actualizando con el tiempo, así que la reimportación no debe duplicar lo existente — se actualiza por nombre comercial (si ya existe, se actualiza su genérico asociado; si es nuevo, se agrega).

## Quién hace la importación

Desde la Fase 5 hay **dos puertas y una sola lógica**:

- **La pantalla de Configuración** (`/configuracion`), que es la vía normal para
  la doctora. Flujo en dos pasos, vista previa antes de escribir y resumen en
  pantalla: [07-Configuracion](../modulos/07-Configuracion.md).
- **El script de terminal**, para mantenimiento y para el primer arranque.

Los dos ejecutan `lib/medicamentos/importar.ts` (transposición, duplicados,
`upsert`, clasificación) y `lib/medicamentos/sheet.ts` (lectura del Sheet).
Ninguno tiene una copia de esa lógica, igual que pasa con `lib/edad.ts` y
`lib/texto-plano.ts`: un bug corregido en un lado no reaparece por el otro.

## El script: `scripts/import-medicamentos.mjs`

```
node --env-file=.env scripts/import-medicamentos.mjs --dry-run   # dev, solo mira
node --env-file=.env scripts/import-medicamentos.mjs             # dev, escribe

# producción: ruta explícita del archivo (vive fuera del repo) Y bandera --produccion (lib/entorno.ts)
node --env-file="<ruta del .env.produccion>" scripts/import-medicamentos.mjs --dry-run --produccion
node --env-file="<ruta del .env.produccion>" scripts/import-medicamentos.mjs --produccion
```

En producción la vía normal es la pantalla de Configuración; el script queda
para dev y para casos puntuales ([Entornos](../arquitectura/Entornos.md)).

Variables: `GOOGLE_SHEET_ID_MEDICAMENTOS` y, opcional,
`GOOGLE_SHEET_RANGE_MEDICAMENTOS`. Las de Google y Supabase son las mismas que
usa la importación de pacientes.

**Es repetible, al revés que la de pacientes.** Usa `upsert` sobre
`nombre_comercial` —la columna que ya tiene UNIQUE— así que correrlo mil veces
deja lo mismo que correrlo una vez: el comercial que ya existe actualiza su
genérico, el nuevo se agrega, y no hay nada que limpiar antes. La de pacientes
hace `insert` a secas y correrla dos veces costó 82 duplicados; aquí eso no puede pasar.

### Lo que el script decide, y por qué

- **Columnas a medio llenar: normal, no error.** Una columna sin encabezado, un
  genérico sin ningún comercial debajo o una celda suelta en blanco se omiten y
  se cuentan en el resumen. Estado al 15 de octubre de 2026, medido con la vista
  previa (`--dry-run`) después de la reimportación desde Configuración: **68
  principios activos, de los cuales 22 todavía no tienen ningún nombre comercial
  cargado**, y 164 medicamentos comerciales en total, todos idénticos a la base.
  En la primera importación completa (22 de agosto de 2026) eran 67 principios
  activos, 22 sin comerciales y 162 comerciales. El Sheet se sigue llenando, así
  que estos números envejecen — el que manda es el resumen que imprime la última
  corrida.
- **Un nombre comercial bajo DOS principios activos distintos se reporta.** Es
  casi siempre un error de tipeo, y es justo lo que el `upsert` taparía: la
  segunda aparición pisaría a la primera y el catálogo afirmaría un principio
  activo falso. Se conserva la primera (la columna más a la izquierda), se
  imprime dónde está cada una y se deja para corregir en el Sheet. Deduplicar
  además es obligatorio por otra razón: un lote de `upsert` con la misma clave
  repetida hace fallar a Postgres entero.
- **Los nombres se normalizan a NFC y se les quitan los invisibles.** Un acento
  descompuesto o un espacio de ancho cero pegado desde otro programa crean para
  el UNIQUE dos filas distintas del mismo medicamento. La caja
  (mayúsculas/minúsculas) no se toca: así se escribió y así se imprime.

> [!warning] El tope de columna del rango
> `GOOGLE_SHEET_RANGE_MEDICAMENTOS=MEDICAMENTOS!A1:Z` corta en la columna 26. La
> primera corrida real fue con ese rango y la pestaña tenía **67** principios
> activos: se importaron 26 y 41 quedaron fuera **sin que nada fallara**. Un
> catálogo a medias es peor que uno vacío, porque parece completo cuando la
> doctora busca.
>
> Lo seguro es el nombre de la pestaña a secas. El script avisa cuando los datos
> llegan justo hasta la última columna del rango, que es la señal de que puede
> estar recortando.

### Nuevos, cambiados e idénticos

Tanto el `--dry-run` como la vista previa de la pantalla parten el resultado en
tres —cuántos **se agregan**, cuántos **cambian de principio activo** y cuántos
**ya están idénticos**— comparando el Sheet contra el catálogo actual antes de
escribir. El `upsert` no distingue: si no se mira antes, después "nuevos" da
siempre cero. La comparación del nombre comercial es exacta y distingue caja,
porque quien decide si dos filas son la misma es el UNIQUE de Postgres.

## Ver también
- [07-Configuracion](../modulos/07-Configuracion.md)
- [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [Índice](../README.md)
