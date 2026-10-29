---
tags: [modulo, configuracion, mantenimiento]
---

# 07 — Configuración

Cuarto ítem del navigation rail, el último. La definición original del proyecto
ya lo contemplaba así: *"pestaña opcional, de uso ocasional"*. No es una
pantalla de preferencias —el sistema tiene una sola usuaria y ninguna opción que
elegir—: es donde viven las tareas de mantenimiento que hasta la Fase 5 solo se
podían hacer desde una terminal.

Hoy hay una sola tarea: **reimportar el catálogo de medicamentos** (RF-13).

Ruta: `/configuracion` — `app/(app)/configuracion/`.

## Por qué existe la pantalla si ya existía el script

`scripts/import-medicamentos.mjs` funciona y está probado contra producción,
pero exige un `.env` con la clave secreta de Supabase y la de Google, una
terminal y saber qué se está haciendo. La doctora agrega medicamentos al Sheet;
depender de que alguien más corra un comando para que aparezcan en el buscador
de la receta convierte una tarea suya en una petición a soporte.

RF-13 pedía la reimportación como **función del sistema**, no como tarea de
instalación. Esto es esa función.

## El flujo: dos pasos, nunca uno

```
[Ver qué cambiaría]  ──► lee el Sheet, compara, NO escribe
                          │
                          ▼
                     resumen en pantalla
                          │
                     ☐ casilla de confirmación
                          │
                     [Confirmar importación]  ──► escribe
```

**Paso 1 — Vista previa.** Es el equivalente exacto del `--dry-run` del script.
Lee el Sheet, lo transpone, deduplica, detecta los duplicados y compara el
resultado contra el catálogo que hay ahora. Muestra cuántos se agregarían,
cuántos cambiarían de principio activo, cuántos ya están idénticos, cuántas
celdas vacías se omitieron y qué duplicados hay **con su columna y su fila**.
No escribe nada.

**Paso 2 — Confirmar.** Marcar una casilla y pulsar el botón. El botón está
deshabilitado hasta que la casilla esté marcada, y esto no es ceremonia: el
botón aparece justo debajo del resumen, o sea justo donde el dedo ya estaba al
pedir la vista previa. La casilla es lo que separa *mirar* de *escribir en
producción*.

Mientras cualquiera de los dos pasos corre, su botón queda deshabilitado y
muestra el giro de carga — la llamada a Google Sheets tarda (autenticación más
lectura), y sin eso un segundo clic dispararía la operación dos veces.

### La huella: confirmar no escribe "lo que viste", escribe "lo que hay, si sigue siendo lo que viste"

La vista previa devuelve una **huella** del contenido leído (FNV-1a de 32 bits +
el número de filas). Confirmar la manda de vuelta; el servidor **relee el Sheet**
y compara. Si no coincide, no escribe nada y obliga a previsualizar otra vez.

Sin eso, entre los dos pasos pasan segundos y el Sheet es un documento vivo que
la doctora puede tener abierto en otra pestaña: "confirmar" acabaría escribiendo
algo que nadie llegó a mirar. De paso, cierra la puerta a que la acción de
escritura se invoque por POST directo sin haber previsualizado.

## Nuevos, cambiados e idénticos — un número que el script nunca supo dar

El script imprime "importados/actualizados" en un solo número, porque el
`upsert` no distingue. La vista previa **sí** tiene que distinguir: la pregunta
que uno se hace antes de tocar producción es *¿esto agrega algo o solo reescribe
lo mismo?*.

`clasificarContraCatalogo` compara el Sheet contra el catálogo y parte el
resultado en tres: **nuevos**, **cambian de principio activo** e **idénticos**.
Se calcula siempre **antes** de escribir — después, todo estaría ya en la base y
"nuevos" daría cero.

La comparación del nombre comercial es **exacta**, no en minúsculas: quien
decide si dos filas son la misma es el UNIQUE de Postgres, y ese distingue caja.
Comparar en minúsculas diría "sin cambio" de algo que la base va a insertar como
fila nueva.

Como efecto secundario, el `--dry-run` del script ahora también imprime los tres
números y la lista de los que se agregarían: los dos llamadores comparten la
función.

## Una sola fuente de verdad, dos llamadores

```
lib/medicamentos/importar.ts   transposición · duplicados · upsert · clasificación
lib/medicamentos/sheet.ts      autenticación con Google · lectura del Sheet
          │                                    │
          ├────────────────────────────────────┤
          ▼                                    ▼
scripts/import-medicamentos.mjs      lib/medicamentos/acciones.ts
   (terminal, --dry-run)                 ("use server", la pantalla)
```

Es el mismo principio que `lib/edad.ts` y `lib/texto-plano.ts`: un bug corregido
en un lado no puede reaparecer en el otro, porque no hay otro lado. El script
quedó como envoltorio de terminal —argumentos, cliente e impresión del resumen—
y no tiene lógica propia.

> [!info] Un `.mjs` importando un `.ts` sin compilar nada
> Node 24 borra los tipos de forma nativa. La condición es que el import traiga
> la extensión **real** del archivo (`../lib/medicamentos/importar.ts`) en vez
> de omitirla. Por eso esos dos módulos no usan el alias `@/` —Node no lo
> resuelve— y no importan `server-only` —lanza fuera del bundle de React Server
> Components, y el script dejaría de arrancar—. Los imports de **tipo** sí
> pueden ir sin extensión: `import type` se borra entero antes de que Node vea
> el archivo.
>
> Node imprime un aviso `MODULE_TYPELESS_PACKAGE_JSON` al cargarlos. Es ruido:
> declarar `"type": "module"` en package.json lo callaría y cambiaría de golpe
> la interpretación de todos los `.js` del proyecto.

