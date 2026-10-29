-- ============================================================================
-- El DEFAULT de `consultas.fecha` es el día de ECUADOR, no el de UTC.
--
-- QUÉ PASABA. `fecha date not null default CURRENT_DATE`. `CURRENT_DATE` es la
-- fecha en la zona de la SESIÓN, y en Supabase la sesión está en UTC: entre las
-- 19:00 y la medianoche de Ecuador (UTC-5) ya es el día siguiente. Una consulta
-- insertada sin `fecha` a esa hora quedaba con la fecha de MAÑANA, y esa fecha
-- es la que se imprime en el historial y en la receta.
--
-- Hoy el DEFAULT no se usa: lib/consultas/guardado.ts siempre manda `fecha`
-- explícita, calculada con `hoyISOEnEcuador()`. Se corrige igual porque es el
-- último "hoy" en UTC del esquema y la red de cualquier INSERT que la omita.
-- Es el mismo error 2 que corrigió 20261015120000_menor_edad_hora_ecuador.sql
-- en el CHECK de menores; ver docs/arquitectura/Trampas-Recurrentes.md.
--
-- `now() at time zone 'America/Guayaquil'` da la hora local de Ecuador como
-- timestamp sin zona; `::date` se queda con su día. No depende de la zona de la
-- sesión: el nombre de la zona va escrito en la expresión.
--
-- Cambiar un DEFAULT no toca filas existentes ni toma un bloqueo largo: solo
-- cambia lo que se aplica a los INSERT futuros.
-- ============================================================================

alter table public.consultas
  alter column fecha set default ((now() at time zone 'America/Guayaquil'::text))::date;
