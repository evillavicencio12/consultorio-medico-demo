---
tags: [setup]
---

# Herramientas y cuentas previas al desarrollo

## Cuentas a crear
- GitHub — código y despliegue automático.
- Vercel — publicación, conectado directo con GitHub.
- Supabase — base de datos y login de la doctora.
- Google Cloud — Service Account para leer los Sheets de importación.
- Google Stitch — generación del diseño de pantallas.

## Programas a instalar
- Node.js (LTS)
- Git
- Visual Studio Code (extensiones Tailwind CSS IntelliSense, ESLint)

## Conocimientos mínimos recomendados
- Uso de terminal: `npm install`, `npm run dev`.
- Git básico: commit, push, pull.
- TypeScript/JavaScript nivel básico.
- Conceptos de React: componente, estado.
- SQL básico (Supabase usa PostgreSQL por debajo).
- Qué es una variable de entorno (`.env`) y por qué nunca se sube al repo.

## Notas de flujo de trabajo
- Las notas de `docs/` son la fuente de la verdad para reglas de negocio, ADRs y el contrato de los Sheets — cualquier agente de IA que colabore en el código debe partir de aquí.
- Si se usa una herramienta de memoria persistente para agentes de codificación, preferir una opción 100% local frente a una que envíe telemetría a terceros, dado que el proyecto maneja datos médicos sensibles.

## Ver también
- [Índice](../README.md)
