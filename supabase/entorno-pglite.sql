-- Andamiaje MÍNIMO de Supabase para la verificación local con PGlite.
--
-- Esto NO es parte del esquema del proyecto y por eso no vive en migrations/:
-- son objetos que Supabase ya trae hechos al crear un proyecto, y que las
-- migraciones dan por sentados. PGlite es un PostgreSQL pelado, así que hay que
-- crearlos a mano antes de aplicar nada.
--
-- Con `supabase start` (Docker) este archivo NO se usa: ahí el stack real ya
-- provee todo esto.

-- Los tres roles de PostgREST a los que apuntan los GRANT.
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
-- `bypassrls` reproduce el privilegio real de service_role en Supabase: es lo
-- que permite que los scripts de importación salten las políticas.
create role service_role   nologin noinherit bypassrls;

-- `auth.role()` es la función en la que se apoyan todas las políticas RLS. La
-- de Supabase lee el claim del JWT; esta réplica lee el mismo ajuste de sesión
-- que usa PostgREST, y devuelve NULL si no hay sesión — con lo que las
-- políticas niegan el acceso, igual que en producción.
create schema if not exists auth;
create or replace function auth.role() returns text
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.role', true), '')::text $$;