## Seguridad

Es la parte más delicada del módulo: aquí conviven, por primera vez en la
aplicación, un componente de cliente y el código que descifra la clave privada
de la Service Account de Google.

### 1. La escritura usa la clave que salta RLS, y no por comodidad

La política RLS de `medicamentos_catalogo` es `for select` a secas
(`20260820120400_rls_y_grants.sql`, *"Doctora autenticada - solo lectura"*): el
catálogo es de solo lectura **incluso para la doctora autenticada**. Un `upsert`
con `lib/supabase/server.ts` no fallaría de forma ruidosa — RLS descartaría las
filas y devolvería éxito con cero escritas.

Por eso `lib/supabase/admin.ts` aparece aquí, en **una sola línea** de
`acciones.ts`, la del `upsert`. Todo lo demás de este módulo —leer el catálogo
para compararlo, contarlo— va con `lib/supabase/server.ts`, con la sesión de la
doctora y RLS aplicando.

### 2. `proxy.ts` protege la RUTA; no protege la Server Action

`/configuracion` está protegida por `proxy.ts`: no está en `RUTAS_PUBLICAS` y el
`matcher` la incluye. **Verificado ejecutando**, no por lectura del código:

| Prueba | Resultado |
|---|---|
| `GET /configuracion` sin sesión | `307` → `/login?volverA=%2Fconfiguracion` |
| `POST` de la acción de escritura a `/configuracion` sin sesión | `307` → `/login` |
| `GET /configuracion` con sesión | `200`, con el catálogo contado en el servidor |

> **Desde el Paso 4 la segunda fila ya no es así.** El `POST` de una Server
> Action pasa el proxy sin sesión y es la acción la que responde
> `SESION_CADUCADA`: redirigirlo hacía que la pantalla recibiera el HTML del
> login y mostrara un error engañoso. Por qué, y cómo se prueba, en
> [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md).

Y aun así **eso no alcanza**, porque una Server Action es un endpoint POST
propio, con su identificador, alcanzable sin pasar por la pantalla que la
muestra. La documentación de Next lo dice sin rodeos: *«you should still treat
Server Actions as reachable via direct POST requests and verify authentication
and authorization inside each one»*
(`node_modules/next/dist/docs/01-app/02-guides/data-security.md`).

Que la ruta no es la frontera se comprobó de la única forma que vale, disparando
la acción desde **otra** ruta:

| Prueba | Resultado |
|---|---|
| `POST` de la acción de vista previa a `/pacientes`, con sesión | `200` **y la acción se ejecutó** |
| `POST` de la acción de vista previa a `/login` (pública), sin sesión | `200 {}` — Next no resolvió la acción en el grafo de esa ruta |

O sea: el identificador funciona desde cualquier ruta que incluya el módulo, y
que hoy no funcione desde `/login` es una propiedad del *build*, no una
garantía — bastaría que un layout compartido importara el módulo de acciones
para que dejara de serlo.

**Por eso las dos acciones empiezan verificando la sesión**, con `getUser()` y
no `getSession()`, por la misma razón que documenta `proxy.ts`: getSession lee
la cookie sin validarla y una cookie manipulada pasaría. Hasta el Paso 4 lo
hacía una función propia, `exigirSesion()`, con su propio texto («La sesión
caducó. Vuelve a entrar antes de importar.»); desde el Paso 4 usan la función
compartida de todas las acciones, `clienteConSesion()` de
`lib/supabase/sesion.ts`, y responden con el mismo `SESION_CADUCADA` que el
resto de la app.

> [!important] Esto dejó de ser una decisión de este módulo
> A raíz de este hallazgo se convirtió en **regla general del proyecto**: toda
> Server Action nueva, en cualquier fase futura, verifica la sesión dentro de sí
> misma con `getUser()`, sin asumir que `proxy.ts` alcanza. Está en `CLAUDE.md`
> —entre las reglas que no deben romperse, con su sección propia— y en
> [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md), que además anota qué acciones anteriores todavía no la
> cumplen.

### 3. Ningún secreto llega al navegador

Ni la clave de la Service Account, ni el correo de esa cuenta, ni el ID del
Sheet, ni la clave secreta de Supabase — ni en el HTML, ni en el bundle de
JavaScript, ni en el valor que devuelve la Server Action.

Lo que sale de `acciones.ts` son números, nombres de medicamentos y coordenadas
de celda. Los errores crudos de `googleapis` y de PostgREST **no se devuelven**:
pueden traer pegada la URL del documento o un fragmento de la clave, así que se
registran en el servidor (logs de Vercel) y a la pantalla va un texto fijo.

Esto dejó de ser una promesa y pasó a ser una comprobación:

```
npm run build
npm run verificar:bundle     # scripts/verificar-bundle-sin-secretos.mjs
```

Busca los **valores** de los secretos —no sus nombres, que pueden aparecer en un
mensaje de error sin significar nada— dentro de `.next/static`, y sale con
código 1 si encuentra alguno. La primera corrida encontró un falso positivo
instructivo: la pantalla nombraba la variable `GOOGLE_SHEET_RANGE_MEDICAMENTOS`
en un aviso, y el valor de esa variable (`MEDICAMENTOS`) es subcadena de su
propio nombre. Se reescribió el aviso — una pantalla para la doctora no debe
nombrar variables de entorno de todas formas.

## Ver también
- [Contrato-Sheet-Medicamentos](../integraciones/Contrato-Sheet-Medicamentos.md) — el formato del Sheet y lo que decide la importación
- [05-Prescripcion-Receta](05-Prescripcion-Receta.md) — quién consume el catálogo
- [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md)
- la migración inicial de datos
- [Índice](../README.md)
