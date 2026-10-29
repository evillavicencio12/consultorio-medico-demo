---
tags: [arquitectura, entornos, produccion, dev]
---

# Entornos: dev y producción

Hay **dos proyectos de Supabase**, y nada del día a día toca producción:

| | Dev | Producción |
|---|---|---|
| Proyecto | `<proyecto-dev>` | `<proyecto-produccion>` |
| Ref | `SUPABASE_REF_DEV` | `SUPABASE_REF_PRODUCCION` |
| Archivo de entorno | `.env` (raíz del repo) | `.env.produccion`, **fuera del repo** (la ruta es de cada PC y no se versiona) |
| Datos | catálogos públicos + ~20 pacientes **sintéticos** | datos clínicos reales |
| Usuario | uno de prueba | la doctora |

Los refs no están escritos en el código: `lib/entorno.ts` los lee de `SUPABASE_REF_DEV` y `SUPABASE_REF_PRODUCCION` (ver `.env.example`). Sin `SUPABASE_REF_DEV`, ninguna URL de Supabase cuenta como dev y la guarda detiene pruebas y siembra.

Los dos proyectos se configuran igual: Data API activa, «Automatically expose new tables» **desactivado** —así se comprueba que los GRANTs explícitos de las migraciones bastan, ver [Migraciones](Migraciones.md)— y «Enable automatic RLS» activado, que es lo que crea `ensure_rls` / `rls_auto_enable` ([Modelo-de-Datos](Modelo-de-Datos.md)).

## Los archivos de entorno

- **`.env` apunta a dev.** Lo cargan `npm run dev`, `next build` en local, las pruebas (`npm run test:pacientes` lo carga si existe) y los scripts con `--env-file=.env`.
- **`.env.produccion` apunta a producción, vive fuera del repo y Next no lo carga nunca solo.** Todo lo que lo usa recibe su ruta explícita: `--env-file="<ruta del .env.produccion>"` en los scripts de Node, `-EnvFile "<ruta del .env.produccion>"` en los de respaldo y `npm run entorno -- --produccion "<ruta del .env.produccion>"`. En el código no hay ruta por defecto, y los scripts de respaldo rechazan con `-Produccion` un archivo que esté dentro del repo. Next 16 solo reconoce `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.test` y sus `.local`. Por eso el nombre está en castellano: un `.env.production` lo cargarían solos `next build` y `next start`, y una compilación local quedaría apuntando a producción sin que nadie lo pidiera.
- La plantilla de los dos es `.env.example`. Ninguno se sube (`.gitignore` cubre `.env*` salvo la plantilla).
- **En Vercel los archivos no cuentan:** las variables se cargan en el panel del proyecto. Production → producción; Preview → dev.

Para comprobar a qué proyecto apunta cada archivo, sin mostrar valores:

```bash
npm run entorno                                              # .env (dev)
npm run entorno -- --produccion "<ruta del .env.produccion>"   # también producción
```

También falla si encuentra un `.env.produccion` en la raíz del repo (solo comprueba que exista; no lo lee).

### Cómo se cambió el significado de `.env`

Al principio había un solo proyecto, y `.env` apuntaba a **producción**. El cambio se hizo en un orden que no deja ventana de riesgo: primero `mv .env .env.produccion` —desde ahí no hay `.env` y cualquier script falla cerrado en vez de caer en producción—, después se creó el `.env` nuevo con las claves de dev, y `npm run entorno` confirmó los dos refs. La primera corrida de esa comprobación encontró un `.env` que todavía era la plantilla: la guarda lo trató como entorno desconocido y no dejó correr nada.

## La guarda: `lib/entorno.ts`

Los scripts no se fían del nombre del archivo que les pasaron: miran la URL que de verdad recibieron.

- **`exigirDev(motivo)`** — pruebas y siembra. Solo dev o `localhost`; cualquier otra cosa detiene el proceso **antes de conectarse**.
- **`exigirConfirmacionSiProduccion(motivo)`** — importadores de catálogos, que sí tienen uso legítimo en producción. Contra dev corren sin más; contra producción exigen, además de `--env-file="<ruta del .env.produccion>"`, la bandera **`--produccion`** escrita a mano (también en `--dry-run`: una sola regla, sin excepciones que recordar).

**La regla es doble a propósito.** Frenar solo si la URL contiene el ref de producción dejaría de funcionar en silencio si producción pasa a un dominio propio o se recrea con otro ref. Por eso la guarda también **exige** un entorno conocido: un ref que no es dev ni producción se trata como producción. Falla cerrada. `tests/entorno.test.ts` lo prueba con y sin las variables.

| Script | Guarda |
|---|---|
| `tests/pacientes.test.ts` y `tests/regla-menor-edad.test.ts` (las que tocan la base) | sin `.env` se saltan (`skip`); con `.env` comprueban `entornoDe(url) === "dev"` y fallan si no lo es, antes de tocar la base. No usan `exigirDev`: su `process.exit` tumbaría Vitest |
| `scripts/sembrar-pacientes-sinteticos.mjs` | `clienteParaScript(…, { produccion: "nunca" })` → `exigirDev` |
| `scripts/import-cie10.mjs`, `scripts/import-medicamentos.mjs` | `clienteParaScript(…, { produccion: "con-bandera" })` → `exigirConfirmacionSiProduccion` |
| `scripts/verificar-migraciones.mjs`, `scripts/verificar-bundle-sin-secretos.mjs` | ninguna: solo leen |
| El resto de suites de `tests/` | ninguna: no tocan la base, y así corren en el CI sin `.env` |

