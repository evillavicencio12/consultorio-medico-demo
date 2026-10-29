-- ============================================================================
-- El CHECK de menores (ADR-003) cuenta la edad en AÑOS ENTEROS y con la fecha
-- de ECUADOR. Corrige dos errores independientes de la versión anterior:
--
--   CHECK (age(fecha_nacimiento::timestamptz) >= '18 years'::interval OR ...)
--
-- ERROR 1 — `age() >= interval` da 18 años UN DÍA ANTES.
-- Postgres compara intervalos normalizando 1 mes = 30 días. La víspera del
-- cumpleaños, `age()` puede devolver `17 years 11 mons 30 days`, que comparado
-- contra `18 years` resulta IGUAL (17·360 + 11·30 + 30 = 18·360), así que `>=`
-- era verdadero y la base aceptaba sin acompañante a un menor que cumplía 18 al
-- día siguiente. No era raro: en un barrido de las 366 fechas de nacimiento de
-- 2008 (la víspera, el día y el día después de los 18; 1.098 pares) la regla de
-- intervalo difería de la de calendario en 217, todos la víspera. Ocurría a
-- cualquier hora. Se descubrió el 15 de octubre de 2026 porque la primera
-- versión de esta migración, que solo arreglaba el error 2, dejó entrar en dev
-- un INSERT directo que debía rechazar.
--
-- ERROR 2 — "hoy" era el de UTC.
-- `age()` con un solo argumento mide contra la fecha actual del servidor, que
-- está en UTC. Entre las 19:00 y la medianoche de Ecuador (UTC-5) en UTC ya es
-- el día siguiente: otro día de adelanto, ese sí solo de noche.
--
-- LA REGLA NUEVA cuenta años enteros —`extract(year from age(...)) >= 18`—,
-- igual que lib/edad.ts (resta años y quita uno si todavía no llegó el mes, o
-- el día dentro del mes), y toma "hoy" de Ecuador:
-- `(now() at time zone 'America/Guayaquil')::date`. Coincide con lib/edad.ts en
-- los 1.098 pares del barrido, incluido el nacido un 29 de febrero (cumple 18
-- el 1 de marzo en año no bisiesto, en los dos lados). La prueba que lo repite
-- es scripts/verificar-regla-menor-edad.mts (npm run test:menor-edad).
--
-- Los `::timestamp` (sin zona) son a propósito: con dos `date`, Postgres elige
-- `age(timestamptz, timestamptz)`, y convertir una fecha a timestamptz depende
-- de la zona horaria de la SESIÓN. Con timestamp no depende de nada.
--
-- La regla de negocio no cambia: 18 años cumplidos, o acompañante con nombre y
-- documento. Con `fecha_nacimiento` NULL, `age()` da NULL, el CHECK no se viola,
-- igual que antes y que `esMenorDeEdad` (ADR-006).
--
-- CÓMO. DROP + ADD del mismo nombre en UN solo ALTER TABLE: es atómico, toma un
-- solo bloqueo y, sin NOT VALID, valida todas las filas existentes. Si alguna
-- no cumple, la migración entera falla y no cambia nada. No es un trigger: un
-- CHECK es declarativo, lo ve cualquiera en el esquema y no se puede saltar.
--
-- `now()` no es inmutable, como tampoco lo era el `age()` de un argumento que
-- reemplaza. Vale el razonamiento de 20260820120100_pacientes.sql: con el
-- tiempo la regla solo se vuelve más permisiva (un menor cumple 18, nunca al
-- revés), así que no puede invalidar filas ya guardadas.
-- ============================================================================

alter table public.pacientes
  drop constraint acompanante_obligatorio_si_menor,
  add constraint acompanante_obligatorio_si_menor check (
    (extract(year from age(((now() at time zone 'America/Guayaquil'::text))::date::timestamp,
                           fecha_nacimiento::timestamp)) >= 18)
    or ((nombre_acompanante is not null) and (documento_acompanante is not null))
  );
