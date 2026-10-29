---
tags: [modulo, historial-clinico]
---

# Módulo 3 — Historial Clínico

Replica digitalmente el formato en papel, diferenciando qué se llena una sola vez y qué cambia en cada consulta. **Regla clave:** hay un solo historial por paciente, compuesto por datos fijos + una cadena de consultas fechadas. Nunca se sobrescribe una consulta anterior.

## Campos fijos (una sola vez, se autocompletan después)
- Nombre completo, cédula, fecha de nacimiento (deriva la edad), sexo
- Antecedentes heredofamiliares

En pacientes migrados estos tres primeros pueden venir vacíos ([ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md)); qué imprime el PDF en ese caso está en [06-Generador-PDF](06-Generador-PDF.md).

## Campos variables (se revisan en cada consulta)
- Teléfono, correo, domicilio, ocupación
- Antecedentes personales patológicos: alergias, patologías, quirúrgicos, transfusionales
- Exploración física: PA, FC, FR, temperatura, peso
- Motivo de consulta / padecimiento actual
- Impresión diagnóstica (con CIE-10 — ver [04-Diagnostico-CIE10](04-Diagnostico-CIE10.md))
- Tratamiento

## Consulta subsecuente
Al buscar un paciente existente, se precargan los campos fijos; la doctora solo llena los variables de esa visita. Las consultas anteriores quedan en una línea de tiempo dentro del Historial Clínico.

## Dónde vive el Historial Clínico (resuelto en la Fase 3)

**El historial clínico de un paciente ES su ficha**, `/pacientes/[id]`. La línea
de tiempo vive ahí. **No hay ítem "Historial Clínico" en el rail**, y `/historial`
redirige a `/pacientes`.

### El conflicto que esto resolvió

Dos partes del propio proyecto se contradecían, y nadie lo había resuelto:

- [Prompts-Stitch](../diseno/Prompts-Stitch.md) describe "Historial Clínico" como un ítem independiente del
  rail, y así se construyó en la Fase 1 — llegó a existir `/historial` con un
  marcador de posición.
- La definición original del proyecto dice, con todas las letras: *"Historial
  Clínico — se abre al seleccionar un paciente desde 'Pacientes' (no es un ítem
  de menú aparte)"*.

### Por qué gana la segunda

1. **Prompts-Stitch.md no es fuente de verdad de navegación.** Su propio
   encabezado lo dice: *"Stitch se usa solo para generar markup visual, nunca
   lógica de negocio"*. Es un archivo de prompts para maquetar, no un
   requisito.
2. **RF-20 ya lo decía.** "El sistema debe mostrar, **en el Historial Clínico de
   cada paciente**, una línea de tiempo con todas sus consultas anteriores". Un
   historial clínico sin paciente no existe.
3. **[Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md) se contradecía a sí mismo.** Su ejemplo de breadcrumb
   es `Pacientes / Historial Clínico / Consulta`: ahí el historial ya cuelga de
   un paciente, no es su hermano en el menú.
4. **Una pantalla sin paciente solo puede preguntar cuál**, y eso ya es
   `/pacientes` — con buscador, filtro de fichas incompletas y alta. Sería una
   segunda puerta a la misma sala, peor equipada. El proyecto ya rechazó dos
   veces ese patrón (el enlace de "¿olvidó su clave?" y el chevron que no abría
   nada).

### Lo que se consideró y se descartó

Convertir el ítem del rail en un **acceso rápido**: un buscador que lleve directo
a la ficha. Se descartó por el punto 4 — cuesta los mismos clics que
`/pacientes` y duplica su buscador. Si algún día el camino "abrir el historial
del paciente que atiendo ahora" se siente lento, la salida es **mejorar
`/pacientes`**, no construir una segunda pantalla: [02-Gestion-Pacientes](02-Gestion-Pacientes.md) ya
tiene anotado que su orden verdaderamente útil será por última consulta, y ese
orden solo es posible desde la Fase 3, cuando `consultas` deje de estar vacía.

