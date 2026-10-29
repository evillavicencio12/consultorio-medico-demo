---
tags: [modulo, pacientes]
---

# Módulo 2 — Gestión de Pacientes

## Importación inicial
Los pacientes ya registrados en el Google Sheet de la doctora (nombre completo, fecha de nacimiento, cédula, correo, nombre y cédula del acompañante) se importan **una sola vez** a Supabase mediante script de migración. Después de esa carga, el Sheet deja de ser fuente de verdad.

## Alta de paciente nuevo
Si al buscar un paciente no aparece, se registra ahí mismo antes de iniciar la consulta.

## Búsqueda con autocompletado
Por nombre o documento de identidad; trae automáticamente los datos fijos (ver distinción fijos/variables en [03-Historial-Clinico](03-Historial-Clinico.md)).

## Regla de menor de edad
Si el paciente es menor de 18 años, nombre y documento del acompañante son **obligatorios**. Correo y teléfono (de paciente y acompañante) siguen opcionales. Detalle de la decisión: [ADR-003-menor-edad-18-anos](../adr/ADR-003-menor-edad-18-anos.md).

## Cálculo de edad
No se escribe manualmente — se calcula desde la fecha de nacimiento. Si es menor de 1 año, se muestra en **meses**.

> [!warning] Una fecha `YYYY-MM-DD` se lee en hora LOCAL, nunca con `new Date()` a secas
> `new Date("2008-08-22")` es medianoche **UTC**, pero `getFullYear()`,
> `getMonth()` y `getDate()` leen en hora **local**: en Ecuador (UTC-5) esa
> fecha se convierte en el 21 de agosto a las 19:00, o sea un día antes, y el
> paciente sale **un día más viejo** de lo que es.
>
> Un día de más no se nota en el listado, pero decide si el formulario exige
> acompañante ([ADR-003-menor-edad-18-anos](../adr/ADR-003-menor-edad-18-anos.md)): un paciente que cumple 18
> *mañana* se veía como de 18 recién cumplidos, el formulario no pedía
> acompañante, y la fila se estrellaba contra el CHECK
> `acompanante_obligatorio_si_menor` — que usa `age()` de Postgres y no se
> equivoca. El error crudo de base de datos aparecía en la cara de la doctora,
> un día al año por paciente.
>
> `lib/edad.ts` arma la fecha a mano para ese formato, que es justo el que
> devuelve Supabase para una columna `date` y el que emite un
> `<input type="date">`. **El cálculo vive ahí y en ningún otro sitio**: con dos
> copias, este bug vuelve por la puerta de atrás.
>
> **Y volvió tres veces, cada una por un extremo distinto.** La primera por la
> fecha de nacimiento (esto). La segunda por las fechas impresas del PDF, que
> `lib/pdf/format.ts` construía por su cuenta: la receta salía con la fecha del
> día anterior. La tercera, en la Fase 4, por la **fecha de referencia**:
> `calcularEdad(nacimiento, fechaReferencia)` aceptaba una cadena y la pasaba
> por `new Date()`, y `consultas.fecha` es exactamente eso — una columna `date`
> que llega como `"2026-08-22"`. Resultado: a todo paciente cuyo cumpleaños
> cayera el día de su consulta, el historial le imprimía **un año de menos**.
> Ahora la referencia entra por el mismo parser que el nacimiento.
>
> La regla, entonces, no es "usa `lib/edad.ts`": es que **ninguna fecha
> `YYYY-MM-DD` pase por `new Date()` en ningún punto del sistema**, ni como dato
> ni como referencia.

## Alerta de alergias
El campo "alergia actual" del paciente se actualiza con lo capturado en cada consulta, y alimenta la etiqueta roja visible en el listado y en el Historial Clínico — siempre refleja lo último registrado.

opciones del dropdown de Estado Civil (Soltero/a, Casado/a, Divorciado/a, Viudo/a, Unión libre)
## Listado de pacientes (pantalla)

Decisiones tomadas al construirlo (Fase 2). No estaban en el ERS: se resolvieron
mirando los datos reales.

### Orden por defecto: los más recientes primero
El listado ordena por fecha de registro descendente, **no alfabéticamente**. La
doctora no recorre 164 nombres: busca. Lo que el listado sin búsqueda sí resuelve
es "el paciente que acabo de registrar" y, a medida que el sistema se use, "los
que entraron esta semana" — y el orden alfabético entierra al recién registrado
en la letra que le toque. El bloque histórico migrado se hunde solo al fondo.

