-- ============================================================================
-- Control de acceso: RLS, políticas y GRANTs de las 5 tablas.
--
-- Está en un archivo aparte, y no repartido dentro de cada tabla, porque
-- CLAUDE.md y Arquitectura/Seguridad-OWASP.md exigen RLS en TODAS las tablas de
-- pacientes y consultas: teniéndolo junto, se audita de un vistazo si falta
-- alguna. Si se agrega una tabla, su política va aquí.
--
-- En Supabase el acceso se decide en DOS capas y hacen falta las dos:
--
--   1. GRANT  — permiso de SQL clásico. Si falta, PostgREST devuelve
--               "permission denied for table" antes siquiera de mirar RLS.
--   2. RLS    — la que filtra de verdad, fila por fila.
--
-- Por eso abajo se ve `grant all ... to anon`: parece que se le abre la puerta
-- a un usuario anónimo, pero no. `anon` recibe el permiso de tabla y acto
-- seguido RLS le niega todas las filas, porque ninguna política contempla
-- `auth.role() = 'anon'`. Es el patrón estándar de Supabase: el GRANT abre la
-- puerta y RLS es la cerradura.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GRANTs de tabla
-- ---------------------------------------------------------------------------
-- Estos GRANTs son IMPRESCINDIBLES y no se pueden omitir esperando que Supabase
-- los ponga solo. Verificado contra `pg_default_acl` de la base real: una tabla
-- creada por el rol `postgres` en el esquema `public` (que es lo que pasa al
-- crearla con SQL, en vez de con el Table Editor del panel) hereda por defecto
-- solo MAINTAIN, REFERENCES, TRIGGER y TRUNCATE para anon/authenticated/
-- service_role. SELECT, INSERT, UPDATE y DELETE NO se heredan.
--
-- Sin estas líneas, una base reconstruida desde cero quedaría con las políticas
-- RLS correctas y la aplicación aun así no podría leer ni una fila.
grant all on table public.pacientes             to anon, authenticated, service_role;
grant all on table public.consultas             to anon, authenticated, service_role;
grant all on table public.receta_medicamentos   to anon, authenticated, service_role;
grant all on table public.cie10_catalogo        to anon, authenticated, service_role;
grant all on table public.medicamentos_catalogo to anon, authenticated, service_role;

-- La secuencia necesita su propio permiso: `nextval()` exige USAGE. Sin esto,
-- insertar una consulta falla al evaluar el DEFAULT de `numero_receta`, aunque
-- el GRANT sobre la tabla esté bien.
-- Nota: se otorga USAGE y SELECT, pero NO UPDATE — nadie debe poder mover el
-- correlativo con `setval()` (ADR-002).
grant usage, select on sequence public.numero_receta_seq to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Activar RLS
-- ---------------------------------------------------------------------------
-- Sin ENABLE, las políticas de abajo existen pero no se aplican: Postgres las
-- ignora por completo y la tabla queda abierta a quien tenga el GRANT.
alter table public.pacientes             enable row level security;
alter table public.consultas             enable row level security;
alter table public.receta_medicamentos   enable row level security;
alter table public.cie10_catalogo        enable row level security;
alter table public.medicamentos_catalogo enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Políticas
-- ---------------------------------------------------------------------------
-- El sistema tiene UNA sola usuaria, la doctora (ver Modulos/01-Autenticacion.md),
-- así que no hay particiones por dueño: la regla es simplemente "sesión
-- autenticada sí, cualquier otra no".
--
-- USING filtra lo que se puede LEER; WITH CHECK valida lo que se intenta
-- ESCRIBIR. En una política FOR ALL hacen falta ambas: solo con USING se podrían
-- insertar filas que después ni siquiera se pueden volver a leer.
--
-- `service_role` no se ve afectado por nada de esto: salta RLS por diseño. Es
-- justamente por eso que SUPABASE_SERVICE_ROLE_KEY nunca puede llegar al
-- navegador (ver Seguridad-OWASP.md y la advertencia en .env.example).

-- Datos clínicos: lectura y escritura.
create policy "Doctora autenticada - acceso total" on public.pacientes
  for all
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

create policy "Doctora autenticada - acceso total" on public.consultas
  for all
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

create policy "Doctora autenticada - acceso total" on public.receta_medicamentos
  for all
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

-- Catálogos: SOLO LECTURA incluso para la doctora. Se llenan con los scripts de
-- importación, que corren con service_role y por eso sí pueden escribir. Que la
-- app no pueda modificarlos es intencional: son datos de referencia
-- (12.634 códigos CIE-10) y una edición accidental desde la UI los corrompería.
create policy "Doctora autenticada - solo lectura" on public.cie10_catalogo
  for select
  using (auth.role() = 'authenticated'::text);

create policy "Doctora autenticada - solo lectura" on public.medicamentos_catalogo
  for select
  using (auth.role() = 'authenticated'::text);
