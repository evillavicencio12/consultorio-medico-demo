-- supabase/seed.sql
--
-- Datos de ejemplo para la demo: 20 pacientes, consultas y recetas, todos
-- FICTICIOS. Las cédulas tienen un patrón evidente (<provincia>10000<nn>) y
-- un dígito verificador válido calculado con el algoritmo; no corresponden a
-- registros reales. Los teléfonos, correos (example.com) y direcciones también
-- son inventados.
--
-- Requiere las migraciones de supabase/migrations/. Trae un mínimo de CIE-10 y
-- de medicamentos para no depender de los importadores; si los catálogos
-- completos ya están cargados, esas filas no se tocan (on conflict do nothing).
-- Las consultas con medicamentos toman su número de receta de la secuencia
-- (ADR-002); las que no llevan receta van con numero_receta = null.
-- Volver a correrlo no duplica filas, pero sí avanza la secuencia: nextval
-- se evalúa antes de que on conflict descarte la fila.

begin;

insert into public.cie10_catalogo (codigo, descripcion) values
  ('I10', 'Hipertensión esencial (primaria)'),
  ('J00', 'Rinofaringitis aguda [resfriado común]'),
  ('J029', 'Faringitis aguda, no especificada'),
  ('J069', 'Infección aguda de las vías respiratorias superiores, no especificada'),
  ('K297', 'Gastritis, no especificada'),
  ('N390', 'Infección de vías urinarias, sitio no especificado'),
  ('E119', 'Diabetes mellitus no insulinodependiente, sin mención de complicación'),
  ('M545', 'Lumbago no especificado'),
  ('R51', 'Cefalea'),
  ('L309', 'Dermatitis, no especificada'),
  ('H109', 'Conjuntivitis, no especificada'),
  ('B829', 'Parasitosis intestinal, sin otra especificación')
on conflict (codigo) do nothing;

insert into public.medicamentos_catalogo (nombre_generico, nombre_comercial) values
  ('paracetamol 500 mg', 'PARACETAMOL DEMO 500'),
  ('ibuprofeno 400 mg', 'IBUPROFENO DEMO 400'),
  ('amoxicilina 500 mg', 'AMOXICILINA DEMO 500'),
  ('losartán 50 mg', 'LOSARTAN DEMO 50'),
  ('metformina 850 mg', 'METFORMINA DEMO 850'),
  ('omeprazol 20 mg', 'OMEPRAZOL DEMO 20'),
  ('loratadina 10 mg', 'LORATADINA DEMO 10'),
  ('albendazol 400 mg', 'ALBENDAZOL DEMO 400'),
  ('nitrofurantoína 100 mg', 'NITROFURANTOINA DEMO 100'),
  ('paracetamol 120 mg/5 ml', 'PARACETAMOL DEMO JARABE')
on conflict (nombre_comercial) do nothing;

