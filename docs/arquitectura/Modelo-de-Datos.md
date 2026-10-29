---
tags: [arquitectura, base-de-datos]
---

# Modelo de Datos (Supabase)

> [!important] La fuente de verdad del esquema es `supabase/migrations/`
> Desde la Fase 0, el esquema **vive versionado en el repositorio**, no solo en
> el panel web de Supabase. Los archivos de `supabase/migrations/` son la
> definición autoritativa: tipos, nullability, constraints, índices, RLS y
> GRANTs, con el porqué de cada decisión comentado en el propio SQL.
>
> Esta nota describe el modelo en lenguaje de negocio. Si alguna vez discrepa
> del SQL, **gana el SQL** — y hay que corregir esta nota.
>
> **Ningún cambio de esquema se hace a mano en el panel de Supabase.** Se
> escribe una migración nueva, se versiona y se aplica. Las correcciones sobre
> los *datos* (no sobre el esquema) se registran en la migración inicial de datos.

## Las migraciones

Las 7 están **aplicadas en producción**: las seis primeras al 20 de agosto de
2026 y `20260821120000_tipo_documento.sql` el 21, desde el SQL Editor.
Verificada esa última con `pg_constraint` e `information_schema` sobre la base
real: `pacientes_documento_key` es `UNIQUE (tipo_documento, documento)`, el
CHECK `acompanante_obligatorio_si_menor` quedó apuntando a
`documento_acompanante`, `pacientes_cedula_key` ya no existe, y las 164 filas
conservaron su documento (`tipo_documento = 'cedula'` en todas, 83 sin
número).

| Archivo | Contenido |
|---|---|
| `20260820120000_catalogos.sql` | `cie10_catalogo`, `medicamentos_catalogo` y sus índices de búsqueda |
| `20260820120100_pacientes.sql` | `pacientes`, sus CHECK (sexo, acompañante de menor) e índices |
| `20260820120200_consultas.sql` | La secuencia `numero_receta_seq` y la tabla `consultas` |
| `20260820120300_receta_medicamentos.sql` | `receta_medicamentos` y sus CHECK de dropdown |
| `20260820120400_rls_y_grants.sql` | RLS, políticas y GRANTs de las 5 tablas |
| `20260820130000_consultas_transfusionales.sql` | Agrega `consultas.transfusionales` (posición 20, `text` NULL) |
| `20260821120000_tipo_documento.sql` | Renombra `cedula`→`documento`, agrega `tipo_documento` y cambia el UNIQUE al par |
| `20260822120000_numero_receta_opcional.sql` | `consultas.numero_receta` admite NULL: una consulta sin medicamentos no consume número del correlativo ([ADR-002-numero-receta-global](../adr/ADR-002-numero-receta-global.md)) |

Están escritas en **estado consolidado**, no como historia: describen el esquema
tal como debe quedar, no la secuencia de pasos por la que pasó la base real. Por
ejemplo, `cedula` se crea directamente como NULL-able en lugar de crearse
`NOT NULL` y relajarse después. El porqué de cada cambio histórico está en los
ADR y en el historial de git; una migración es una receta de reconstrucción, no
una bitácora.

### Qué queda fuera de las migraciones

- El event trigger `ensure_rls` y su función `public.rls_auto_enable`, que
  activan RLS automáticamente en cada tabla nueva de `public`. **Resuelto (15 de
  octubre de 2026):** los crea Supabase cuando el proyecto se crea con la opción
  «Enable automatic RLS»; los tienen producción y dev porque los dos se crearon
  así. No son nuestros y por eso no van en las migraciones, que tampoco dependen
  de ellos: activan RLS de forma explícita.
- Los roles `anon`, `authenticated` y `service_role` y el esquema `auth`, que
  provee Supabase.

Cómo verificar que las migraciones reproducen producción: ver `supabase/README.md`.

## Tabla `pacientes`
Nota: `documento`, `fecha_nacimiento` y `sexo` admiten NULL por la importación
histórica — ver [ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md). El formulario de alta sí
los exige.

id · **documento** · **tipo de documento** · nombre completo · fecha de
nacimiento · sexo · teléfono (opc) · correo (opc) · domicilio (opc) · ocupación
(opc) · antecedentes heredofamiliares · alergia actual (se actualiza desde la
última consulta) · nombre del acompañante (obligatorio si menor) · **documento
del acompañante** (obligatorio si menor) · **tipo de documento del
acompañante** · correo del acompañante (opc) · teléfono del acompañante (opc) ·
fecha de creación · estado civil (opcional).

- **El documento no es necesariamente una cédula.** La columna se llamaba
  `cedula` hasta `20260821120000_tipo_documento.sql`; se renombró a `documento`
  al admitir pacientes extranjeros, porque una columna con ese nombre que guarda
  pasaportes es una mentira silenciosa. Ver [ADR-008-validacion-cedula](../adr/ADR-008-validacion-cedula.md).
- `tipo_documento` es **NOT NULL con DEFAULT de cédula** y CHECK sobre
  `('cedula','pasaporte','otro')`.
  NOT NULL evita un cuarto estado ("documento sin tipo") que ni la validación ni
  la pantalla sabrían interpretar; en las 83 fichas sin número el tipo no afirma
  nada sobre el paciente, solo dice qué se le va a pedir.
- **El UNIQUE es del PAR `(tipo_documento, documento)`**, no del número solo. Un
  pasaporte extranjero podría coincidir con la cédula de un ecuatoriano, y el
  UNIQUE viejo habría rechazado como "duplicado" a dos personas distintas. Sigue
  valiendo que UNIQUE no restringe los NULL: las 83 fichas sin documento
  conviven.
