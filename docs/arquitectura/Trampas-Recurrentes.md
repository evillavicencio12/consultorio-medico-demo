---
tags: [arquitectura, trampas]
---

# Trampas recurrentes

Cosas que rompen lo que "ya sabes" y que ya mordieron más de una vez.

## Next.js 16

Lee `AGENTS.md` y `node_modules/next/dist/docs/` antes de escribir código de app. Lo que ya nos mordió:

- **`middleware.ts` está deprecado y se llama `proxy.ts`**, con un export llamado `proxy`. La protección de rutas del sistema vive ahí — y protege rutas, no Server Actions ([Seguridad-OWASP](Seguridad-OWASP.md)).
- `cookies()` es **asíncrono**.
- **Toda página que calcule "hoy" tiene que ser dinámica, y se comprueba en la salida del build.** Una página que no lee cookies ni parámetros, Next la prerenderiza UNA vez en `next build` (`○` en la tabla de rutas) y el "hoy" queda congelado en la fecha del deploy. Se marca con `await connection()` de `next/server`, no con `export const dynamic`. Pasó con `/pacientes/nuevo` hasta el 16 de octubre de 2026. Las cinco que calculan "hoy" —`/pacientes`, `/pacientes/nuevo`, `/pacientes/[id]`, `/pacientes/[id]/consulta`, `/pacientes/[id]/editar`— tienen que salir `ƒ`.

## "Hoy" siempre sale de `hoyEnEcuador()`

**Nunca de la zona del proceso.** `new Date()` leído con `getFullYear()`/`getMonth()`/`getDate()`, `toLocaleDateString` sin `timeZone` o `toISOString().slice(0, 10)` dan el día del servidor: en esta máquina coincide con Ecuador, en Vercel es UTC, y de 19:00 a medianoche UTC ya es mañana. Se fechaba la consulta mañana, la receta salía con la fecha de mañana y un menor que cumple 18 mañana pasaba por adulto.

- `hoyISOEnEcuador()` (`YYYY-MM-DD`) para un `<input type="date">`, una columna `date` o el `hoyISO` que una página pasa a un formulario; `hoyEnEcuador()` (`Date` a medianoche local de ese día) para `calcularEdad`, `esMenorDeEdad` y los formatos del PDF. Las dos en `lib/fechas.ts`, con un parámetro `ahora` para fijar el reloj en las pruebas.
- Los instantes (`created_at`, marcas de tiempo) no son "hoy": se quedan en UTC.
- **Un documento de una consulta pasada no usa "hoy":** la edad y la mayoría de edad que imprime se calculan contra la fecha DE ESA CONSULTA (ADR-003), al emitirlo desde el formulario y al reimprimirlo desde la línea de tiempo. Reimprimir tiene que dar el mismo papel.
- `npm run test:hoy` corre con `TZ=UTC` y el reloj fijo a las 23:00, 23:59:59 y 00:00 de Ecuador, y comprueba el `hoyISO`, la edad y el día impreso en la receta.
- En SQL vale lo mismo: ver la sección Postgres.
- Los tipos `PageProps<"/ruta">` los genera el build: tipar a mano lo que deba compilar en un clon limpio, o `tsc --noEmit` falla antes de existir.

## Postgres

- **La edad nunca se compara con `age(...) >= interval`.** Postgres compara intervalos normalizando 1 mes = 30 días, así que la víspera del cumpleaños `17 years 11 mons 30 days` es IGUAL a `18 years` y `>=` da verdadero un día antes. Se usa `extract(year from age(hoy::timestamp, fecha::timestamp)) >= N`, con `::timestamp` sin zona: con dos `date`, Postgres elige la versión `timestamptz`, que depende de la zona de la sesión. Lo atrapó `npm run test:menor-edad` ([ADR-003](../adr/ADR-003-menor-edad-18-anos.md)).
- **"Hoy" en SQL es el de Ecuador:** `(now() at time zone 'America/Guayaquil')::date`. `current_date` y `age()` de un argumento usan la zona de la sesión, que en Supabase es UTC. Vale también para los `DEFAULT`: `consultas.fecha` tenía `default CURRENT_DATE` y lo corrigió la migración `20261016120000_fecha_consulta_hora_ecuador`.

## supabase-js

Las filas se tipan con `type`, nunca con `interface`, y cada tabla lleva su clave `Relationships`: [Supabase-en-la-App](Supabase-en-la-App.md).

## Propias del proyecto

- **Fechas `YYYY-MM-DD` nunca pasan por `new Date()`**: se leen como medianoche UTC y en Ecuador (UTC-5) restan un día. Ya dio edades erróneas, una receta fechada el día anterior y un menor tratado como adulto. Usar `lib/edad.ts` y `lib/pdf/format.ts`.
- **Todo texto libre que llegue a un PDF pasa por `lib/texto-plano.ts`** (y en la UI por `useTextoPlano`): saltos de línea, `≥`, acentos descompuestos de Word/macOS e invisibles tumbaban `wrapText` o imprimían `?`.
- **Ningún campo del PDF es "sin límite"**: la hoja es de tamaño fijo. Todo campo se mide con `cabeEnElEspacio()` y se bloquea si no cabe ([ADR-005-limites-contenido-receta](../adr/ADR-005-limites-contenido-receta.md), [ADR-007-espacio-historial](../adr/ADR-007-espacio-historial.md)). Nunca truncar ni encoger la letra en silencio.
- **El armazón autenticado es `fixed inset-0` con un solo scroll en `<main>`**. No agregar `min-h-screen`, `h-dvh` ni un `overflow` nuevo; un panel fijo se hace con `position: sticky`. Ver [Armazon-de-Pantalla](Armazon-de-Pantalla.md).
- **Dentro de una columna, `lg:`/`xl:` mienten** (miden la ventana, no el hueco): usar container queries (`@container`).
- **Nunca usar `grep -r`, `findstr /s` ni `Select-String -Recurse` sobre el repo: no respetan `.gitignore` y leen `.env`. Usar siempre la herramienta Grep. Esto vale también para los subagentes.** Pasó el 18 de octubre de 2026: un `grep -rn` de un subagente de `/code-review` buscando los refs de los proyectos mostró líneas de `.env` con la contraseña de la base de dev, que hubo que rotar. La herramienta Grep (ripgrep) respeta `.gitignore` y las reglas `Read` de `.claude/settings.json`. Lo mismo vale para cualquier otro recorrido recursivo: `grep -R`/`--recursive`, `rg --no-ignore`/`-uu`, `Get-ChildItem -Recurse | Select-String`, `find … -exec grep`, `dir /s`. Las frena el hook `.claude/hooks/bloquear-busqueda-recursiva.mjs` ([Entornos](Entornos.md)); como mira el texto del comando, también frena un `git commit -m` o un heredoc que diga «grep -r»: en ese caso el mensaje va a un archivo y se usa `git commit -F`.
- **Si ves el aviso del hook («AVISO: el hook … está caído»), está caído y hay que revisarlo.** Un error propio (excepción, `node` no encontrado) no bloquea el comando, para no trabar la sesión; por eso el aviso es lo único que avisa que la red fina no está.
- **Los tests no construyen los datos a mano como única prueba**, y **nunca usan datos reales**: ver [Verificacion-y-CI](Verificacion-y-CI.md).

## Ver también
- [Índice](../README.md)