insert into public.pacientes (id, nombre_completo, tipo_documento, documento, fecha_nacimiento, sexo, telefono, correo,
  domicilio, ocupacion, estado_civil, antecedentes_heredofamiliares, alergia_actual,
  nombre_acompanante, tipo_documento_acompanante, documento_acompanante, telefono_acompanante) values
  ('00000000-0000-4000-8000-000000000001', 'EJEMPLO DEMO ANA LUCÍA', 'cedula', '0910000017', '1988-03-14', 'F', '0990000101', 'ana.ejemplo@example.com', 'Calle Ficticia 101, Ciudad Ejemplo', 'Docente', 'Casada', 'Madre con hipertensión arterial', null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000002', 'FICTICIO PRUEBA CARLOS ANDRÉS', 'cedula', '1710000025', '1975-07-02', 'M', '0990000102', 'carlos.ficticio@example.com', 'Av. de Prueba 202, Ciudad Ejemplo', 'Comerciante', 'Casado', 'Padre con diabetes tipo 2', null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000003', 'EJEMPLO DEMO MARÍA JOSÉ', 'cedula', '0110000031', '1992-11-20', 'F', '0990000103', null, 'Calle Ficticia 303, Ciudad Ejemplo', 'Contadora', 'Soltera', null, 'Penicilina', null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000004', 'FICTICIO DEMO LUIS ALBERTO', 'cedula', '1310000045', '1960-01-30', 'M', '0990000104', null, 'Barrio Demo, Mz 4, Ciudad Ejemplo', 'Jubilado', 'Casado', 'Hermanos con hipertensión', null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000005', 'EJEMPLO PRUEBA ROSA ELENA', 'cedula', '1110000054', '1955-05-05', 'F', '0990000105', null, 'Calle Ficticia 505, Ciudad Ejemplo', 'Ama de casa', 'Viuda', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000006', 'FICTICIO EJEMPLO JUAN PABLO', 'cedula', '0710000068', '2001-09-12', 'M', '0990000106', 'juan.ficticio@example.com', 'Av. de Prueba 606, Ciudad Ejemplo', 'Estudiante', 'Soltero', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000007', 'EJEMPLO DEMO SOFÍA', 'cedula', '0910000074', '2016-04-18', 'F', null, null, 'Calle Ficticia 101, Ciudad Ejemplo', 'Estudiante', null, 'Madre con hipertensión arterial', null, 'EJEMPLO DEMO ANA LUCÍA', 'cedula', '0910000017', '0990000101'),
  ('00000000-0000-4000-8000-000000000008', 'FICTICIO DEMO MATEO', 'cedula', null, '2019-08-03', 'M', null, null, 'Av. de Prueba 202, Ciudad Ejemplo', null, null, null, null, 'FICTICIO PRUEBA CARLOS ANDRÉS', 'cedula', '1710000025', '0990000102'),
  ('00000000-0000-4000-8000-000000000009', 'EJEMPLO DEMO VALENTINA', 'cedula', '0910000090', '2010-12-01', 'F', null, null, 'Calle Ficticia 505, Ciudad Ejemplo', 'Estudiante', null, null, 'Ibuprofeno', 'EJEMPLO PRUEBA ROSA ELENA', 'cedula', '1110000054', '0990000105'),
  ('00000000-0000-4000-8000-000000000010', 'FICTICIO VISITANTE JOHN', 'pasaporte', 'DEMO12345', '1985-02-14', 'M', '0990000110', 'john.visitante@example.com', 'Hotel Ejemplo, Ciudad Ejemplo', 'Ingeniero', 'Casado', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000011', 'EJEMPLO DEMO CAMILA', 'otro', 'CR-0001-DEMO', '1999-06-21', 'F', '0990000111', null, 'Calle Ficticia 111, Ciudad Ejemplo', 'Diseñadora', 'Soltera', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000012', 'FICTICIO SIN DOCUMENTO PEDRO', 'cedula', null, '1970-10-10', 'M', null, null, null, 'Agricultor', 'Unión libre', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000013', 'EJEMPLO SIN FECHA LUCÍA', 'cedula', null, null, 'F', '0990000113', null, null, null, null, null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000014', 'FICTICIO SIN SEXO ALEX', 'cedula', null, '1995-03-09', null, null, null, null, null, null, null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000015', 'EJEMPLO DEMO HUMBERTO', 'cedula', '1710000157', '1938-03-03', 'M', '0990000115', null, 'Barrio Demo, Mz 15, Ciudad Ejemplo', 'Jubilado', 'Viudo', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000016', 'FICTICIO PRUEBA GABRIELA', 'cedula', '0110000163', '1983-08-25', 'F', '0990000116', 'gabriela.ficticio@example.com', 'Calle Ficticia 616, Ciudad Ejemplo', 'Enfermera', 'Divorciada', 'Abuela con cáncer de mama', 'Sulfas', null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000017', 'EJEMPLO DEMO ÑANDÚ JOSÉ ÁNGEL', 'cedula', '1010000170', '1987-12-24', 'M', '0990000117', null, 'Calle Ficticia 717, Ciudad Ejemplo', 'Chofer', 'Casado', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000018', 'FICTICIO DEMO PATRICIA', 'cedula', '0910000181', '1979-12-12', 'F', '0990000118', null, 'Av. de Prueba 818, Ciudad Ejemplo', 'Costurera', 'Casada', 'Madre y tía con diabetes tipo 2', null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000019', 'EJEMPLO PRUEBA ANDRÉS', 'cedula', '1710000199', '1990-04-04', 'M', '0990000119', 'andres.ejemplo@example.com', 'Calle Ficticia 919, Ciudad Ejemplo', 'Electricista', 'Soltero', null, null, null, 'cedula', null, null),
  ('00000000-0000-4000-8000-000000000020', 'FICTICIO EJEMPLO DANIELA', 'cedula', '1310000201', '2005-01-15', 'F', '0990000120', null, 'Av. de Prueba 1020, Ciudad Ejemplo', 'Estudiante', 'Soltera', null, null, null, 'cedula', null, null)
on conflict (id) do nothing;

-- Consultas con receta: sin la columna numero_receta, que toma el DEFAULT
-- nextval('numero_receta_seq'). En orden de fecha, para que el correlativo
-- siga el orden en que se emitieron.
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', '2026-09-02', 'Dolor de garganta y fiebre de dos días.', 'Ninguna conocida', null, null, null, '110/70', 88, 18, 38.2, 62, 'Faringitis aguda', 'J029', 'Analgésico y antibiótico por 7 días.', 'Fiebre mayor a 39 °C, dificultad para tragar.', 'Abundantes líquidos, reposo relativo.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000004', '2026-09-05', 'Control de presión arterial.', null, 'Hipertensión arterial', 'Colecistectomía (2015)', null, '150/95', 76, 16, 36.5, 81, 'Hipertensión esencial', 'I10', 'Antihipertensivo diario y control en un mes.', 'Dolor de cabeza intenso, visión borrosa, dolor en el pecho.', 'Dieta baja en sal, caminar 30 minutos al día.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000003', '00000000-0000-4000-8000-000000000007', '2026-09-10', 'Tos y moco nasal desde hace tres días.', null, null, null, null, '100/60', 96, 22, 37.4, 34, 'Resfriado común', 'J00', 'Antipirético en jarabe según peso.', 'Respiración rápida, fiebre persistente.', 'Lavados nasales con suero fisiológico.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000004', '00000000-0000-4000-8000-000000000002', '2026-09-15', 'Ardor en la boca del estómago después de comer.', null, null, null, null, '120/80', 72, 16, 36.6, 88, 'Gastritis', 'K297', 'Inhibidor de bomba por 14 días.', 'Vómito con sangre, heces negras.', 'Evitar café, picantes y comidas abundantes.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000005', '00000000-0000-4000-8000-000000000018', '2026-09-18', 'Control de glucosa.', null, 'Diabetes mellitus tipo 2', null, null, '125/80', 78, 16, 36.4, 74, 'Diabetes mellitus tipo 2 controlada', 'E119', 'Continuar metformina.', 'Sed intensa, orina abundante, mareo.', 'Plan de alimentación y actividad física.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000007', '00000000-0000-4000-8000-000000000016', '2026-10-07', 'Ardor al orinar y ganas frecuentes de orinar.', 'Sulfas', null, null, null, '115/75', 84, 18, 37.2, 66, 'Infección de vías urinarias', 'N390', 'Antibiótico por 5 días.', 'Fiebre, dolor en la espalda baja.', 'Tomar abundante agua.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000008', '00000000-0000-4000-8000-000000000019', '2026-10-09', 'Dolor en la parte baja de la espalda al levantar peso.', null, null, null, null, '120/80', 70, 16, 36.6, 78, 'Lumbago mecánico', 'M545', 'Antiinflamatorio por 5 días.', 'Dolor que baja por la pierna, pérdida de fuerza.', 'Calor local y pausas activas en el trabajo.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000009', '00000000-0000-4000-8000-000000000009', '2026-10-12', 'Dolor de barriga y comezón anal.', 'Ibuprofeno', null, null, null, '100/65', 90, 20, 36.8, 45, 'Parasitosis intestinal', 'B829', 'Antiparasitario en dosis única.', null, 'Lavado de manos antes de comer.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000011', '00000000-0000-4000-8000-000000000003', '2026-10-16', 'Lesiones con picazón en los brazos.', 'Penicilina', null, null, null, '112/72', 76, 16, 36.6, 58, 'Dermatitis', 'L309', 'Antihistamínico por 7 días.', null, 'Evitar jabones perfumados.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000012', '00000000-0000-4000-8000-000000000015', '2026-10-20', 'Dolor de cabeza leve, control general.', null, 'Hipertensión arterial', null, null, '135/80', 68, 16, 36.3, 70, 'Cefalea tensional', 'R51', 'Analgésico si hay dolor.', 'Dolor de cabeza súbito e intenso.', 'Dormir bien y mantener hidratación.')
on conflict (id) do nothing;
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas) values
  ('00000000-0000-4000-9000-000000000014', '00000000-0000-4000-8000-000000000020', '2026-10-24', 'Congestión nasal y malestar general.', null, null, null, null, '108/70', 82, 18, 37.6, 55, 'Infección respiratoria alta', 'J069', 'Sintomático por 3 días.', 'Dificultad para respirar.', 'Reposo y líquidos.')
