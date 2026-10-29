# Migraciones del esquema

El esquema completo de la base vive aquí, versionado. Es la **fuente de verdad**:
ningún cambio de esquema se hace a mano en el panel de Supabase.

| Archivo | Contenido |
|---|---|
| `migrations/20260820120000_catalogos.sql` | `cie10_catalogo`, `medicamentos_catalogo` e índices de búsqueda |
| `migrations/20260820120100_pacientes.sql` | `pacientes`, sus CHECK e índices |
| `migrations/20260820120200_consultas.sql` | Secuencia `numero_receta_seq` y tabla `consultas` |
| `migrations/20260820120300_receta_medicamentos.sql` | `receta_medicamentos` y sus CHECK de dropdown |
| `migrations/20260820120400_rls_y_grants.sql` | RLS, políticas y GRANTs de las 5 tablas |
| `migrations/20260820130000_consultas_transfusionales.sql` | Agrega `consultas.transfusionales` (ver Modelo-de-Datos.md) |

Se aplican en orden alfabético, que por el prefijo `AAAAMMDDHHMMSS` es también el
orden de dependencias: catálogos → pacientes → consultas → receta → permisos.

## Cómo agregar un cambio

Un archivo **nuevo**, nunca editar uno ya aplicado:

```
supabase/migrations/AAAAMMDDHHMMSS_descripcion-breve.sql
```

## Cómo verificar que reproducen producción

`huella-esquema.sql` devuelve, en un solo `jsonb`, la descripción completa del
esquema `public`: tablas, columnas, constraints, índices, secuencias, políticas
RLS y GRANTs reales. El mismo archivo se ejecuta contra los dos lados, y
`scripts/verificar-migraciones.mjs` compara las salidas.

Hay dos motores para la base local.

**Por defecto — PGlite, sin Docker.** PostgreSQL compilado a WASM que corre
dentro de Node. Funciona con solo `npm ci`, que es la razón de que
`@electric-sql/pglite` sea una devDependency y no una instalación suelta: sin
ella nadie puede verificar las migraciones tras clonar el repo.

```bash
node --env-file=.env scripts/verificar-migraciones.mjs
```

**Canónico — el stack real de Supabase, sobre Docker.** Corre sobre el mismo
PostgreSQL 17 que producción, así que no arrastra diferencias de versión.

```bash
npx supabase start
npx supabase db reset
node --env-file=.env scripts/verificar-migraciones.mjs --motor=docker
```

`supabase/entorno-pglite.sql` crea los roles (`anon`, `authenticated`,
`service_role`) y la función `auth.role()` que Supabase ya trae hechos y que las
migraciones dan por sentados. No es parte del esquema y por eso no vive en
`migrations/`; con `--motor=docker` no se usa.

Contra producción solo se manda ese `SELECT`, y se envía con `read_only: true`.
**La verificación nunca escribe en producción.**

Requiere `SUPABASE_ACCESS_TOKEN` en `.env` (ver `.env.example`). Es un token de
cuenta: conviene crearlo para verificar y revocarlo después.

## Estado: las 10 migraciones están aplicadas en producción y en dev

Al 21 de agosto de 2026, producción y `supabase/migrations/` describían el mismo
esquema con 7 migraciones; la octava (`20260822120000_numero_receta_opcional`)
se aplicó el 22 de agosto y está en producción (`numero_receta` admite NULL,
comprobado el 15 de octubre). La equivalencia se comprobó en cuatro momentos,
con métodos distintos; el cuarto (sección 4) cubre las 8. La novena
(`20261015120000_menor_edad_hora_ecuador`, sección 5) y la décima
(`20261016120000_fecha_consulta_hora_ecuador`, sección 6) se aplicaron en dev
con `supabase-dev` y en producción el 16 de octubre de 2026, juntas y en una
transacción, por el SQL Editor (`convalidated = true`). Después, la huella de
dev y la de producción coinciden en sus 11 secciones; cambiaron `columnas` y
`constraints`, con el mismo md5 nuevo en los dos lados.

### 1. Las 5 primeras migraciones — verificación automática

Se aplicaron sobre un Postgres vacío y se comparó el resultado contra
producción con el procedimiento de arriba:

