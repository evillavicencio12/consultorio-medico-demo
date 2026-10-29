-- ============================================================================
-- Documentos de identidad que no son la cédula ecuatoriana.
--
-- MOTIVO. La doctora confirmó que atiende pacientes extranjeros, que traen
-- pasaporte. Hasta esta migración el formulario de alta no los admitía: la
-- validación del dígito verificador (ADR-008) rechazaba cualquier cosa que no
-- fuera una cédula ecuatoriana. Frente al paciente, sin poder registrarlo, la
-- salida natural es **inventar un número** para salir del paso — y ese dato
-- malo se queda para siempre. Se resuelve ahora, con 164 pacientes y cero
-- consultas registradas, porque es el momento más barato que va a existir.
--
-- NOTA SOBRE "ESTADO CONSOLIDADO". Las seis migraciones anteriores describen el
-- esquema como debe quedar, no la historia. Esta no puede: las anteriores ya
-- están aplicadas en producción y CLAUDE.md prohíbe editarlas. Así que es un
-- delta, igual que 20260820130000_consultas_transfusionales.sql. Quien
-- reconstruya la base creará `cedula` y acto seguido la renombrará; es un paso
-- de más, pero el alternativo sería reescribir una migración ya aplicada.
--
-- Permisos (RLS + GRANT): no cambian. Las políticas de
-- 20260820120400_rls_y_grants.sql son por tabla, no por columna, y los GRANT
-- de tabla cubren las columnas nuevas automáticamente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La columna deja de llamarse como uno solo de los documentos que guarda
-- ---------------------------------------------------------------------------
-- Se renombra en vez de dejarla como `cedula`, y es la decisión de fondo de
-- esta migración. Una columna llamada `cedula` que contiene un pasaporte es
-- una mentira silenciosa, y este proyecto ya tiene un historial de lo que
-- cuestan: la edad calculada desde `new Date(null)` que imprimía "56 años" en
-- un historial clínico, o el comentario que prometía que `lib/pdf/types.ts`
-- era el espejo de las filas cuando no lo era. Con `documento` +
-- `tipo_documento` juntos, la pareja se explica sola en cualquier `select *` y
-- nadie vuelve a suponer "diez dígitos".
--
-- Se hace AHORA y no después porque el coste solo sube: 164 filas, cero
-- consultas, una sola usuaria y **nada desplegado todavía** (no hay proyecto en
-- Vercel), así que no existe la ventana en la que la aplicación en producción
-- lee una columna que ya no está. Ese es justo el riesgo que haría inviable
-- este renombrado dentro de seis meses.
--
-- El renombrado arrastra solo: índices, constraints y la definición del CHECK
-- `acompanante_obligatorio_si_menor` siguen apuntando a la columna correcta sin
-- tocarlos. Lo que NO se actualiza solo son sus NOMBRES, que se arreglan abajo.
alter table public.pacientes rename column cedula             to documento;
alter table public.pacientes rename column cedula_acompanante to documento_acompanante;

alter index public.idx_pacientes_cedula rename to idx_pacientes_documento;

-- ---------------------------------------------------------------------------
-- 2. Qué documento es
-- ---------------------------------------------------------------------------
-- `not null default 'cedula'`, y las dos partes tienen motivo:
--
--   * NOT NULL — sin él aparecería un cuarto estado, "documento sin tipo", que
--     ni la validación ni la pantalla sabrían interpretar. Con NOT NULL, cada
--     fila responde siempre a "¿qué tipo de documento se espera de esta
--     persona?", incluso las 83 que todavía no tienen ninguno: ahí el tipo no
--     afirma nada sobre el paciente, solo dice qué se le va a pedir.
--
--   * DEFAULT 'cedula' — los 164 migrados del Sheet son todos ecuatorianos con
--     cédula, así que el relleno correcto es ese y no hace falta un UPDATE
--     aparte. Como default permanente, además, es la red de un script que se
--     olvide de la columna: el valor que deja es el que acierta en la enorme
--     mayoría de los casos, y si se equivoca lo caza la validación del dígito
--     verificador en cuanto alguien edite la ficha.
--
-- El acompañante lleva su propio tipo. No es simetría decorativa: el
-- acompañante de un menor extranjero es, casi siempre, también extranjero.
-- Resolver solo el documento del paciente habría dejado sin registrar
-- exactamente al caso que motivó esta migración.
alter table public.pacientes
  add column tipo_documento             text not null default 'cedula',
  add column tipo_documento_acompanante text not null default 'cedula';

-- Lista cerrada, como los dropdowns de `receta_medicamentos`: agregar una
-- opción en la UI exige una migración nueva, no un valor suelto.
--
-- `otro` existe a propósito y no es un cajón de sastre perezoso: hay documentos
-- que no son ni cédula ecuatoriana ni pasaporte (cédulas extranjeras —las
-- colombianas y venezolanas son frecuentes aquí—, documentos de refugiado,
-- carné consular). Sin esa opción, la doctora volvería a hacer lo que esta
-- migración existe para evitar: meter el número donde no va.
alter table public.pacientes
  add constraint pacientes_tipo_documento_check
    check (tipo_documento = any (array['cedula'::text, 'pasaporte'::text, 'otro'::text])),
  add constraint pacientes_tipo_documento_acompanante_check
    check (tipo_documento_acompanante = any (array['cedula'::text, 'pasaporte'::text, 'otro'::text]));

-- ---------------------------------------------------------------------------
-- 3. El UNIQUE pasa a ser del PAR (tipo, número)
-- ---------------------------------------------------------------------------
-- `unique (cedula)` daba por hecho que un número identifica a una persona. Con
-- documentos de varios países deja de ser cierto: nada impide que un pasaporte
-- extranjero coincida carácter por carácter con la cédula de un paciente
-- ecuatoriano. Improbable, pero el efecto sería que la base rechaza como
-- "duplicado" a dos personas distintas — y la doctora, sin poder registrar al
-- segundo, acabaría registrándolo sin documento. Otra vez el mismo final.
--
-- Lo que identifica a una persona es el par: el pasaporte AB123456 y la cédula
-- 0912345675 son documentos distintos aunque el número se repita.
--
-- Lo que este UNIQUE NO detecta, y conviene saberlo: la misma persona cargada
-- dos veces, una con cédula y otra con pasaporte. Nada en la base puede verlo.
-- Contra eso trabajan la búsqueda —que desde ahora encuentra documentos de
-- cualquier tipo, ver lib/pacientes/busqueda.ts— y el aviso de duplicado del
-- formulario.
--
-- Sigue valiendo que UNIQUE no restringe los NULL: los 83 pacientes sin
-- documento conviven sin chocar, igual que antes.
alter table public.pacientes drop constraint pacientes_cedula_key;

alter table public.pacientes
  add constraint pacientes_documento_key unique (tipo_documento, documento);

-- `idx_pacientes_documento` deja de ser deuda técnica. Mientras el UNIQUE era
-- sobre `cedula` a secas, su índice ya servía para buscar por número y este
-- otro se solapaba con él (ver la nota en 20260820120100_pacientes.sql). Con el
-- UNIQUE compuesto, el índice del constraint empieza por `tipo_documento`, así
-- que no resuelve "buscar por número sin saber el tipo" — que es exactamente lo
-- que hace el buscador. Ahora los dos índices tienen trabajos distintos.
