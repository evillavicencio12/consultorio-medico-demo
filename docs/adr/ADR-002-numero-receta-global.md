---
tags: [adr]
---

# ADR-002 — Número de receta correlativo y global

**Estado:** Confirmada con la doctora.

**Contexto:** El número de receta podría numerarse por paciente o de forma global para todo el consultorio.

**Decisión:** Correlativo único y global para todas las recetas del sistema (1, 2, 3...), sin reiniciarse por paciente. Se implementa como columna autoincremental a nivel de todo el sistema.

**Consecuencias:** La tabla `consultas` lleva el número de receta como secuencia global, no como secuencia por paciente.

## Una consulta sin receta NO consume número (Fase 4B)

**Estado:** migrado el 22 de agosto de 2026, con `consultas` todavía en 0 filas.

### El hallazgo

`consultas.numero_receta` era `not null default nextval('numero_receta_seq')`.
Eso significa que el número se asignaba **al insertar la consulta**, no al
emitir la receta. Y una consulta puede perfectamente no llevar receta: lo asume
[03-Historial-Clinico](../modulos/03-Historial-Clinico.md) desde la Fase 3, cuya línea de tiempo esconde el botón
de receta cuando no hay medicamentos, porque "una revisión o un control puede no
llevarla".

Resultado: cada control sin receta se llevaba por delante un número que no iba a
aparecer en ningún papel. En el talonario de la doctora eso se ve como un salto
—se emite la #2 y la siguiente es la #5— que nadie sabría explicar tres meses
después.

Lo llamativo es que este ADR ya se había preocupado por exactamente ese
problema, por el otro extremo: la secuencia se declaró con `cache 1`
precisamente para que ninguna conexión reservara bloques de números y perdiera
los que no usara. El esquema abría por un lado el agujero que la secuencia
cerraba por el otro.

### Por qué se migró en vez de documentarlo como limitación

Fue una decisión de momento, no de gravedad:

- `consultas` tenía **0 filas**. La migración es un `alter column` y nada más.
- La doctora empieza a registrar consultas reales en poco tiempo. Después habría
  que decidir qué hacer con los números ya emitidos, **y un número de receta
  impreso en un papel que tiene un paciente no se puede reasignar**.

Era el momento más barato que iba a haber, y el más barato que va a haber nunca.

### Cómo queda

`20260822120000_numero_receta_opcional.sql` quita el `NOT NULL`. El contrato:

| | Al insertar | La secuencia |
|---|---|---|
| Consulta **con** medicamentos | se **omite** la columna | avanza (DEFAULT `nextval`) |
| Consulta **sin** medicamentos | `numero_receta = null` | no se toca |

Tres cosas que conviene tener presentes:

1. **El DEFAULT se conserva.** Es lo que mantiene la asignación atómica y del
   lado de Postgres, sin un viaje extra a pedir el número ni una función nueva.
   La contrapartida es que "omitir la columna" significa "quiero un número", y
   eso no se ve leyendo deprisa: por eso la decisión vive en **un solo sitio**
   —`lib/consultas/guardado.ts`, en `filaConsulta()`— y tiene prueba propia en
   `npm run test:receta`.
2. **El UNIQUE se queda y sigue sirviendo**: en SQL un UNIQUE no aplica a los
   NULL, así que admite tantas consultas sin receta como haga falta y sigue
   impidiendo dos recetas con el mismo número. Es la misma propiedad que en su
   día dejó entrar 82 pacientes duplicados sin cédula;
   aquí es justo lo que se busca.
3. **Los huecos no desaparecen del todo, y no pueden.** Una secuencia no
   retrocede: si un INSERT falla después de tomar el número, ese número se
   perdió. El guardado, que son dos inserciones (consulta y medicamentos), borra
   la consulta si la segunda falla — prefiere un hueco en el correlativo a un
   registro clínico a medias.

## Ver también
- [05-Prescripcion-Receta](../modulos/05-Prescripcion-Receta.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [Índice](../README.md)
