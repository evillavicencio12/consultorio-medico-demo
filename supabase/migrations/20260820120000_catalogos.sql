-- ============================================================================
-- Catálogos de referencia: CIE-10 y medicamentos.
--
-- Van primero porque no dependen de nada y `consultas` los referencia por FK.
-- Ambos son de SOLO LECTURA para la aplicación: se llenan con los scripts de
-- importación (scripts/import-cie10.mjs y el Sheet de medicamentos), nunca
-- desde la UI. Ver Integraciones/Catalogo-CIE10.md y
-- Integraciones/Contrato-Sheet-Medicamentos.md en la bóveda.
--
-- Los permisos (RLS + GRANT) de estas tablas viven en la migración
-- 20260820120400_rls_y_grants.sql, junto con los del resto del esquema.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- cie10_catalogo
-- ---------------------------------------------------------------------------
-- La PK es el propio código CIE-10 (texto, p. ej. 'J00'), no un uuid: el código
-- ES el identificador natural y `consultas.cie10_codigo` lo referencia tal cual.
create table public.cie10_catalogo (
  codigo      text not null,
  descripcion text not null,

  constraint cie10_catalogo_pkey primary key (codigo)
);

-- Búsqueda por texto del diagnóstico. Diccionario 'spanish': aplica stemming y
-- stopwords en español, de modo que "infecciones intestinales" encuentra
-- "infección intestinal". Es un índice de expresión, así que la consulta debe
-- usar exactamente `to_tsvector('spanish', descripcion)` para poder usarlo.
create index idx_cie10_descripcion
  on public.cie10_catalogo using gin (to_tsvector('spanish'::regconfig, descripcion));

-- ---------------------------------------------------------------------------
-- medicamentos_catalogo
-- ---------------------------------------------------------------------------
create table public.medicamentos_catalogo (
  id               uuid not null default gen_random_uuid(),
  nombre_generico  text not null,
  nombre_comercial text not null,

  constraint medicamentos_catalogo_pkey primary key (id),
  -- El nombre comercial es el que la doctora escribe en la receta: no puede
  -- haber dos filas con el mismo, o el buscador ofrecería duplicados.
  constraint medicamentos_catalogo_nombre_comercial_key unique (nombre_comercial)
);

-- Busca sobre genérico y comercial a la vez, concatenados: un solo índice sirve
-- para "escribo lo que sea que recuerde del medicamento".
create index idx_medicamentos_nombre
  on public.medicamentos_catalogo
  using gin (to_tsvector('spanish'::regconfig, ((nombre_generico || ' '::text) || nombre_comercial)));
