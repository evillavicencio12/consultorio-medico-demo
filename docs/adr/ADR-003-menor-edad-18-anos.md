---
tags: [adr]
---

# ADR-003 — Edad mínima para acompañante obligatorio

**Estado:** Confirmada con la doctora.

**Decisión:** Menor de 18 años → nombre y cédula del acompañante son obligatorios. Correo y teléfono (paciente y acompañante) siguen opcionales.

**Decisión relacionada:** Menor de 1 año → la edad se muestra en meses en vez de años.

## Cuándo se cumplen los 18: a la medianoche de Ecuador

Se cumplen 18 el día del cumpleaños, desde las 00:00 de Ecuador. Quien nace un 29 de febrero los cumple el 1 de marzo en año no bisiesto. La app (`lib/edad.ts`) y el CHECK `acompanante_obligatorio_si_menor` de la base aplican exactamente esa regla. Lo comprueba `npm run test:menor-edad`, que compara los dos en 1.098 pares de borde con dos relojes.

Resuelto el 15–16 de octubre de 2026 con la migración `20261015120000_menor_edad_hora_ecuador`. El CHECK anterior tenía dos errores, los dos a favor de dejar entrar a un menor sin acompañante la víspera de su cumpleaños:

1. `age() >= '18 years'`: Postgres compara intervalos con 1 mes = 30 días, y la víspera `17 años 11 meses 30 días` valía lo mismo que 18 años. Ocurría a cualquier hora, en 217 de 366 fechas de nacimiento.
2. El "hoy" era el de UTC: entre las 19:00 y la medianoche de Ecuador ya era el día siguiente.

En producción ninguna fila había entrado gracias a esos errores. Para la app queda una condición: el "hoy" que se le pasa a `esMenorDeEdad` tiene que salir de `hoyEnEcuador()`, nunca de la zona del proceso ([Trampas-Recurrentes](../arquitectura/Trampas-Recurrentes.md)).

## Ver también
- [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md)
- [Índice](../README.md)