| Sección | Objetos | Resultado |
|---|---:|---|
| Tablas (incl. estado de RLS) | 5 | idénticas |
| Columnas (tipo, nullability, default, posición) | 51 | idénticas |
| Constraints (PK, UNIQUE, CHECK, FK con su `ON DELETE`) | 16 | idénticas |
| Índices (incl. los tres GIN `to_tsvector`) | 15 | idénticos |
| Secuencias | 1 | idéntica |
| Políticas RLS | 5 | idénticas |
| GRANTs de tabla | 160 | idénticos |
| GRANTs de secuencia | 9 | idénticos |

**Cero diferencias sustantivas.**

Salvedad honesta sobre esa corrida: el motor de Docker no estaba disponible ese
día, así que la base vacía se levantó con PGlite (Postgres en WASM) en lugar del
Postgres 17 del stack local de Supabase. PGlite es **PostgreSQL 18.3** y
producción es **17.6**. La única discrepancia que produjo esa diferencia de
versión fueron 23 filas `contype = 'n'` en `pg_constraint`: PG18 le da nombre
propio a cada `NOT NULL`, PG17 no. No es una diferencia de esquema — la
nullability de las 51 columnas coincide exactamente según
`information_schema.is_nullable`. El script ya filtra esas filas.

### 2. `20260820130000_consultas_transfusionales` — verificación manual

Esta migración se escribió **después** de esa corrida, así que en el diff
automático aparecía como la única diferencia esperada: la columna existía en la
base local y todavía no en producción.

Se aplicó a producción desde el SQL Editor y se comprobó a mano contra
`information_schema.columns`:

- `transfusionales` quedó en la **posición 20**, `text`, `is_nullable = YES`,
  sin default — exactamente como en la base reconstruida desde cero.
- Las **19 columnas anteriores no se movieron**: mismo nombre, tipo, posición y
  nulabilidad, incluidos `fc`, `fr`, `temperatura` y `peso` como `numeric` y
  `numero_receta` como `bigint NOT NULL`.

`consultas` pasa de 19 a 20 columnas, y el esquema total de 51 a 52.

### 3. `20260821120000_tipo_documento` — verificación manual

Misma situación que la anterior: se escribió después de la corrida automática,
así que aparecía como la única diferencia esperada.

Antes de tocar producción se aplicaron **las 7 migraciones sobre una base vacía
con PGlite** y se comprobó no solo la forma del esquema sino el
**comportamiento** de los constraints: que el UNIQUE del par deja entrar el
mismo número como cédula de una persona y como pasaporte de otra, que un
`tipo_documento` fuera de la lista lo frena el CHECK, que dos fichas sin
documento conviven, y que un menor con acompañante de pasaporte entra.

Después se aplicó a producción desde el SQL Editor y se comprobó a mano contra
`information_schema.columns`, `pg_constraint` y `pg_indexes`:

- `documento` y `documento_acompanante` conservan su posición y su
  nulabilidad — el `RENAME COLUMN` no mueve nada.
- `tipo_documento` y `tipo_documento_acompanante` quedaron en las posiciones
  **18 y 19**, `text`, `NOT NULL`, con `DEFAULT 'cedula'::text`.
- `pacientes_documento_key` es `UNIQUE (tipo_documento, documento)`;
  `pacientes_cedula_key` ya no existe.
- `acompanante_obligatorio_si_menor` quedó apuntando solo a
  `documento_acompanante`: el renombrado arrastra la definición del CHECK sin
  tocarla.
- El índice de búsqueda se llama `idx_pacientes_documento`.
- Las **164 filas conservaron su documento**: `tipo_documento = 'cedula'` en
  todas y 83 siguen sin número, exactamente las mismas 83 de antes.

`pacientes` pasa de 17 a 19 columnas, y el esquema total de 52 a 54.

### 4. Las 8 migraciones sobre el proyecto de dev — PG17, 15 de octubre de 2026

Se aplicaron las 8, en orden, sobre `<proyecto-dev>` (vacío, PG
17.11), creado con «Automatically expose new tables» **desactivado**. Después
se corrió `huella-esquema.sql` idéntico en dev y en producción (PG 17.6) y se
comparó el md5 de cada sección: **las 11 coinciden** — 5 tablas, 54 columnas,
18 constraints, 15 índices, 1 secuencia, 5 políticas, 160 GRANTs de tabla, 9 de
secuencia, `rls_auto_enable`, 7 event triggers y 0 triggers. Con la exposición
automática apagada, eso prueba también que los GRANTs explícitos de
`20260820120400_rls_y_grants.sql` bastan. Ver `docs/arquitectura/Entornos.md`.

