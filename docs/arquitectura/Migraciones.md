---
tags: [arquitectura, migraciones, esquema]
---

# Migraciones de base de datos

El esquema completo vive versionado en `supabase/migrations/`: las 5 tablas con sus tipos y constraints, los índices de búsqueda, la secuencia del número de receta, las políticas RLS y los GRANTs. Es la **fuente de verdad del esquema**. Cómo agregar una y cómo verificar que reproducen producción: [`supabase/README.md`](../../supabase/README.md).

- El esquema de la base se cambia **solo con una migración nueva**, nunca a mano en el panel de Supabase.
- Un cambio de esquema = **un archivo nuevo** de migración, con nombre `AAAAMMDDHHMMSS_descripcion.sql`. Nunca se editan las migraciones ya aplicadas ni se toca el esquema desde la UI de Supabase. Por eso sus comentarios citan todavía las rutas de la antigua bóveda (ver la tabla de rutas antiguas en el [Índice](../README.md)).
- Están escritas en **estado consolidado** (el esquema como debe quedar), no como historia paso a paso. El porqué de cada decisión histórica vive en los ADR y en git.
- Los GRANTs explícitos de `20260820120400_rls_y_grants.sql` **no son redundantes**: una tabla creada por SQL en `public` no hereda SELECT/INSERT/UPDATE/DELETE para `anon`/`authenticated`/`service_role`. Sin ellos, la base reconstruida tendría RLS correcto y aun así la app no leería nada.
- RLS es obligatorio en todas las tablas de pacientes y consultas ([Seguridad-OWASP](Seguridad-OWASP.md)).
- Las correcciones sobre **datos** (no sobre esquema) no son migraciones: se registran en la migración inicial de datos.
- Las migraciones se entregan como SQL para que el usuario las aplique en el SQL Editor; no se ejecuta DDL desde un agente ([Verificacion-y-CI](Verificacion-y-CI.md)).
- Antes de escribir una, cargar la skill `supabase-postgres-best-practices`.

## Ver también
- [Modelo-de-Datos](Modelo-de-Datos.md)
- [Índice](../README.md)
