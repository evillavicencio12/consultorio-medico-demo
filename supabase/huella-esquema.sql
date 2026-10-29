-- Huella del esquema: devuelve UNA fila con UN jsonb que describe por completo
-- el esquema `public` de este proyecto.
--
-- Se ejecuta sin cambios contra producción y contra la base local reconstruida
-- desde supabase/migrations/. Comparar las dos salidas es la prueba de que las
-- migraciones reproducen el esquema real. Usar el MISMO texto SQL en ambos
-- lados es justamente lo que hace válida la comparación.
--
-- Es de solo lectura: solo consulta catálogos de Postgres.
-- Uso: node --env-file=.env scripts/verificar-migraciones.mjs
select jsonb_build_object(

  'tablas', (
    select coalesce(jsonb_agg(t order by t->>'tabla'), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', c.relname,
        'rls_activo', c.relrowsecurity,
        'rls_forzado', c.relforcerowsecurity
      ) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) s
  ),

  'columnas', (
    select coalesce(jsonb_agg(t order by t->>'tabla', (t->>'posicion')::int), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', table_name,
        'posicion', ordinal_position,
        'columna', column_name,
        'tipo', data_type,
        'nulable', is_nullable,
        'default', column_default,
        'precision', numeric_precision,
        'escala', numeric_scale,
        'identity', is_identity,
        'generada', is_generated
      ) as t
      from information_schema.columns
      where table_schema = 'public'
    ) s
  ),

  -- pg_get_constraintdef normaliza la expresión al mismo texto en ambos lados,
  -- así que da igual cómo se haya escrito el CHECK en el SQL de origen.
  'constraints', (
    select coalesce(jsonb_agg(t order by t->>'tabla', t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', rel.relname,
        'nombre', con.conname,
        'tipo', con.contype,
        'definicion', pg_get_constraintdef(con.oid)
      ) as t
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public'
    ) s
  ),

  'indices', (
    select coalesce(jsonb_agg(t order by t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', tablename,
        'nombre', indexname,
        'definicion', indexdef
      ) as t
      from pg_indexes where schemaname = 'public'
    ) s
  ),

  'secuencias', (
    select coalesce(jsonb_agg(t order by t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object(
        'nombre', sequencename,
        'tipo', data_type,
        'inicio', start_value,
        'minimo', min_value,
        'maximo', max_value,
        'incremento', increment_by,
        'ciclo', cycle,
        'cache', cache_size
      ) as t
      from pg_sequences where schemaname = 'public'
    ) s
  ),

  'politicas', (
    select coalesce(jsonb_agg(t order by t->>'tabla', t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', tablename,
        'nombre', policyname,
        'permisiva', permissive,
        'roles', roles::text,
        'comando', cmd,
        'using', qual,
        'with_check', with_check
      ) as t
      from pg_policies where schemaname = 'public'
    ) s
  ),

  -- ACL real vía aclexplode. NO se usa information_schema.role_table_grants:
  -- esa vista filtra por el rol de la sesión y devuelve vacío según quién
  -- pregunte, lo que daría un falso "sin permisos".
  'grants_tablas', (
    select coalesce(jsonb_agg(t order by t->>'tabla', t->>'rol', t->>'privilegio'), '[]'::jsonb) from (
      select jsonb_build_object(
        'tabla', c.relname,
        'rol', pg_get_userbyid(acl.grantee),
        'privilegio', acl.privilege_type
      ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
      where n.nspname = 'public' and c.relkind = 'r'
    ) s
  ),

  'grants_secuencias', (
    select coalesce(jsonb_agg(t order by t->>'secuencia', t->>'rol', t->>'privilegio'), '[]'::jsonb) from (
      select jsonb_build_object(
        'secuencia', c.relname,
        'rol', pg_get_userbyid(acl.grantee),
        'privilegio', acl.privilege_type
      ) as t
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('S', c.relowner))) acl
      where n.nspname = 'public' and c.relkind = 'S'
    ) s
  ),

  -- Se incluyen para detectar objetos inesperados en `public` (por ejemplo el
  -- event trigger `ensure_rls`, que es de la plataforma y no nuestro).
  'funciones_public', (
    select coalesce(jsonb_agg(t order by t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object('nombre', p.proname, 'duenno', pg_get_userbyid(p.proowner)) as t
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ) s
  ),

  'event_triggers', (
    select coalesce(jsonb_agg(t order by t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object(
        'nombre', evtname,
        'evento', evtevent,
        'duenno', pg_get_userbyid(evtowner),
        'funcion', (select p.proname from pg_proc p where p.oid = et.evtfoid)
      ) as t
      from pg_event_trigger et
    ) s
  ),

  'triggers', (
    select coalesce(jsonb_agg(t order by t->>'nombre'), '[]'::jsonb) from (
      select jsonb_build_object('tabla', c.relname, 'nombre', tg.tgname,
                                'definicion', pg_get_triggerdef(tg.oid)) as t
      from pg_trigger tg
      join pg_class c on c.oid = tg.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not tg.tgisinternal
    ) s
  )

) as huella;