Hay un conmutador **A–Z** al lado, porque para recorrer el archivo el alfabético
sigue siendo el único orden navegable. El orden alfabético lo hace Postgres con
su colación, así que la Ñ cae junto a la N y no después de la Z.

**Pendiente para cuando haya consultas:** el orden verdaderamente útil será por
*última consulta* descendente. Hoy sería un JOIN contra una tabla vacía
(`consultas` = 0 filas), así que se dejó fuera a propósito; requerirá una vista
o una columna derivada, o sea una migración nueva.

### Búsqueda (RF-06)
Un solo campo. Si lo tecleado trae dígitos se busca por **documento** (fragmento,
no solo prefijo: la doctora a veces recuerda los últimos números); si no, por
nombre contra el índice GIN `idx_pacientes_nombre`, con coincidencia por
**prefijo** para que "gar" encuentre "GARCIA" sin terminar de escribirlo.

La regla se leía antes como "nadie escribe una cédula con letras", y dejó de ser
cierta al admitir pasaportes: `AB123456` lleva letras y sigue siendo un
documento. Ahora la señal es **el dígito**, y la normalización **conserva las
letras** en vez de borrarlas — antes `AB123456` acababa buscándose como
`123456`.

Que esto importe no es teórico: si el buscador no encuentra un pasaporte por su
número, el paciente extranjero se registra de nuevo en cada visita. Es la
protección que sustituye al dígito verificador en los documentos que no se
pueden verificar ([ADR-008-validacion-cedula](../adr/ADR-008-validacion-cedula.md)).

*Limitación conocida:* un documento compuesto solo por letras se enruta a la
búsqueda por nombre. Prácticamente todos los pasaportes llevan dígitos, y tratar
como documento cualquier palabra suelta rompería la búsqueda por apellido, que
se usa cien veces más. Al paciente se le sigue encontrando por su nombre.

El stemmer español trata la **eñe** como letra propia, así que "MUNOZ" no
encontraría a "MUÑOZ" — y una búsqueda que no encuentra a un paciente que sí
existe termina en un duplicado, que es un problema que esta base ya tuvo. La
búsqueda prueba las dos formas.

### Campos vacíos por migración ([ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md))
Un campo que la base no tiene nunca se dibuja como hueco: se escribe con
palabras ("Sin documento", "Edad no registrada"), en tipografía de cuerpo y no en
la mono de identificadores, para que no pueda confundirse con un valor real.

Una fila se marca **"Ficha incompleta"** si le falta **documento** o fecha de
nacimiento (83 pacientes; los 29 sin fecha están dentro de esos 83), y hay un
filtro para verlas todas juntas.

Lo que se mira es el **número**, nunca el tipo. Un paciente con pasaporte tiene
su documento completo y **no** entra en el filtro: "sin documento" (los 83) y
"con un documento que no es cédula" son cosas distintas, y confundirlas
enterraría las fichas que de verdad hay que completar entre otras que ya están
bien. Por eso el texto de ausencia dice "Sin documento" y no "Sin cédula": de
los 83 no se sabe todavía cuál traerán, y en un extranjero "Sin cédula" sería
directamente falso. **`sexo` queda fuera de esa marca a propósito**:
falta en los 164, y una etiqueta que sale en el 100% de las filas no señala
nada. Además no hay nada que "revisar" — el dato no existe en el Sheet de
origen, solo puede preguntarse en la próxima consulta.

La marca de ficha incompleta va en gris, nunca en rojo: el rojo está reservado a
las alergias y a los errores de validación ([Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md)).

### Latencia de la búsqueda (RNF-09) — medida, no estimada

**~1 segundo desde la tecla hasta el resultado.** Medido el 21 de agosto de 2026
en el navegador, con los 164 pacientes y sesión real, contra un build de
producción (`next build` + `next start`) — no es sobrecarga del servidor de
desarrollo, en `next dev` da lo mismo.

De dónde sale ese segundo, por petición:

| Tramo | Tiempo |
|---|---|
| `proxy.ts` (verificar la sesión) | **356-470 ms** |
| Código de la aplicación (3 consultas a Supabase en paralelo) | 218-260 ms |
| Rebote del buscador antes de navegar | 200 ms |
| Framework (`next.js`) | 4-6 ms |

Lo que importa de esa tabla: **el coste dominante no es la consulta, es
verificar la sesión.** `proxy.ts` llama a `getUser()`, que es una llamada de red
al servidor de auth de Supabase, y lo hace en cada petición; una navegación por
búsqueda es una petición. Las tres consultas a la base van en paralelo y suman
poco más de un cuarto de segundo entre todas.

