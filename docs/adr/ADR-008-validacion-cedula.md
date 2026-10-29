---
tags: [adr]
---

# ADR-008 — Validación del documento de identidad

**Estado:** Implementada en `lib/pacientes/documento.ts`. Revisada el 21 de
agosto de 2026 para admitir pacientes extranjeros; el pendiente que dejaba la
primera versión está **cerrado** (ver el último apartado).

## Contexto

El formulario de alta (RF-03) pide la cédula como obligatoria
([ADR-006-campos-opcionales-migracion](ADR-006-campos-opcionales-migracion.md)). Quedaba decidir **hasta dónde**
validarla, y había dos opciones reales:

1. **Solo el formato:** 10 dígitos y un código de provincia existente.
2. **Formato + dígito verificador** (módulo 10 del Registro Civil).

## Decisión

Se valida **el dígito verificador**, no solo el formato. Además:

- Código de provincia entre **01 y 24, o 30**. El 30 identifica a los
  ecuatorianos cedulados en el exterior; cerrarlo en 24 rechazaría cédulas
  reales.
- **Tercer dígito menor que 6.** De 6 en adelante son sociedades (RUC), no
  personas naturales — un RUC de empresa no es la cédula de un paciente.
- La **cédula del acompañante** se valida con el mismo criterio.

## Por qué el dígito verificador, y no solo el formato

Porque el error que de verdad ocurre no es de formato.

Validar solo la forma atrapa "escribí nueve dígitos" y poco más. **No atrapa
cambiar un dígito ni intercambiar dos**, que es lo que pasa al teclear una
cédula con el paciente enfrente: esa cédula equivocada tiene diez dígitos, una
provincia perfectamente válida, y pasa.

Y una cédula equivocada guardada no es un dato feo — es un **duplicado
futuro**. La próxima vez la doctora busca por la cédula correcta, no encuentra a
nadie, y registra al paciente otra vez. Es exactamente el camino por el que esta
base terminó con 82 filas duplicadas que hubo que borrar a mano, y el UNIQUE de `cedula` no protege de eso: dos cédulas
distintas no chocan entre sí.

El módulo 10 detecta cualquier error de un solo dígito y casi todas las
transposiciones. Y sale gratis: el dígito ya viene impreso en el documento que
la doctora tiene en la mano.

## Lo que esta decisión NO rompe: los datos migrados

La estrictez es **del alta, no de la fila**. Al editar un paciente, la cédula
que ya está guardada se acepta tal cual si no se toca — en la base hay al menos
una de 8 dígitos que entró con la importación del Sheet.

Sin esa excepción, ese paciente quedaría congelado: no se le podría completar el
sexo ni la fecha de nacimiento sin corregir antes una cédula que quizá sea la
correcta y simplemente esté registrada en otro formato. Si la doctora **cambia**
esa cédula, la nueva se valida estricto como en el alta.

La pantalla lo dice en voz alta cuando ocurre, en vez de mostrar un check
turquesa inexplicable sobre una cédula de ocho dígitos.

## Pacientes extranjeros — pendiente cerrado (21 de agosto de 2026)

La doctora confirmó que sí atiende pacientes extranjeros, que traen pasaporte.
Se resolvió de inmediato y no más adelante por una razón concreta: **si el
formulario no los admite, la doctora está frente al paciente sin poder
registrarlo y va a inventar un número para salir del paso.** Ese dato malo se
queda para siempre, y sale más barato arreglarlo con 164 pacientes y cero
consultas que dentro de seis meses.

### Tres tipos de documento

`cedula`, `pasaporte` y `otro`, con CHECK en la base
(`20260821120000_tipo_documento.sql`). `otro` cubre las cédulas extranjeras —las
colombianas y venezolanas son frecuentes aquí—, los documentos de refugiado y
los carnés consulares. **La opción existe justamente para que no haya ninguna
situación en la que la salida sea inventar un número.**

