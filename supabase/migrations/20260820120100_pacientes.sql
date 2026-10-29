-- ============================================================================
-- Tabla `pacientes`.
--
-- ESTADO CONSOLIDADO, NO HISTÓRICO. Esta migración describe el esquema tal como
-- debe quedar, no la secuencia de pasos por la que pasó la base real. En
-- particular, `cedula`, `fecha_nacimiento` y `sexo` se crean directamente como
-- NULL-ables: en la base de producción nacieron NOT NULL y se les quitó la
-- restricción después, al importar el histórico del Sheet. Reproducir ese
-- vaivén obligaría a quien reconstruya la base a pasar por un estado intermedio
-- que rechaza datos hoy válidos, sin ganar nada. El porqué del cambio está
-- documentado en Decisiones-ADR/ADR-006-campos-opcionales-migracion.md y en el
-- historial de git; una migración no es una bitácora.
--
-- Permisos (RLS + GRANT): ver 20260820120400_rls_y_grants.sql
-- ============================================================================

create table public.pacientes (
  id                            uuid not null default gen_random_uuid(),

  -- ADR-006: NULL-able solo por la carga histórica. El formulario de alta
  -- (RF-03) SÍ los exige obligatorios — la base los permite vacíos por
  -- compatibilidad con los pacientes migrados, no como comportamiento normal.
  cedula                        text,
  nombre_completo               text not null,
  fecha_nacimiento              date,
  sexo                          text,

  telefono                      text,
  correo                        text,
  domicilio                     text,
  ocupacion                     text,
  antecedentes_heredofamiliares text,

  -- Se refresca desde la última consulta; ver Modulos/02-Gestion-Pacientes.md.
  alergia_actual                text,

  -- ADR-003: obligatorios si el paciente es menor de 18 años. La regla se
  -- aplica abajo con el CHECK `acompanante_obligatorio_si_menor`, no aquí:
  -- a nivel de columna no se puede condicionar a la edad.
  nombre_acompanante            text,
  cedula_acompanante            text,
  correo_acompanante            text,
  telefono_acompanante          text,

  created_at                    timestamp with time zone not null default now(),

  -- `estado_civil` va al final a propósito. Se agregó a la base después del
  -- script inicial, así que en producción ocupa la posición 17. Mantener ese
  -- orden hace que el esquema reconstruido sea idéntico columna por columna
  -- (incluido `ordinal_position`) y que `select *` devuelva el mismo orden.
  estado_civil                  text,

  constraint pacientes_pkey primary key (id),

  -- Una cédula identifica a una persona: no puede repetirse. UNIQUE en Postgres
  -- no restringe los NULL, así que los pacientes migrados sin cédula (83 de los
  -- 164) conviven sin chocar entre sí. Ver la migración inicial de datos.
  constraint pacientes_cedula_key unique (cedula),

  constraint pacientes_sexo_check check (sexo = any (array['M'::text, 'F'::text])),

  -- ADR-003. Se lee: "o el paciente tiene 18 años o más, o trae acompañante
  -- con nombre y cédula".
  --
  -- Dos comportamientos que conviene tener presentes y que son deliberados:
  --   * Si `fecha_nacimiento` es NULL, `age()` devuelve NULL, la comparación
  --     devuelve NULL y el CHECK NO se viola (en SQL un CHECK solo falla si
  --     evalúa a FALSE, no a NULL). Por eso los 29 pacientes migrados sin
  --     fecha de nacimiento entraron sin acompañante. Es la limitación que
  --     ADR-006 acepta explícitamente, no un descuido.
  --   * `age()` depende de la fecha actual, así que el CHECK no es inmutable.
  --     Solo puede volverse más permisivo con el tiempo (un menor cumple 18,
  --     nunca al revés), de modo que no puede invalidar filas ya guardadas.
  constraint acompanante_obligatorio_si_menor check (
    (age((fecha_nacimiento)::timestamp with time zone) >= '18 years'::interval)
    or ((nombre_acompanante is not null) and (cedula_acompanante is not null))
  )
);

-- Búsqueda del paciente por cédula: es como la doctora lo identifica cuando lo
-- tiene enfrente. Se solapa parcialmente con el índice único de
-- `pacientes_cedula_key`, que ya serviría para esto; se conserva porque está
-- presente en la base real y quitarlo sería un cambio de esquema, no una
-- transcripción. Ver la nota de deuda técnica en la migración inicial de datos.
create index idx_pacientes_cedula on public.pacientes using btree (cedula);

-- Búsqueda por nombre con stemming en español (mismo criterio que los
-- catálogos): basta un apellido para encontrar al paciente, sin escribir el
-- nombre completo.
create index idx_pacientes_nombre
  on public.pacientes using gin (to_tsvector('spanish'::regconfig, nombre_completo));