Se comprobó con la URL de producción y claves falsas (para que ni un fallo de la guarda pudiera escribir): frenaron la siembra, los dos importadores sin `--produccion`, un ref inventado, una URL de dominio propio que contiene el ref de producción, la falta de URL y la suite de pacientes antes de su bloque de base.

## Permisos de los agentes

En `.claude/settings.json` (versionado):

- **deny**: leer `.env` y cualquier `.env.*` (la regla `Read` cubre también Grep y Glob; `.env.example` se lee con `git show HEAD:.env.example`), `cat`/`head`/`grep`… sobre esos archivos, y las formas más comunes de búsqueda recursiva por Bash que no respetan `.gitignore` y leerían `.env`, escritas tal cual (`grep -r`/`-R`/`--recursive` y algunas combinaciones, `rg --no-ignore`/`-uu`, `findstr /s`, `Get-ChildItem -Recurse`, `find … -exec grep`, `xargs grep`).
- **ask**: **cualquier** comando de shell que mencione `.env.produccion`, se escriba como se escriba la bandera (`--env-file=`, `--env-file `, `--env-file-if-exists=`, con o sin `npx`).

Las reglas `deny` son una red gruesa: comparan texto, distinguen mayúsculas y no alcanzan otras grafías ni la herramienta PowerShell. La red fina es el hook `PreToolUse` `.claude/hooks/bloquear-busqueda-recursiva.mjs`, que revisa cada comando de Bash y PowerShell: búsquedas recursivas en cualquier grafía (mayúsculas, `.exe`, banderas combinadas o entre comillas, abreviaturas de `-Recurse`), globs de `rg` que se imponen a `.gitignore`, listas armadas con `find`, y la lectura directa de un `.env` (`cat`, `Get-Content`, `sls`… y los globs `.env*`/`.*`). Deja pasar `git grep` salvo con `--no-index`/`--untracked`. Su prueba es `tests/hook-busqueda-recursiva.test.ts`, que enumera lo que bloquea y lo que deja pasar. También es una red: mira el texto del comando, y una forma que no conozca pasa. Para buscar está la herramienta Grep ([Trampas-Recurrentes](Trampas-Recurrentes.md)).

En `.claude/settings.local.json` (no versionado, porque lleva rutas de cada PC) van el `deny` de `Read` y `Edit` sobre la carpeta donde vive el `.env.produccion` (en Windows, con la forma `//<unidad>/<ruta de la carpeta>/**`, por ejemplo `//d/secretos/**`) y el `ask` de cualquier comando de shell que la nombre. Se comprobó que un `Read` en esa carpeta lo rechaza la regla («denied by your permission settings»), no el «File does not exist» de un archivo que falta.

Estas reglas son una red, no la defensa: la defensa es la guarda, que mira la URL que el proceso recibió. Y no depende de acordarse de llamarla: un script obtiene su cliente de Supabase SOLO con `clienteParaScript()` (lib/entorno.ts), que aplica la guarda y después crea el cliente, y `tests/guarda-scripts.test.ts` falla si algún script de `scripts/` o `e2e/` importa `/supabase-js`, llama a `createClient` o pega a `/rest`, `/auth` o `/storage` por otro camino.

`npm run entorno` también falla si existe alguno de los archivos que Next cargaría solo por encima de `.env` (`.env.local`, `.env.development[.local]`, `.env.production[.local]`, `.env.test[.local]`): uno olvidado apuntando a producción haría que `npm run dev` se conectara ahí aunque `.env` diga dev. La app en sí no tiene guarda; ese chequeo es lo que cubre ese hueco.

## Reconstruir dev desde cero

1. Aplicar las migraciones de `supabase/migrations/` en orden (CLI de Supabase o SQL Editor de dev).
2. Catálogos: `node --env-file=.env scripts/import-cie10.mjs` y `node --env-file=.env scripts/import-medicamentos.mjs`.
3. Pacientes: `npm run sembrar:pacientes` — ~20 sintéticos con nombres "PRUEBA …" y los casos borde (sin documento, pasaporte, `otro`, menores con acompañante, cumple 18 hoy y mañana, sin fecha, sin sexo, alergia, tildes, nombre largo). Es idempotente: borra solo los "PRUEBA %" y sus consultas. Alternativa: `supabase/seed.sql`, con pacientes, consultas y recetas ficticias.
4. Comparar el esquema con producción: `supabase/huella-esquema.sql` idéntico en los dos lados.

Dos detalles de la siembra: `apply_migration` registra su propia versión en `supabase_migrations.schema_migrations` (un proyecto migrado por el SQL Editor no tiene ese registro; no afecta la huella), y un insert por lotes de PostgREST rellena con NULL las columnas que faltan en alguna fila en lugar de usar su DEFAULT, por eso la siembra usa `defaultToNull: false`. Al sembrar apareció que el CHECK de menores contaba la edad en UTC ([ADR-003](../adr/ADR-003-menor-edad-18-anos.md)).

**Ningún dato de producción se copia a dev**, ni para "probar con algo realista".

## Ver también
- [Verificacion-y-CI](Verificacion-y-CI.md)
- [Seguridad-OWASP](Seguridad-OWASP.md)
- [Migraciones](Migraciones.md)
- [Índice](../README.md)
