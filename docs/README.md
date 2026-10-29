---
tags: [indice, mapa]
---

# 🗂️ Índice — Consultorio Demo

Documentación de trabajo del proyecto, en Markdown plano. Es la **fuente de verdad** para reglas de negocio, arquitectura y decisiones: cualquier regla nueva se escribe aquí antes que en el código.

## Mapa

**Módulos**
- [01-Autenticacion](modulos/01-Autenticacion.md)
- [02-Gestion-Pacientes](modulos/02-Gestion-Pacientes.md)
- [03-Historial-Clinico](modulos/03-Historial-Clinico.md)
- [04-Diagnostico-CIE10](modulos/04-Diagnostico-CIE10.md)
- [05-Prescripcion-Receta](modulos/05-Prescripcion-Receta.md)
- [06-Generador-PDF](modulos/06-Generador-PDF.md)
- [07-Configuracion](modulos/07-Configuracion.md)

**Arquitectura**
- [Stack-Tecnologico](arquitectura/Stack-Tecnologico.md)
- [Armazon-de-Pantalla](arquitectura/Armazon-de-Pantalla.md)
- [Modelo-de-Datos](arquitectura/Modelo-de-Datos.md)
- [Seguridad-OWASP](arquitectura/Seguridad-OWASP.md) — incluye secretos y la regla de Server Actions
- [Supabase-en-la-App](arquitectura/Supabase-en-la-App.md) — los tres clientes y el tipado de filas
- [Migraciones](arquitectura/Migraciones.md)
- [Entornos](arquitectura/Entornos.md) — dev y producción, `.env` / `.env.produccion` y la guarda
- [Verificacion-y-CI](arquitectura/Verificacion-y-CI.md)
- [Trampas-Recurrentes](arquitectura/Trampas-Recurrentes.md)

**Decisiones (ADR)**
- [ADR-001-sin-control-inventario](adr/ADR-001-sin-control-inventario.md)
- [ADR-002-numero-receta-global](adr/ADR-002-numero-receta-global.md)
- [ADR-003-menor-edad-18-anos](adr/ADR-003-menor-edad-18-anos.md)
- [ADR-004-plan-supabase-pro](adr/ADR-004-plan-supabase-pro.md)
- [ADR-005-limites-contenido-receta](adr/ADR-005-limites-contenido-receta.md)
- [ADR-006-campos-opcionales-migracion](adr/ADR-006-campos-opcionales-migracion.md)
- [ADR-007-espacio-historial](adr/ADR-007-espacio-historial.md)
- [ADR-008-validacion-cedula](adr/ADR-008-validacion-cedula.md)

**Integraciones**
- [Contrato-Sheet-Medicamentos](integraciones/Contrato-Sheet-Medicamentos.md)
- [Catalogo-CIE10](integraciones/Catalogo-CIE10.md)

**Diseño**
- [Sistema-de-Diseno](diseno/Sistema-de-Diseno.md)
- [Prompts-Stitch](diseno/Prompts-Stitch.md)

**Setup**
- [Herramientas-y-Cuentas](setup/Herramientas-y-Cuentas.md)

## Cómo se usa

1. Un cambio de regla de negocio se edita **aquí primero**, y después en el código.
2. `CLAUDE.md` en la raíz del repo es un resumen de una línea por regla que apunta a estas notas — así cualquier agente de código parte del mismo contexto. No se lee todo: solo la nota del módulo que se va a tocar.
3. `npm run verificar:enlaces` comprueba que ningún enlace entre notas, ni ninguna ruta `docs/` citada en el código, apunte a un archivo que no existe (con mayúsculas exactas, como en Linux).

## Rutas antiguas en las migraciones

Las migraciones de `supabase/migrations/` ya aplicadas no se editan, así que sus comentarios conservan rutas de una organización anterior de la documentación: `Arquitectura/` es hoy [`docs/arquitectura/`](arquitectura/), `Decisiones-ADR/` es [`docs/adr/`](adr/) y `Modulos/` es [`docs/modulos/`](modulos/).