on conflict (id) do nothing;

-- Consultas sin receta (controles): numero_receta = null, no gastan un número.
insert into public.consultas (id, paciente_id, fecha, motivo_consulta, alergias, patologias, quirurgicos, transfusionales, pa, fc, fr, temperatura, peso, impresion_diagnostica, cie10_codigo, tratamiento, signos_alarma, recomendaciones_no_farmacologicas, numero_receta) values
  ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-8000-000000000004', '2026-10-05', 'Control de presión: refiere buena adherencia.', null, 'Hipertensión arterial', 'Colecistectomía (2015)', null, '130/85', 72, 16, 36.5, 80, 'Hipertensión esencial en control', 'I10', 'Continuar el mismo esquema.', null, 'Mantener dieta baja en sal.', null),
  ('00000000-0000-4000-9000-000000000010', '00000000-0000-4000-8000-000000000006', '2026-10-14', 'Ojo rojo con lagaña desde ayer.', null, null, null, null, '118/76', 74, 16, 36.5, 70, 'Conjuntivitis', 'H109', 'Limpieza ocular y control.', 'Dolor intenso o visión borrosa.', 'No compartir toallas.', null),
  ('00000000-0000-4000-9000-000000000013', '00000000-0000-4000-8000-000000000001', '2026-10-22', 'Control después de la faringitis: sin molestias.', 'Ninguna conocida', null, null, null, '110/70', 76, 16, 36.5, 62, 'Faringitis resuelta', 'J029', 'Alta.', null, null, null)