`/historial` **redirige** en vez de devolver 404: la ruta llegó a existir y un
marcador viejo debe aterrizar donde ahora vive el historial.

## Línea de tiempo (RF-20)

De la consulta **más reciente a la más antigua**. RF-20 pide "cronológicamente"
sin decir en qué sentido, y descendente es el que sirve: la ficha se abre para
ver qué pasó la última vez, no para leer el expediente desde el principio. La
más antigua sigue localizable —es la última— y de ella sale la "Fecha de
Elaboración" del PDF.

Cada consulta muestra su fecha (en IBM Plex Mono, [Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md)), el
número de receta, el código CIE-10 y el motivo recortado a dos líneas: la línea
de tiempo sirve para **reconocer** la visita, no para leerla entera. El detalle
está en el PDF, que es el documento que la doctora ya conoce en papel.

**Los dos botones de PDF por consulta** ([06-Generador-PDF](06-Generador-PDF.md)) con una
excepción: el de receta solo aparece si la consulta tiene medicamentos. Una
revisión o un control puede no llevar receta, y su PDF saldría con la mitad
"Prescripción" en blanco. Para poder decidirlo sin un viaje extra al servidor,
los medicamentos de todas las consultas se traen junto con la pantalla.

### El estado vacío no es un error

Hoy `consultas` tiene **0 filas** —el formulario de "Nueva Consulta" es la Fase
4—, así que la línea de tiempo está vacía en los 164 pacientes. Ese es el estado
real del sistema, no un fallo: el hueco dice "sin consultas registradas" y
explica qué aparecerá ahí, sin rojo y sin ícono de alerta. Pintado como error,
la doctora abriría 164 fichas creyendo que algo se rompió.

## Dónde vive el formulario de consulta (resuelto en la Fase 4)

`/pacientes/[id]/consulta`. **La consulta cuelga del paciente**, por la misma
razón por la que el historial es su ficha: la cabecera de la pantalla son los
datos fijos de ese paciente, así que la URL tiene que decir de quién es. Se
entra desde el botón turquesa de la ficha, y "Cancelar" y el botón de atrás
vuelven ahí.

