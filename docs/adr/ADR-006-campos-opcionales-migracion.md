---
tags: [adr]
---

# ADR-006 — Campos opcionales por migración histórica (cédula, fecha_nacimiento, sexo)

**Estado:** Confirmada.

**Contexto:** Al importar los ~200 pacientes históricos del Google Sheet de la doctora (RF-02), se encontraron datos faltantes que el esquema original no permitía: 93 pacientes sin cédula, 29 sin fecha de nacimiento, y el campo "sexo" no existe en absoluto en el Sheet de origen para ningún paciente. Exigirlos completos habría bloqueado la importación de buena parte (o la totalidad, en el caso de sexo) de la base histórica.

**Decisión:** Se relajó la restricción `NOT NULL` en Supabase para `cedula` (hoy `documento`, ver [ADR-008-validacion-cedula](ADR-008-validacion-cedula.md)), `fecha_nacimiento` y `sexo` en la tabla `pacientes`, exclusivamente para permitir la importación histórica. Los pacientes se importan igual, con esos campos en blanco cuando falten, y se completan más adelante cuando cada paciente vuelva a consulta.

**Esto NO relaja el formulario de "Registrar paciente nuevo" (RF-03).** Cualquier paciente que se registre desde el sistema de aquí en adelante debe seguir pidiendo cédula, fecha de nacimiento y sexo como obligatorios en el formulario — la base de datos los permite vacíos solo por compatibilidad con la carga histórica, no como comportamiento normal.

**Consecuencias:**
- El formulario de "Registrar Paciente" debe validar estos 3 campos como obligatorios en la UI, aunque la base de datos ya no los exija a nivel de esquema.
- Los módulos de PDF (historial y receta) deben manejar el caso de que vengan vacíos en pacientes migrados — ver pendiente en [06-Generador-PDF](../modulos/06-Generador-PDF.md).
- La regla de "menor de edad requiere acompañante" (ADR-003) no puede aplicarse a pacientes sin fecha de nacimiento — limitación aceptada, no un bug.

## Ver también
- [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md)
- [ADR-003-menor-edad-18-anos](ADR-003-menor-edad-18-anos.md)
- [06-Generador-PDF](../modulos/06-Generador-PDF.md)
- [Índice](../README.md)