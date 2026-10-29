---
tags: [adr]
---

# ADR-004 — Plan Supabase Pro antes de producción

**Estado:** Propuesta. Pendiente de la decisión de la doctora (a octubre de 2026).

**Contexto:** El plan gratis de Supabase alcanza de sobra en capacidad (500 MB DB, 1 GB archivos) para un consultorio de una sola doctora — no es un problema de espacio.

**Decisión propuesta:** Desarrollar y probar en plan gratis. Subir a plan Pro ($25/mes) **antes de operar con pacientes reales**, porque el plan gratis pausa el proyecto tras 7 días sin uso (requiere reactivación manual) y no incluye respaldo automático de datos. El plan Pro elimina la pausa y agrega respaldo diario — importante al tratarse de historiales médicos reales.

**Respaldo local, en cualquier plan:** el respaldo cifrado de `scripts/respaldo/` es obligatorio con o sin Pro. Si se contrata Pro, sus backups diarios son una capa extra, no un reemplazo: viven dentro de Supabase, en la misma cuenta y el mismo proveedor que la base.

## Ver también
- [Stack-Tecnologico](../arquitectura/Stack-Tecnologico.md)
- [Índice](../README.md)