on conflict (id) do nothing;

insert into public.receta_medicamentos (consulta_id, nombre_generico, nombre_comercial, presentacion, cantidad, dosis, via_administracion, frecuencia, duracion)
select v.consulta_id::uuid, v.nombre_generico, v.nombre_comercial, v.presentacion, v.cantidad, v.dosis, v.via_administracion, v.frecuencia, v.duracion
from (values
  ('00000000-0000-4000-9000-000000000001', 'amoxicilina 500 mg', 'AMOXICILINA DEMO 500', 'capsula', 21, '1 cápsula', 'oral', 'cada 8 horas', '7 días'),
  ('00000000-0000-4000-9000-000000000001', 'paracetamol 500 mg', 'PARACETAMOL DEMO 500', 'tableta', 10, '1 tableta', 'oral', 'cada 8 horas si hay fiebre', '3 días'),
  ('00000000-0000-4000-9000-000000000002', 'losartán 50 mg', 'LOSARTAN DEMO 50', 'tableta', 30, '1 tableta', 'oral', 'cada 24 horas', '30 días'),
  ('00000000-0000-4000-9000-000000000003', 'paracetamol 120 mg/5 ml', 'PARACETAMOL DEMO JARABE', 'solucion_oral', 1, '7 ml', 'oral', 'cada 6 horas si hay fiebre', '3 días'),
  ('00000000-0000-4000-9000-000000000004', 'omeprazol 20 mg', 'OMEPRAZOL DEMO 20', 'capsula', 14, '1 cápsula en ayunas', 'oral', 'cada 24 horas', '14 días'),
  ('00000000-0000-4000-9000-000000000005', 'metformina 850 mg', 'METFORMINA DEMO 850', 'tableta', 60, '1 tableta', 'oral', 'cada 12 horas', '30 días'),
  ('00000000-0000-4000-9000-000000000007', 'nitrofurantoína 100 mg', 'NITROFURANTOINA DEMO 100', 'capsula', 10, '1 cápsula', 'oral', 'cada 12 horas', '5 días'),
  ('00000000-0000-4000-9000-000000000008', 'ibuprofeno 400 mg', 'IBUPROFENO DEMO 400', 'tableta', 15, '1 tableta con comida', 'oral', 'cada 8 horas', '5 días'),
  ('00000000-0000-4000-9000-000000000009', 'albendazol 400 mg', 'ALBENDAZOL DEMO 400', 'tableta', 1, '1 tableta', 'oral', 'dosis única', '1 día'),
  ('00000000-0000-4000-9000-000000000011', 'loratadina 10 mg', 'LORATADINA DEMO 10', 'tableta', 7, '1 tableta', 'oral', 'cada 24 horas', '7 días'),
  ('00000000-0000-4000-9000-000000000012', 'paracetamol 500 mg', 'PARACETAMOL DEMO 500', 'tableta', 10, '1 tableta', 'oral', 'cada 8 horas si hay dolor', '3 días'),
  ('00000000-0000-4000-9000-000000000014', 'paracetamol 500 mg', 'PARACETAMOL DEMO 500', 'tableta', 9, '1 tableta', 'oral', 'cada 8 horas', '3 días'),
  ('00000000-0000-4000-9000-000000000014', 'loratadina 10 mg', 'LORATADINA DEMO 10', 'tableta', 5, '1 tableta', 'oral', 'cada 24 horas', '5 días')
) as v(consulta_id, nombre_generico, nombre_comercial, presentacion, cantidad, dosis, via_administracion, frecuencia, duracion)
where not exists (select 1 from public.receta_medicamentos r where r.consulta_id = v.consulta_id::uuid);

commit;