- «Es menor de edad» **no es una columna**: se calcula desde
  `fecha_nacimiento`. Lo que sí existe en la base es el CHECK
  `acompanante_obligatorio_si_menor`, que aplica [ADR-003-menor-edad-18-anos](../adr/ADR-003-menor-edad-18-anos.md).
- `sexo` está restringido por CHECK a `'M'` o `'F'`.

## Tabla `consultas`
id · paciente (FK, `ON DELETE RESTRICT`) · fecha · motivo de consulta · alergias
(de esa consulta) · patologías · quirúrgicos · transfusionales · exploración física (PA, FC, FR,
temperatura, peso) · impresión diagnóstica (texto) · código CIE-10 (FK) ·
tratamiento (texto) · signos de alarma · recomendaciones no farmacológicas ·
número de receta (correlativo global — ver [ADR-002-numero-receta-global](../adr/ADR-002-numero-receta-global.md)) ·
fecha de creación.

- `transfusionales` forma parte de los antecedentes personales patológicos,
  junto a alergias, patologías y quirúrgicos. Faltaba en la base y se agregó en
  `20260820130000_consultas_transfusionales.sql`, ya aplicada en producción: es
  la columna 20 de la tabla, `text` NULL-able como sus tres hermanas.
- PA es texto (se anota «120/80»); FC, FR, temperatura y peso son numéricos.
- El número de receta lo entrega la secuencia `numero_receta_seq`, que es
  independiente de la tabla: el correlativo sobrevive a cambios en `consultas`.

## Tabla `receta_medicamentos`
id · consulta (FK, `ON DELETE CASCADE`) · nombre genérico · nombre comercial ·
presentación (dropdown) · cantidad · vía de administración (dropdown) ·
dosis · frecuencia · duración.

- Todas las columnas son **`NOT NULL`** en la base.
- `presentacion` y `via_administracion` tienen CHECK con lista cerrada de
  valores; agregar una opción en la UI exige una migración nueva.
- El nombre del medicamento se copia como texto, sin FK al catálogo: la receta
  debe conservar lo que se recetó ese día aunque el catálogo cambie después.

## Tabla `medicamentos_catalogo` (solo lectura para el buscador)
id · nombre genérico · nombre comercial. Origen: [Contrato-Sheet-Medicamentos](../integraciones/Contrato-Sheet-Medicamentos.md).

## Tabla `cie10_catalogo` (solo lectura para el buscador)
código (es la PK) · descripción. Origen: [Catalogo-CIE10](../integraciones/Catalogo-CIE10.md).

## Divergencias código ↔ base: resueltas

Detectadas al versionar el esquema (Fase 0) y cerradas antes de la Fase 1. En
**una** cedió la base; en cuatro cedió el código; una no era divergencia.
Todas están resueltas: el cambio de esquema ya está aplicado en producción y el
código ya no puede construir un valor que la base rechace.

| # | Divergencia | Quién cedió | Por qué |
|---|---|---|---|
| 1 | `transfusionales` no existía como columna | **La base** | La plantilla física trae impreso ese renglón y [03-Historial-Clinico](../modulos/03-Historial-Clinico.md) lo lista entre los antecedentes patológicos. Sus tres hermanas sí existían: fue un descuido del script inicial, no una decisión |
| 2 | Signos vitales `string` en el código, `numeric` en la base | **El código** | Son mediciones. `string` invitaba a lo que hacía el propio smoke test: `peso: "65 kg"` — la unidad no es parte del dato y la base lo habría rechazado. `pa` sigue siendo texto: «120/80» no es un número |
| 3 | Campos de receta opcionales en el código, `NOT NULL` en la base | **El código** | Una receta es un documento legal que ejecuta un farmacéutico: un renglón sin dosis, vía o duración no se puede despachar |
| 4 | `cantidad` aceptaba texto, número o nulo | **El código** | La base es `integer NOT NULL CHECK (cantidad > 0)`. «Medio frasco» se expresa en la dosis, no en la cantidad |
| 5 | Dropdowns como `string` libre | **El código** | Ahora son tipos unión que replican los CHECK. TypeScript rechaza al compilar lo que la base rechazaría al insertar |
| 6 | `correo_acompanante` / `telefono_acompanante` en la base y no en `Paciente` | **Ninguno** | No era divergencia sino diferencia de alcance: `lib/pdf/types.ts` es el contrato de ENTRADA del generador de PDF, no el espejo de las filas. El defecto real era el comentario que prometía lo contrario, y ese se corrigió |

### Lo que destapó el punto 5

Los valores del vocabulario se guardan como *slug* (`solucion_inyectable`) porque
son identificadores estables. Pero `lib/pdf/receta.ts` los imprimía **crudos**:
una receta habría salido de la impresora diciendo «(solucion_inyectable)» y «vía
subcutanea», con guion bajo y sin tilde, en un documento que lee un
farmacéutico. Se agregó `lib/pdf/vocabulario.ts`, que mantiene juntos el valor
guardado y su etiqueta legible; el PDF siempre imprime la etiqueta.

Ese módulo es también la lista que deben usar los dropdowns del formulario en la
Fase 1, para que UI, código y base no puedan desincronizarse.

### Las unidades, resueltas

Los signos vitales se guardan como número puro y la unidad se pega al imprimir
(`65 kg`, `36.5 °C`, `72 lpm`, `18 rpm`). Es presentación, no dato: la decisión
y la tabla completa están en [06-Generador-PDF](../modulos/06-Generador-PDF.md).

## Ver también
- la migración inicial de datos — correcciones manuales sobre los datos
- [Seguridad-OWASP](Seguridad-OWASP.md) — el modelo de acceso (RLS + GRANT) de estas tablas
- [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md)
- [03-Historial-Clinico](../modulos/03-Historial-Clinico.md)
- [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)
- [Índice](../README.md)
