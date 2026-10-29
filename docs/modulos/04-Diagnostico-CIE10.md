---
tags: [modulo, cie10]
---

# Módulo 4 — Diagnóstico y Catálogo CIE-10

Buscador autocompletable de códigos CIE-10 al registrar la impresión diagnóstica. El catálogo se importa desde una fuente pública a una tabla de referencia en Supabase (`cie10_catalogo`), con `scripts/import-cie10.mjs`, que se puede volver a correr. Lo que se agrega o corrige sobre la fuente va en `supabase/datos/cie10-ajustes.json`. Nada se escribe a mano en el panel.

Fuente y detalle de importación: [Catalogo-CIE10](../integraciones/Catalogo-CIE10.md).

## Cómo busca (RF-11, implementado en la Fase 4)

Son **cerca de 12.900 códigos**, así que el filtrado ocurre entero en Postgres: traerse
el catálogo al navegador serían más de 1 MB por consulta abierta, y el índice
GIN `idx_cie10_descripcion` quedaría de adorno. La consulta viaja por una Server
Action y corre con la sesión de la doctora, o sea con RLS aplicando; el catálogo
es de **solo lectura** incluso para ella.

Se enruta por la forma de lo tecleado, igual que el buscador de pacientes:
"letra seguida de dígito" es un código, cualquier otra cosa es texto del
diagnóstico. Se consulta una columna o la otra, nunca las dos con un `or()`: los
paréntesis de la tsquery chocarían con los del `or()` de PostgREST.

### Las tres trampas que salieron al construirlo

**1. Los códigos están guardados SIN punto.** `J060`, no `J06.0` — así los trae
el CSV de origen y así se importaron (comprobado: ninguna fila tiene punto, y el
importador rechaza un ajuste que lo traiga). La doctora los conoce *con* punto, porque con punto salen impresos
en cualquier tabla del CIE-10. Sin normalizar lo tecleado, la forma más natural
de escribir un código no encuentra nada y el buscador parece roto.

**2. Las tildes no hacen falta; la eñe sí.** El stemmer español de Postgres
termina quitando los acentos agudos, así que `hipertensión` se indexa como
`hipertension` y teclear sin tilde la encuentra — verificado contra la base. La
eñe **no**: es otra letra para el stemmer, y `migrana:*` devuelve "Larva migrans
visceral" y ninguna de las cuatro migrañas. Es exactamente la trampa que ya
había mordido con los apellidos, así que la expansión de la eñe se mudó a
`lib/busqueda-texto.ts` y ahora la comparten los dos buscadores.

**3. El orden que devuelve el índice no es el útil.** Buscar "hipertension" trae
primero *"Lectura elevada de la presión sanguínea, sin diagnóstico de
hipertensión"*. Ordenar por relevancia en Postgres exigiría `ts_rank` en el
`ORDER BY`, y PostgREST no sabe ordenar por una expresión calculada sin una
vista o una función de por medio — o sea, una migración para un problema de
presentación. Se traen 60 filas, se ordenan en el cliente (primero lo que
*empieza* por lo tecleado, luego lo que lo trae al principio de una palabra, y a
igualdad la descripción más corta, que en el CIE-10 suele ser la categoría
principal) y se muestran diez. El total real se pide en la misma consulta, para
poder decir "10 de 43" en vez de fingir que no hay más.

## Lo elegido se muestra entero, no como un código suelto

"J069" no significa nada al releer la ficha tres meses después. Una vez
seleccionado, el código deja de ser un campo de texto y pasa a ser una tarjeta
con el código en IBM Plex Mono y su descripción completa, con el check turquesa
que [Prompts-Stitch](../diseno/Prompts-Stitch.md) pide para el CIE-10 válido. Lo que viaja en el formulario
sigue siendo solo el código: es lo que guarda `consultas.cie10_codigo`, que es
FK contra el catálogo.

**El código cuenta para el límite de la impresión diagnóstica**, porque se
imprime pegado a ella en el mismo renglón ([ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md)).
Elegirlo consume espacio, y el contador lo refleja en ese momento.

## Ver también
- [03-Historial-Clinico](03-Historial-Clinico.md)
- [Modelo-de-Datos](../arquitectura/Modelo-de-Datos.md)
- [Índice](../README.md)