El acompañante tiene su propio tipo. No es simetría decorativa: el acompañante
de un menor extranjero es, casi siempre, también extranjero, y resolver solo el
documento del paciente habría dejado sin registrar al caso que motivó el cambio.

### El dígito verificador se aplica SOLO a la cédula ecuatoriana

Los formatos de pasaporte varían muchísimo por país y no existe un checksum
común. **Cualquier regla de forma inventada aquí rechazaría documentos
legítimos** — y un documento legítimo rechazado devuelve a la doctora al mismo
problema. Así que para `pasaporte` y `otro` se comprueba lo único comprobable:
que quede algo, que mida entre 4 y 20 caracteres y que no traiga caracteres
imposibles. Ni siquiera se exige que lleve dígitos: casi todos los pasaportes
los llevan, pero "casi todos" no es "todos".

### Qué protege entonces a un documento que no se puede verificar

El valor de esta ADR era atrapar el dígito cambiado que termina en duplicado.
Sin checksum, esa protección se consigue por otras tres vías, y la primera pesa
más que cualquier formato inventado:

1. **Que la búsqueda lo encuentre.** Antes el buscador enrutaba "trae dígitos →
   es una cédula" y borraba las letras, así que `AB123456` se buscaba como
   `123456`. Si un pasaporte no se puede hallar por su número, el paciente
   extranjero se registra otra vez **en cada visita**: un duplicado garantizado,
   no ya por un error de tecleo sino siempre. Corregido en
   `lib/pacientes/busqueda.ts`; ver [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md).
2. **Normalizar antes de guardar.** El pasaporte se guarda en mayúsculas y sin
   separadores, así que `ab-123456`, `AB 123 456` y `AB123456` colapsan en un
   solo valor en vez de en tres pacientes.
3. **Que el tipo se elija a mano.** El desplegable arranca en "Cédula
   ecuatoriana", de modo que un pasaporte tecleado sin cambiar el tipo choca
   contra el dígito verificador y obliga a mirar. Un valor por defecto estricto
   convierte el descuido en un error visible en vez de en un dato malo.

**Lo que se descartó:** pedir el número dos veces para confirmarlo. Es la
técnica habitual cuando no hay checksum, pero añade fricción justo en el camino
raro y con la doctora apurada — y la fricción es precisamente lo que empuja a
inventar atajos. Un pasaporte se copia carácter por carácter de un documento que
se tiene en la mano, no de memoria.

### El UNIQUE pasa a ser del par

`unique (cedula)` daba por hecho que un número identifica a una persona. Nada
impide que un pasaporte extranjero coincida con la cédula de un ecuatoriano;
sería improbable, pero el efecto sería rechazar como "duplicado" a dos personas
distintas. Ahora es `unique (tipo_documento, documento)`.

Lo que ese UNIQUE **no** detecta: la misma persona cargada dos veces, una con
cédula y otra con pasaporte. Nada en la base puede verlo; contra eso trabajan la
búsqueda y el aviso de duplicado del formulario.

### La columna se llama `documento`

Se renombró `cedula` → `documento` (y `cedula_acompanante` →
`documento_acompanante`). Una columna llamada `cedula` que guarda pasaportes es
una mentira silenciosa, y este proyecto tiene un historial de lo que cuestan.
Se hizo en el mismo momento porque el coste solo sube: 164 filas, cero
consultas y nada desplegado todavía, así que no existió la ventana en la que la
aplicación en producción lee una columna que ya no está.

Ninguna de las dos plantillas físicas imprime el documento —comprobado con
`scripts/extract-text-positions.mjs`—, así que el renombrado no tuvo
consecuencias en el módulo de PDF más allá del nombre del campo de entrada.

## Ver también
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [ADR-006-campos-opcionales-migracion](ADR-006-campos-opcionales-migracion.md)
- [02-Gestion-Pacientes](../modulos/02-Gestion-Pacientes.md)
- la migración inicial de datos
- [Índice](../README.md)
