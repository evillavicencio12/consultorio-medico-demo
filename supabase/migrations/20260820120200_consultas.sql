-- ============================================================================
-- Secuencia del número de receta + tabla `consultas`.
--
-- Depende de `pacientes` y de `cie10_catalogo`, por eso va después de las dos.
-- Permisos (RLS + GRANT): ver 20260820120400_rls_y_grants.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- numero_receta_seq
-- ---------------------------------------------------------------------------
-- ADR-002: el número de receta es un correlativo GLOBAL del consultorio, nunca
-- por paciente. Una secuencia independiente es justamente lo que garantiza eso:
-- un único contador para toda la base.
--
-- Se declara como secuencia suelta y NO como `bigserial`/`identity` a propósito,
-- reproduciendo la base real. La diferencia importa: una secuencia creada por
-- `bigserial` queda OWNED BY la columna y se borraría junto con ella. Esta no
-- pertenece a ninguna columna, así que el correlativo sobrevive a cambios en
-- `consultas` — que es lo que se quiere de un número que va impreso en papel y
-- que la doctora debe poder rastrear años después.
--
-- CACHE 1 (el valor por defecto) también es deliberado: con caché mayor, cada
-- conexión reserva un bloque de números y los que no usa se pierden, dejando
-- huecos en el correlativo. Ver ADR-002.
create sequence public.numero_receta_seq
  as bigint
  increment by 1
  minvalue 1
  maxvalue 9223372036854775807
  start with 1
  cache 1
  no cycle;

-- ---------------------------------------------------------------------------
-- consultas
-- ---------------------------------------------------------------------------
create table public.consultas (
  id                                uuid not null default gen_random_uuid(),
  paciente_id                       uuid not null,
  fecha                             date not null default CURRENT_DATE,

  motivo_consulta                   text,

  -- Antecedentes personales patológicos, tal como se registran EN ESA consulta
  -- (los de `pacientes` son los heredofamiliares, que son otra cosa).
  alergias                          text,
  patologias                        text,
  quirurgicos                       text,

  -- Exploración física. `pa` (presión arterial) es texto porque se anota como
  -- "120/80", que no es un número.
  pa                                text,
  fc                                numeric,
  fr                                numeric,
  temperatura                       numeric,
  peso                              numeric,

  impresion_diagnostica             text,
  cie10_codigo                      text,
  tratamiento                       text,
  signos_alarma                     text,
  recomendaciones_no_farmacologicas text,

  numero_receta                     bigint not null default nextval('public.numero_receta_seq'::regclass),
  created_at                        timestamp with time zone not null default now(),

  constraint consultas_pkey primary key (id),

  -- Refuerza ADR-002: aunque la secuencia ya entrega valores distintos, el
  -- UNIQUE impide que dos consultas terminen con el mismo número si alguna vez
  -- se asigna a mano (corrección, reimpresión, importación).
  constraint consultas_numero_receta_key unique (numero_receta),

  -- RESTRICT, no CASCADE: una consulta es un registro clínico. Borrar un
  -- paciente con historial debe fallar en la base, no llevarse el historial por
  -- delante en silencio.
  constraint consultas_paciente_id_fkey
    foreign key (paciente_id) references public.pacientes(id) on delete restrict,

  -- Sin cláusula ON DELETE: queda en NO ACTION, el valor por defecto de SQL.
  -- Un código CIE-10 en uso no se puede borrar del catálogo.
  constraint consultas_cie10_codigo_fkey
    foreign key (cie10_codigo) references public.cie10_catalogo(codigo)
);

-- DESC porque el historial siempre se lee de la consulta más reciente hacia
-- atrás; el índice entrega ese orden sin necesidad de ordenar en memoria.
create index idx_consultas_fecha on public.consultas using btree (fecha desc);

-- La consulta más frecuente del sistema: todas las consultas de un paciente.
create index idx_consultas_paciente on public.consultas using btree (paciente_id);
