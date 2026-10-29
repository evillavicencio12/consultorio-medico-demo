-- ============================================================================
-- Tabla `receta_medicamentos`: los renglones de medicamento de cada receta.
--
-- Depende de `consultas`, por eso va al final de las tablas.
-- Permisos (RLS + GRANT): ver 20260820120400_rls_y_grants.sql
--
-- Nota de alcance: aquí NO hay descuento de stock ni control de inventario.
-- Es una decisión explícita del proyecto, no un pendiente — ver
-- Decisiones-ADR/ADR-001-sin-control-inventario.md.
-- ============================================================================

create table public.receta_medicamentos (
  id                 uuid not null default gen_random_uuid(),
  consulta_id        uuid not null,

  -- Se copian como texto en lugar de referenciar `medicamentos_catalogo` por
  -- FK: la receta es un documento impreso y debe conservar lo que se recetó ese
  -- día, aunque el catálogo cambie después. Además la doctora puede recetar algo
  -- que no esté en el catálogo.
  nombre_generico    text not null,
  nombre_comercial   text not null,

  presentacion       text not null,
  cantidad           integer not null,
  dosis              text not null,
  via_administracion text not null,
  frecuencia         text not null,
  duracion           text not null,

  constraint receta_medicamentos_pkey primary key (id),

  -- CASCADE, al revés que en `consultas`: un renglón de receta no existe por sí
  -- mismo. Si se borra la consulta, sus medicamentos se van con ella; dejarlos
  -- huérfanos no tendría sentido clínico.
  constraint receta_medicamentos_consulta_id_fkey
    foreign key (consulta_id) references public.consultas(id) on delete cascade,

  constraint receta_medicamentos_cantidad_check check (cantidad > 0),

  -- Los dos CHECK siguientes son los dropdowns del formulario de receta,
  -- fijados también en la base para que ningún camino alterno meta un valor
  -- fuera de lista. Si se agrega una opción en la UI, hay que agregarla aquí
  -- con una migración nueva. Ver Modulos/05-Prescripcion-Receta.md.
  constraint receta_medicamentos_presentacion_check check (
    presentacion = any (array[
      'capsula'::text, 'tableta'::text, 'ampolla'::text, 'frasco'::text,
      'solucion_inyectable'::text, 'solucion_oral'::text
    ])
  ),
  constraint receta_medicamentos_via_administracion_check check (
    via_administracion = any (array[
      'oral'::text, 'sublingual'::text, 'intramuscular'::text, 'intravenosa'::text,
      'subcutanea'::text, 'topica'::text, 'rectal'::text, 'oftalmica'::text,
      'otica'::text, 'inhalada'::text
    ])
  )
);

-- Traer los medicamentos de una consulta es lo único que se le pide a esta
-- tabla, y es lo que hace el generador de PDF de la receta.
create index idx_receta_medicamentos_consulta
  on public.receta_medicamentos using btree (consulta_id);
