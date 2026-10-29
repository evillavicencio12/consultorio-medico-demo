-- ============================================================================
-- Agrega `consultas.transfusionales`, la única de las 6 divergencias entre
-- lib/pdf/types.ts y la base en la que el equivocado era el ESQUEMA.
--
-- Por qué cede la base y no el código:
--   * La plantilla física del historial trae impreso el renglón
--     "Transfusionales: ______" — es un campo del formulario en papel que el
--     sistema reemplaza, no un invento del código.
--   * Modulos/03-Historial-Clinico.md lo lista dentro de los antecedentes
--     personales patológicos, junto a alergias, patologías y quirúrgicos.
--   * lib/pdf/historial.ts ya lo dibuja (`L("Transfusionales: ", ...)`).
--   * Sus tres hermanos (`alergias`, `patologias`, `quirurgicos`) sí existen
--     en la tabla: la columna se quedó fuera del script inicial por descuido,
--     no por decisión.
--
-- Se declara `text` NULL-able igual que sus hermanos: es un antecedente que
-- muchas veces no aplica, y exigirlo obligaría a escribir "Ninguno" siempre.
--
-- Nota de posición: la columna queda al final de la tabla (posición 20), que
-- es donde Postgres pone toda columna agregada. Es lo mismo que ocurre al
-- aplicar esta migración sobre una base reconstruida desde cero, así que
-- producción y una base nueva siguen siendo idénticas.
--
-- Las otras 5 divergencias se resolvieron del lado del código — ver
-- Arquitectura/Modelo-de-Datos.md.
-- ============================================================================

alter table public.consultas
  add column transfusionales text;