### 5. `20261015120000_menor_edad_hora_ecuador` — el CHECK de menores

Corrige dos errores del CHECK `acompanante_obligatorio_si_menor` (detalle en el
comentario de la migración y en `docs/adr/ADR-003-menor-edad-18-anos.md`):
`age() >= '18 years'` daba 18 años la víspera, porque Postgres compara
intervalos con 1 mes = 30 días, y el "hoy" era el de UTC. La regla nueva cuenta
años enteros con la fecha de Ecuador y coincide con `lib/edad.ts`.

Verificación, 15–16 de octubre de 2026:

- `npm run test:menor-edad` (`tests/regla-menor-edad.test.ts`): aplica
  las migraciones en PGlite, lee el CHECK guardado y lo compara con
  `lib/edad.ts` en 1.098 pares de borde con dos relojes (mediodía y 23:00 de
  Ecuador). Con las 9: coinciden los 2.196 casos. Sin la 9 difiere en 583: así
  se comprueba que la prueba distingue, y desde el Paso 4 esa comprobación es
  un test más del mismo archivo. Con `.env` de dev, además, hace INSERT reales
  de quien cumple 18 ayer, hoy y mañana. (El comentario de la migración 9 cita
  la ruta anterior, `scripts/verificar-regla-menor-edad.mts`: las migraciones
  aplicadas no se editan.)
- En dev, con INSERT directo: quien cumple 18 mañana sin acompañante es
  rechazado (`23514`) y quien cumple hoy entra. Con un `now()` fijo a las 23:00
  de Ecuador la regla nueva dice "menor" donde la vieja y la de UTC decían
  "adulto".
- En producción, antes de aplicarla (solo lectura, solo conteos): 0 filas
  romperían la regla nueva y 0 entraron gracias al error de la víspera, según
  su `created_at`.

### 6. `20261016120000_fecha_consulta_hora_ecuador` — el DEFAULT de `consultas.fecha`

`default CURRENT_DATE` contaba en UTC: una consulta insertada sin `fecha` entre
las 19:00 y la medianoche de Ecuador quedaba con la de mañana. Pasa a
`((now() at time zone 'America/Guayaquil'))::date`. Hoy el DEFAULT no se usa
(`lib/consultas/guardado.ts` siempre manda `fecha`); es la red de cualquier
INSERT que la omita. Verificado en dev el 16 de octubre de 2026: un INSERT sin
`fecha` guardó el día de Ecuador, y con reloj fijo la expresión da el 15 a las
04:00Z y a las 04:59:59Z (el `CURRENT_DATE` de UTC daba el 16) y el 16 a las
05:00Z.

### Lo que queda por cerrar

~~La comparación automática nunca se ha corrido sobre PostgreSQL 17~~ y ~~no se
ha vuelto a correr desde la migración 6~~: **cerrado** por la sección 4, que
reconstruye las 8 sobre un PG17 real y compara con producción. Queda opcional
repetir la verificación local con Docker (PGlite o `supabase start`), que no
depende de ningún proyecto remoto; hace falta Docker y un
`SUPABASE_ACCESS_TOKEN` vigente:

```bash
npx supabase start
npx supabase db reset
node --env-file=.env scripts/verificar-migraciones.mjs --motor=docker
```

Ese token se creó para la Fase 0 y se revocó al terminar, que es lo correcto:
es una credencial de cuenta. Hay que recrearlo cuando se quiera repetir la
verificación en vivo.

## Qué NO está aquí, a propósito

- **El event trigger `ensure_rls` y su función `public.rls_auto_enable`.**
  Activan RLS automáticamente en cada tabla nueva de `public`. **Resuelto el 15
  de octubre de 2026:** los crea Supabase al crear el proyecto con la opción
  «Enable automatic RLS» (producción y dev se crearon así). No son nuestros y por
  eso no se versionan. Nuestras migraciones no dependen de ellos: activan RLS de
  forma explícita con `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, y
  `scripts/verificar-migraciones.mjs` los excluye de la comparación.
- **Los roles `anon`, `authenticated` y `service_role`, y el esquema `auth`.**
  Los provee Supabase al crear el proyecto.
- **Los datos.** Los catálogos se cargan con `scripts/import-cie10.mjs` y
  `scripts/import-medicamentos.mjs`. En dev, los pacientes son
  sintéticos (`npm run sembrar:pacientes` o `supabase/seed.sql`). Ver
  `docs/arquitectura/Entornos.md`.
