---
tags: [integracion, cie10]
---

# Catálogo CIE-10

**Fuente:** el CSV público de `github.com/verasativa/CIE-10`, con códigos en español armados a partir de una fuente chilena (deis.cl) y de icdcode.info. El importador lo descarga **fijado al commit `da2aec19`** (23 de febrero de 2019, el último que tocó el archivo) y comprueba su SHA-256 antes de tocar la base. Así el catálogo se puede reconstruir igual.

**Importación:** `scripts/import-cie10.mjs`, a la tabla de referencia `cie10_catalogo`. La lógica está en `lib/cie10/importar.ts` y se prueba en `tests/cie10-importar.test.ts`.
- `--dry-run` dice qué haría sin escribir nada: códigos nuevos, descripciones que cambiarían y lo que está en la base pero no en la selección.
- Sin `--dry-run`, escribe **solo** eso con un upsert por código. **No borra nada salvo que se le pida:** `--quitar-rangos` borra los rangos («C00-C14»), que no son códigos, y nunca un código.
- Contra producción exige `--produccion` también en `--dry-run` ([Entornos](../arquitectura/Entornos.md)), y cada corrida se propone y se confirma antes ([Verificacion-y-CI](../arquitectura/Verificacion-y-CI.md)).

**Advertencia:** no es fuente oficial del MSP Ecuador. La doctora revisa una muestra de los códigos más usados antes de operar con pacientes reales.

## Qué códigos entran

**Un código entra si ningún otro código lo extiende**, es decir, si es el código final de su rama. Se decide mirando los propios códigos, nunca la columna `level` del CSV, porque el nivel no sirve para esto:

- Las **categorías finales de tres caracteres**, como I10, J00, R51, K30 y A09, vienen casi todas en el nivel 2, mezcladas con las que sí tienen subdivisiones (J02 → J02.0, J02.8, J02.9).
- Hay **subdivisiones de cuatro caracteres en el nivel 2**: T79.x (complicaciones precoces de traumatismos, entre ellas el choque traumático) y N99.x.
- Hay **categorías con subdivisiones en los niveles 3 y 4**: C00, T20, M15…
- Los **rangos** («A00-B99», «C00-C14») no son códigos y nunca entran. Tampoco cuentan como subdivisión: «I10-I15» empieza igual que I10.

Hasta el 17 de octubre de 2026 el filtro era «niveles 3-5». Se encontró al preparar la muestra para la doctora, y tenía tres errores:
- **Dejaba fuera 238 categorías finales:** entre ellas la hipertensión esencial (I10), el resfriado común (J00), la cefalea (R51), la dispepsia (K30) y la diarrea y gastroenteritis de presunto origen infeccioso (A09).
- **Dejaba fuera 18 subdivisiones del nivel 2.**
- **Dejaba entrar 454 códigos que no son finales:** 430 categorías con subdivisiones y 24 rangos.

**Qué pasó con esos 454:**
- **Los 24 rangos se quitaron** con `--quitar-rangos` el 17 de octubre de 2026, en dev y en producción. Detalle y huellas en la tabla de abajo.
- **Las 430 categorías con subdivisiones siguen en la base.** El buscador las muestra y se pueden guardar como diagnóstico. Van a la muestra para la doctora, con una pregunta: ¿usa diagnósticos de tres caracteres? El `--dry-run` las informa como «en la base y no en la selección».
- **Decidir antes de que la doctora use la app.** Hoy producción no tiene consultas, así que borrarlas no afecta nada. Desde la primera consulta que use una, la FK de `consultas.cie10_codigo` impide borrarla.

Los códigos se guardan **sin punto** (`J069`, no `J06.9`), como los trae el CSV. El buscador normaliza lo tecleado ([04-Diagnostico-CIE10](../modulos/04-Diagnostico-CIE10.md)).

## Ajustes sobre la fuente: `supabase/datos/cie10-ajustes.json`

Lo que se agrega o se corrige sobre la fuente va en este archivo versionado, **nunca a mano en el panel**. El importador lo aplica en cada corrida:

- **Si el código no está en la fuente, se agrega.**
- **Si ya está, su descripción se reemplaza** por la del archivo. Así entran las correcciones que haga la doctora en su revisión.

Cada entrada lleva `codigo` (sin punto), `descripcion` y `fuente`, de dónde sale y quién lo pidió. El importador rechaza un código con punto, uno repetido o una entrada sin descripción o sin fuente: un ajuste mal escrito no se ignora en silencio.

| Código | Descripción | Fuente |
|---|---|---|
| U07.1 | COVID-19, virus identificado | OMS, [*Orientación internacional para la certificación y clasificación (codificación) del COVID-19 como causa de muerte*](https://cdn.who.int/media/docs/default-source/classification/icd/covid-19/guidelines-cause-of-death-covid-19-20200423-es.pdf), 20 de abril de 2020 (WHO/HQ/DDI/DNA/CAT), versión en español. Texto literal del documento: «U07.1 COVID-19, virus identificado» |
| U07.2 | COVID-19, virus no identificado | El mismo documento: «U07.2 COVID-19, virus no identificado». Cubre el diagnóstico clínico-epidemiológico y los casos probables o sospechosos |

La doctora pidió los dos el 17 de octubre de 2026. La fuente, de 2019, no los trae: son códigos de emergencia que la OMS asignó en 2020. La OPS publicó la misma orientación en español ([IRIS, 10665.2/52848](https://iris.paho.org/handle/10665.2/52848)); el texto citado se verificó en el PDF de la OMS.

## Estado del catálogo

| | Dev | Producción |
|---|---|---|
| Antes del 17 de octubre de 2026 | 12.634 | 12.634 |
| Con la regla nueva y U07.1/U07.2 (+238 +18 +2) | 12.892 | 12.892 |
| Sin los 24 rangos | **12.868** | **12.868** |

- **La importación en producción** (17 de octubre de 2026, desde `master` en `ba1d1f4`): el `--dry-run` dio 258 nuevos, 0 cambios y 454 que no se borran, y quedaron 12.892. La huella md5 del catálogo, `md5(string_agg(codigo||'|'||descripcion, E'\n' order by codigo))`, quedó **idéntica** en los dos entornos: `69a37ca55c6cefc86632d08fcf0baeac`.
- **El borrado de los 24 rangos en producción** (17 de octubre de 2026, desde `master` en `1dde0b7`): el `--dry-run --quitar-rangos` dio 0 nuevos, 0 cambios, 24 rangos (la misma lista que en dev) y 430 que se quedan. El borrado contó 24 de 24 y quedaron 12.868. La huella quedó **idéntica** a la de dev: `e4c6c8920272318060d2271d50623082`.
- **La selección** tiene 12.438 códigos: 12.436 finales de la fuente y los 2 ajustes. La base tiene además las 430 categorías que siguen pendientes.
- **El buscador encuentra U07.1 y U07.2** con «covid», «U07», «U07.1» y también con **«COVID-19»**. Postgres indexa «COVID-19» como `cov` y el entero `-19`, con su signo, y la búsqueda perdía el guion al sanearse. Ahora un número se pide también con guion, exacto y sin prefijo (`19:* | -19`), para que «tipo 1» no traiga el `-19`: `lib/busqueda-texto.ts`, en `piezasDeToken`.

## Ver también
- [04-Diagnostico-CIE10](../modulos/04-Diagnostico-CIE10.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [Índice](../README.md)