**Se acepta tal cual.** La doctora busca un paciente al empezar la consulta, no
teclea en bucle, y ~1 s no estorba en ese uso. Además el coste es del proxy, o
sea de **toda** la aplicación: optimizar solo el buscador maquillaría el síntoma
sin tocar el fondo. Ver [01-Autenticacion](01-Autenticacion.md).

**La salida, si algún día hace falta:** mover la consulta del buscador al
navegador con `lib/supabase/client.ts`, que se salta a la vez el salto al
servidor de Next y el `getUser()` del proxy — la consulta sola ronda los 250 ms.
Lo que **no** es una salida es cambiar `getUser()` por `getSession()`: eso es una
regresión de seguridad, y está descartado en [01-Autenticacion](01-Autenticacion.md).

### Sin paginación
Con 164 pacientes no hace falta: la respuesta completa pesa unos pocos KB y
paginar añadiría un control más que la doctora tendría que aprender. Se trae un
tope de 300 filas y, si alguna vez se alcanza, la pantalla lo dice ("mostrando N
de M") en vez de recortar en silencio. El umbral para replantearlo está en el
orden de los 500-1000 pacientes.

## Alta, edición y ficha (pantallas)

Decisiones de la Fase 2, sesión B. Como las del listado, se resolvieron mirando
los datos reales y no estaban en el ERS.

### Un solo formulario para alta y edición
Son los mismos diecisiete campos con las mismas reglas; dos copias se habrían
desincronizado en la primera corrección. Lo que cambia no es el formulario sino
el **contexto**: si hay una fila guardada detrás. De ahí salen las tres
diferencias, y las decide `lib/pacientes/formulario.ts`.

Las reglas corren **dos veces**: en el navegador, para que el error salga
mientras se escribe, y otra vez en la Server Action, porque un `<form>` llega al
servidor sin pasar por el JavaScript de la pantalla. La del cliente es
comodidad; la del servidor es la defensa ([Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md)).

### Alta: los cuatro obligatorios, sin excepción
Documento de identidad, nombre completo, fecha de nacimiento y sexo.
[ADR-006-campos-opcionales-migracion](../adr/ADR-006-campos-opcionales-migracion.md) relajó la **base** por la carga
histórica y dice con todas las letras que no relaja el formulario. Un paciente
nuevo que entra incompleto es deuda nueva.

El documento lleva **su tipo delante** (Cédula ecuatoriana / Pasaporte / Otro
documento) porque el tipo decide cómo se valida el número: la cédula pasa por el
**dígito verificador**, un pasaporte no puede pasar por nada equivalente. Poner
el número primero obligaría a teclearlo, ver un error y solo entonces descubrir
que había que cambiar el tipo.

El desplegable arranca en "Cédula ecuatoriana" a propósito: así un pasaporte
tecleado sin cambiar el tipo choca contra el verificador y obliga a mirar. El
feedback en línea se recalcula al cambiar el tipo, de modo que no hay forma de
quedarse con un check turquesa sobre un valor que ya no vale, ni con un error
rojo sobre un pasaporte legítimo. Todo el razonamiento está en
[ADR-008-validacion-cedula](../adr/ADR-008-validacion-cedula.md).

### Edición: se puede guardar a medias, y es a propósito
Es el único mecanismo que tiene el sistema para cerrar la deuda de la migración
(164 sin sexo, 83 sin documento, 29 sin fecha —). La regla:

- Un campo **vacío** en la base puede seguir vacío. Si la edición exigiera los
  tres a la vez, completar el sexo de alguien de quien no se sabe el documento
  sería imposible y la doctora se iría sin guardar nada. **Un avance parcial
  guardado vale más que un formulario perfecto que nadie puede enviar.**
- Un campo que **ya tiene valor** no se puede borrar: sería perder un dato.
- La pantalla **señala qué falta**, por su nombre ("A esta ficha le falta el
  documento de identidad, la fecha de nacimiento y el sexo"), y marca cada campo pendiente junto
  a su etiqueta. Un formulario genérico obligaría a la doctora a comparar
  diecisiete casillas.

El aviso va en gris, no en rojo: una ficha incompleta es una tarea pendiente, no
una alerta clínica ([Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md)).

### El camino desde el filtro
`Fichas incompletas (83)` → la fila dice qué le falta en concreto (con el filtro
puesto la etiqueta cambia de "Ficha incompleta" a "Falta documento de
identidad") → la fila abre
la ficha → la ficha repite lo que falta con un botón "Completar ficha" → el
formulario lo marca campo por campo.

### Menor de edad: la UI llega antes que el CHECK
El bloque de acompañante aparece y desaparece según la fecha de nacimiento
**escrita en ese momento**, no según lo guardado. Así el caso delicado de la
edición —se completa la fecha de un paciente migrado y resulta menor— se
resuelve donde la doctora lo puede arreglar, en vez de terminar en
`violates check constraint "acompanante_obligatorio_si_menor"`.

Un detalle que haría inútil todo esto: el CHECK de la base pide `is not null`, y
**la cadena vacía no es NULL**. Un envío con los campos de acompañante en blanco
pasaría el CHECK y guardaría un menor con acompañante `""` — peor que el error,
porque no se nota. Por eso todo campo vacío se guarda como NULL.

Un adulto que **ya trae** acompañante de la migración sigue viendo el bloque. Si
no se dibujara, esos campos no viajarían en el envío y guardar un cambio de
teléfono borraría al acompañante.

El acompañante tiene **su propio tipo de documento**, y no por simetría: el
acompañante de un menor extranjero es casi siempre también extranjero. Resolver
solo el documento del paciente habría dejado sin registrar justo ese caso.

### Un campo que no está en la pantalla no viaja en el envío

El bloque de acompañante solo se dibuja si el paciente es menor o ya trae
acompañante. En el alta de un adulto esos campos **no existen en el formulario**,
así que no llegan al servidor — y ahí hay dos trampas encadenadas que ya
mordieron una vez:

1. **Leer un campo ausente como vacío borra su valor por defecto.**
   `tipo_documento_acompanante` es NOT NULL en la base y tiene que ser uno de los
   tres valores del CHECK; si se lee como cadena vacía, la validación lo rechaza
   con toda la razón. La regla es: **un campo ausente conserva su valor por
   defecto; uno presente y vacío se lee como vacío** —que es como la edición
   limpia un teléfono.
2. **Un error sobre un campo que no está dibujado es invisible.** El formulario
   se negaba a guardar mostrando "Revisa los campos marcados en rojo" sin nada en
   rojo. Ahora, si el error cae en uno de esos campos, el aviso del pie muestra
   **el mensaje concreto** en vez de señalar una marca que no existe.

Corolario para las pruebas: construir el objeto de datos a mano no reproduce
esto, porque ahí los quince campos siempre están. Hay que pasar por el
`FormData` que manda el navegador de verdad.

### Documento duplicado: se dice quién es
El UNIQUE de `(tipo_documento, documento)` rechaza el duplicado, pero
`duplicate key value violates unique constraint "pacientes_documento_key"` no dice
lo único que importa: **quién tiene ese documento**. Sin ese dato la salida
natural es registrar al paciente por otra vía —o sin documento— y ahí nace el
duplicado, que es el problema que esta base ya tuvo 82 veces.

- **En el alta:** "Pertenece a NOMBRE. No hace falta registrarlo otra vez",
  con enlace a su ficha.
- **En la edición** (el caso de los 83 sin documento): se nombra la sospecha real
  —dos fichas de la misma persona— y se lleva a la otra ficha. **No se fusionan
  automáticamente**: decidir qué nombre queda, qué fecha de nacimiento gana y a
  qué ficha se mudan las consultas es de la doctora, no de una heurística.

### Ficha del paciente (solo lectura)
Lo que abre una fila del listado. Datos fijos sobre `#E8EEF2`, la alergia con su
texto completo (en el listado solo se ve QUE la hay), el bloque de acompañante
si existe, la fecha de registro y el acceso a editar.

La **etiqueta del dato ES el tipo de documento** ("Cédula ecuatoriana",
"Pasaporte"): así el tipo se lee sin gastar un renglón aparte que en 164 fichas
diría lo que ya se daba por supuesto. En el listado, el tipo aparece como
prefijo corto **solo cuando no es cédula** — anteponer "Cédula" a 164 números
sería ruido en casi toda la pantalla para distinguir un puñado de fichas.

**La línea de tiempo de consultas no está**: es la Fase 3 y `consultas` tiene 0
filas. En su lugar hay un bloque que dice qué va a ir ahí, para que la ausencia
se lea como "todavía no" y no como "se perdió".

### Rango de la fecha de nacimiento
La base no tiene ningún CHECK que acote `fecha_nacimiento` — por eso entró el
`0214-06-08` que hubo que corregir a mano. Mientras ese
CHECK no exista, **el formulario es la única puerta**: rechaza fechas futuras y
años anteriores a 1900.

## Ver también
- [03-Historial-Clinico](03-Historial-Clinico.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [ADR-008-validacion-cedula](../adr/ADR-008-validacion-cedula.md)
- [Índice](../README.md)
