---
tags: [arquitectura, stack]
---

# Stack Tecnológico

El stack es **fijo**: no se proponen alternativas.

- **Frontend:** Next.js + TypeScript (estricto, `"strict": true`) + Tailwind CSS. Markup visual apoyado en Google Stitch (solo markup, nunca lógica de negocio).
- **Backend / Base de datos:** Supabase (PostgreSQL) — única fuente de verdad para pacientes, consultas, catálogo de medicamentos y CIE-10 una vez hecha la importación inicial. RLS obligatorio en todas las tablas de pacientes y consultas.
- **Importación de datos de referencia:** scripts puntuales (no conector en vivo), leen Google Sheets vía Service Account y cargan a Supabase.
- **Generación de PDF:** `pdf-lib` en el navegador, como overlay sobre las plantillas físicas existentes (plantilla bipartita). Las plantillas no se rediseñan.
- **Despliegue:** Vercel.

## Plan de Supabase
Ver [ADR-004-plan-supabase-pro](../adr/ADR-004-plan-supabase-pro.md) — desarrollar y probar en plan gratis. Subir a Pro antes de operar con pacientes reales está propuesto y pendiente de la decisión de la doctora. El respaldo local cifrado de `scripts/respaldo/` es obligatorio en cualquier plan; si se contrata Pro, sus backups son una capa extra.

## Ver también
- [Seguridad-OWASP](Seguridad-OWASP.md)
- [Modelo-de-Datos](Modelo-de-Datos.md)
- [Índice](../README.md)