**El ítem "Nueva Consulta" del rail se queda**, y no se convierte en una
pantalla propia. Reenvía a `/pacientes?para=consulta`: el mismo listado de
siempre —con su buscador por nombre y por documento, su filtro de fichas
incompletas y su alta— pero con cada fila apuntando a la consulta nueva de ese
paciente en vez de a su ficha. Es una pantalla en dos modos, no dos pantallas:
la salida que este mismo documento ya había señalado cuando se descartó el ítem
"Historial Clínico" ("la salida es mejorar `/pacientes`, no construir una
segunda pantalla"). El parámetro viaja también en cada tecleo del buscador; si
se perdiera ahí —que es lo primero que se hace al llegar— el ítem del rail
dejaría de llevar a donde dice.

## Qué se precarga en una consulta subsecuente

Los **cuatro antecedentes patológicos** (alergias, patologías, quirúrgicos,
transfusionales) llegan de la última consulta del paciente. Son crónicos:
volver a teclear "Hipertensión arterial" en cada visita de un hipertenso es la
forma segura de que un día no se teclee y el historial impreso salga sin ella.

Dos condiciones a eso:

1. **La precarga se anuncia, con la fecha de la que viene** ("Precargados desde
   la consulta del 8 de junio de 2026"). Un campo lleno sin decir de dónde salió
   es un dato viejo disfrazado de dato nuevo.
2. **Lo variable de la visita nunca se precarga**: motivo, exploración física,
   impresión diagnóstica y tratamiento empiezan en blanco siempre.

Sin consultas previas, el campo "alergias" se precarga desde
`pacientes.alergia_actual`: si la ficha grita "ALERGIA REGISTRADA" y el
historial impreso sale con el renglón "Alergias:" en blanco, el papel
contradice a la pantalla.

> [!todo] Pendiente para la 4.5
> El camino de vuelta —que al guardar la consulta se actualice
> `pacientes.alergia_actual` con lo capturado, como pide
> [02-Gestion-Pacientes](02-Gestion-Pacientes.md)— es parte del guardado, que es de la sesión de la
> receta.

## Qué es obligatorio en el formulario

La base acepta NULL en casi todo, porque tuvo que tragarse la importación
histórica ([ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md)). El formulario es más
estricto, y solo en tres campos:

- **Fecha** — se imprime como "Fecha Actual" y ordena la línea de tiempo.
- **Motivo de consulta** — es lo que identifica la visita en la línea de tiempo
  (RF-20). Sin él, la tarjeta dice "Sin motivo registrado" y la consulta queda
  irreconocible entre las demás.
- **Impresión diagnóstica** — es el campo 6 de la hoja de papel y lo que da
  sentido al CIE-10.

El **tratamiento no** lo es: una revisión o un control pueden no llevarlo, por
la misma razón por la que la línea de tiempo solo ofrece el PDF de receta cuando
hay medicamentos. El **código CIE-10 tampoco**: RF-11 pide poder buscarlo y
seleccionarlo, no que no exista consulta sin él.

Los signos vitales se validan como números y nada más. Un valor fuera de rango
—210 lpm, 38,9 °C— **avisa en gris pero no bloquea**: son valores clínicos
reales, y un formulario que los rechaza obliga a la doctora a mentirle al
sistema. Lo que el aviso atrapa es el dedo torpe ("365" en temperatura).

**La coma decimal se acepta y se convierte.** Aquí una temperatura se escribe
"36,5" y `numeric` de Postgres rechaza esa cadena. Por eso los campos de
medición son `type="text"` con `inputMode="decimal"` y no `type="number"`: un
campo numérico descarta el valor entero cuando el separador no es el que espera
el locale del navegador, y el dato se pierde sin avisar. La unidad se muestra
junto al campo pero **no se teclea** — es presentación, la pone el PDF al
imprimir ([06-Generador-PDF](06-Generador-PDF.md)).

## Los campos de texto largo no admiten saltos de línea

Ninguno de los siete campos que acaban en una plantilla —los cuatro
antecedentes patológicos, motivo, impresión diagnóstica y tratamiento, más los
antecedentes heredofamiliares de la ficha— **se imprime como lista**: todos
salen como texto corrido que `wrapText` ajusta al ancho de la hoja. Quien decide
dónde corta cada renglón es esa función, y de ahí sale la cuenta de cuántas
líneas caben (dos y tres, [ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md)).

Un salto de línea puesto a mano no es una preferencia de estilo: le roba un
renglón a un espacio medido al punto, y lo que sobra no se ve al imprimir. Por
eso la tecla Enter no hace nada en esos campos, y lo pegado desde otro programa
se une con un espacio — diciéndolo, para que no parezca que el campo se comió
texto.

Hasta la Fase 4 hacía algo peor que descuadrar el renglón: **tumbaba la
aplicación entera**. El detalle está en [06-Generador-PDF](06-Generador-PDF.md).

## Límites de espacio en el PDF

**Todos** los campos tienen espacio fijo en la plantilla física, no solo dos: la
hoja es de tamaño fijo y sus secciones se suceden una tras otra. "Padecimiento
Actual" y "Antecedentes Heredo Familiares" llevan 3 renglones impresos cada uno,
los antecedentes patológicos 2, "Impresión Diagnóstica" 2 y "Tratamiento" 3.
Todos con contador y bloqueo — ver [ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md).

## PDF por consulta
Cada consulta genera su propio PDF de historial (no un documento acumulado único) — ver [06-Generador-PDF](06-Generador-PDF.md).
## Fecha de Elaboración vs. Fecha Actual (PDF de historial)

- **Fecha de Elaboración** = fecha de la consulta más antigua registrada para el paciente en el sistema (no la fecha de creación del registro del paciente — para pacientes importados en bloque, esa sería la fecha de migración, no una fecha clínica real).
- **Fecha Actual** = fecha de la consulta que se está documentando en ese PDF específico.
## Ver también
- [02-Gestion-Pacientes](02-Gestion-Pacientes.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [Índice](../README.md)
