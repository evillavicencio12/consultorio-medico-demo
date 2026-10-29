@AGENTS.md

# CLAUDE.md — Consultorio Demo

Instrucciones para los agentes de código (Claude Code) que trabajan en este repo. Sistema web (Next.js) que reemplaza el historial clínico y la receta en papel de un consultorio médico con una sola usuaria, la doctora. Las reglas viven en `docs/`; aquí va una línea por regla con su nota.

## Cómo trabajar aquí
- Lee solo la nota del módulo que vas a tocar (`docs/modulos/`) y lo que ella cite. Mapa: [docs/README.md](docs/README.md).
- Regla de negocio nueva: nota o ADR en `docs/`, nunca solo en código o aquí.
- Cambios grandes o que tocan varios módulos: primero un plan, y se espera la aprobación.
- Flujo de revisión: todo entra por rama y PR con el check `verificar` en verde; `/code-review` antes de cada commit, y cada hallazgo se verifica antes de corregirlo o descartarlo.

## Reglas
- Dos entornos: `.env` = dev (datos sintéticos) por defecto; `.env.produccion` vive fuera del repo, se usa solo a mano y siempre con su ruta explícita (`--env-file="<ruta del .env.produccion>"`, `-EnvFile "<ruta del .env.produccion>"`; sin ruta por defecto en el código). Los refs vienen de `SUPABASE_REF_DEV` y `SUPABASE_REF_PRODUCCION`, y la guarda de `lib/entorno.ts` corta pruebas y siembra fuera de dev → [Entornos](docs/arquitectura/Entornos.md)
- Producción tiene datos clínicos reales: toda escritura se propone y espera confirmación explícita; si un `--dry-run` falla, detente. E2E solo con paciente ficticio → [Verificacion-y-CI](docs/arquitectura/Verificacion-y-CI.md)
- Verificar es ejecutar (servidor, sesión real, PDF y su texto); tsc/eslint/build en verde no prueban nada solos → misma nota.
- Toda Server Action nueva empieza con `clienteConSesion()` (`lib/supabase/sesion.ts`, `getUser()`, nunca `getSession()`): `proxy.ts` protege páginas y deja pasar los POST de acciones; RLS es la última capa. `tests/sesion-acciones.test.ts` descubre las acciones solo → [Seguridad-OWASP](docs/arquitectura/Seguridad-OWASP.md)
- Todo route handler (`app/**/route.ts`) verifica la sesión por su cuenta con `getUser()` y no confía en `proxy.ts`: el proxy deja pasar cualquier `POST` con cabecera `next-action`, y esa cabecera la puede poner cualquiera → [Seguridad-OWASP](docs/arquitectura/Seguridad-OWASP.md)
- Cliente por defecto `lib/supabase/server.ts`; `admin.ts` salta RLS. Filas con `type`, nunca `interface`. Solo Server Actions/API Routes hablan con Supabase y Google → [Supabase-en-la-App](docs/arquitectura/Supabase-en-la-App.md)
- Esquema solo con migración nueva, entregada como SQL; nunca editar las aplicadas ni usar el panel; RLS en pacientes y consultas → [Migraciones](docs/arquitectura/Migraciones.md)
- Nunca usar `grep -r`, `findstr /s` ni `Select-String -Recurse` sobre el repo: no respetan `.gitignore` y leen `.env`. Usar siempre la herramienta Grep. Esto vale también para los subagentes; el hook `.claude/hooks/bloquear-busqueda-recursiva.mjs` lo hace cumplir → [Trampas-Recurrentes](docs/arquitectura/Trampas-Recurrentes.md)
- Secretos: claves de servicio sin `NEXT_PUBLIC_`, `credenciales.json` fuera del repo, scripts con `--env-file=.env` (salvo `verificar:bundle`: `--env-file-if-exists`, porque en el CI no hay `.env` y busca centinelas), ningún dato de pacientes en el repo ni en metadatos de PDF → [Seguridad-OWASP](docs/arquitectura/Seguridad-OWASP.md)
- Receta con correlativo global ([ADR-002](docs/adr/ADR-002-numero-receta-global.md)); menor de 18 exige acompañante ([ADR-003](docs/adr/ADR-003-menor-edad-18-anos.md)); sin inventario ([ADR-001](docs/adr/ADR-001-sin-control-inventario.md)); un PDF por consulta ([06-Generador-PDF](docs/modulos/06-Generador-PDF.md)).
- Stack fijo: Next.js + TS estricto + Tailwind, Supabase, pdf-lib en overlay sobre las plantillas impresas; despliegue: en evaluación → [Stack-Tecnologico](docs/arquitectura/Stack-Tecnologico.md)
- Diseño con los tokens de [Sistema-de-Diseno](docs/diseno/Sistema-de-Diseno.md) (IBM Plex, navy/turquesa/rojo); nunca Inter, iconos multicolor ni paleta genérica.

## Trampas → [Trampas-Recurrentes](docs/arquitectura/Trampas-Recurrentes.md)
Next 16 (`proxy.ts`, `cookies()` asíncrono, `PageProps`); fechas `YYYY-MM-DD` sin `new Date()`; texto libre al PDF por `lib/texto-plano.ts`; ningún campo del PDF sin `cabeEnElEspacio()`; armazón `fixed inset-0` con un solo scroll; container queries dentro de columnas; tests con `FormData` real y datos sintéticos.

## Herramientas
- Skill `supabase-postgres-best-practices` antes de cualquier migración.
- `/code-review` antes de cada commit.
- context7 para documentación de librerías.
