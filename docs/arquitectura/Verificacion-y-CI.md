---
tags: [arquitectura, verificacion, ci]
---

# Verificación y CI

## Producción: nunca escribir sin confirmar

Producción guarda datos clínicos reales. Cualquier escritura —un INSERT, un upsert, un script de importación, una migración— se **propone y espera confirmación explícita** antes de ejecutarse, aunque sea idempotente.

- Si un `--dry-run` o una protección falla a mitad de implementarse, **se detiene y se avisa**; nunca se deja correr la versión que escribe por defecto.
- Las migraciones se entregan como SQL y se aplican a mano ([Migraciones](Migraciones.md)).
- **Las pruebas van contra dev, no contra producción** ([Entornos](Entornos.md)): `.env` apunta a dev y la guarda de `lib/entorno.ts` corta cualquier prueba o siembra que reciba otra URL.

## Cómo se verifica aquí

`tsc`, `eslint` y `next build` en verde **no prueban nada por sí solos**: el proxy que dejaba rutas públicas y el doble scroll del armazón pasaban los tres. Se verifica ejecutando —servidor levantado, sesión real, PDF generado y su texto extraído— y se reporta qué se comprobó y qué no se pudo comprobar.

- **Los tests no construyen los datos a mano como única prueba**: los bugs de `leerFormulario` y de zona horaria solo aparecían con el `FormData` real del navegador.
- **Ningún dato real de pacientes ni del usuario en pruebas**: documentos sintéticos generados con el algoritmo de la cédula y nombres obviamente ficticios.

### Prueba E2E con Playwright (opcional, en local)

`npm run test:e2e` recorre el flujo completo en Chromium, **contra dev**:

1. Entra con el usuario de prueba (`USUARIO_PRUEBA_CORREO` / `USUARIO_PRUEBA_CLAVE` en `.env`).
2. Registra un paciente ficticio `PRUEBA E2E <marca>` con una cédula sintética válida (`digitoVerificador`).
3. Abre una consulta, elige un código CIE-10 del buscador y un medicamento del catálogo, y guarda.
4. Abre la receta: la vista previa es un `<iframe src="blob:…">` dentro de un `<dialog>`; la prueba lee esos bytes con `fetch` en la página y extrae el texto con pdfjs. Exige el nombre del paciente, el nombre genérico del medicamento y la fecha de **hoy en Ecuador** como secuencia contigua «día Mes aa» (un número suelto no prueba nada: la receta ya trae varios). Acepta el día de antes o de después de guardar, por si la corrida cruza la medianoche.

- **La guarda va antes de todo**: `playwright.config.ts` llama a `exigirDev` (`lib/entorno.ts`) al cargarse, antes de que Playwright levante el servidor (un `globalSetup` correría después del `webServer` y dejaría un `next dev` huérfano conectado al proyecto equivocado).
- **Y se comprueba el servidor, no solo el `.env`**: `reuseExistingServer` acepta cualquier `next dev` en :3000, que pudo levantarse con otro entorno. Tras entrar, `e2e/sesion.ts` exige que la cookie de sesión sea `sb-<SUPABASE_REF_DEV>-auth-token` —el ref lo pone el servidor— antes de crear nada. `verificar:sesion-revocada` hace lo mismo antes de su `signOut` global.
- **La limpieza va en `afterAll` y corre aunque la prueba falle**: borra la consulta (sus medicamentos caen en cascada) y el paciente, con la clave de servicio de dev vía `clienteParaScript`, y se niega a borrar un paciente cuyo nombre no empiece por `PRUEBA E2E `.
- **Consume un número del correlativo de recetas de dev** por corrida (aceptado; [ADR-002](../adr/ADR-002-numero-receta-global.md): una secuencia no retrocede).
- **Sin trace**: guardaría el `fill` de la clave del usuario de prueba y las cookies de sesión.
- `tests/guarda-scripts.test.ts` revisa `e2e/` además de `scripts/`: nada de ahí llega a Supabase sin `clienteParaScript`.
- **No va al CI**: necesita un proyecto de Supabase, el usuario de prueba y escribir en dev. Correrla en el CI con Supabase local en Docker queda como trabajo futuro.

Junto a ella, con `npm run dev` levantado, `npm run verificar:sesion-revocada` comprueba la sesión revocada a mitad de una consulta ([Seguridad-OWASP](Seguridad-OWASP.md)).

## CI en GitHub Actions

**`.github/workflows/ci.yml`** corre en cada `pull_request` y en cada `push` a `master`, y es el check que exige la protección de `master`. Un job, `verificar`, con `permissions: contents: read` y las actions fijadas por SHA (verificado contra el tag oficial). La versión de Node sale de `engines.node` (`24.x`).

**No usa ningún secreto.** Sin `.env`, el build no necesita claves y las pruebas contra dev se saltan solas. Los valores `centinela-ci-…` del `env` del job son falsos a propósito, cebos para `verificar:bundle` ([Seguridad-OWASP](Seguridad-OWASP.md)).

Los pasos, en orden:

- `npm ci`, y enseguida **`npm audit --omit=dev --audit-level=high`**, para fallar antes del build: un aviso alto o crítico en lo que llega a producción bloquea; los de la cadena de lint (solo desarrollo) son un riesgo aceptado ([Seguridad-OWASP](Seguridad-OWASP.md)).
- `npm run lint`.
- **`npx next typegen` y `npx tsc --noEmit`**: `LayoutProps`, `PageProps` y compañía los genera Next; sin `typegen`, tsc falla en un checkout limpio.
- `npm test` (Vitest). Sin `.env` las pruebas contra dev quedan `skipped`, ninguna falla. Dentro van `test:hoy` (proyecto con `TZ=UTC`) y `test:menor-edad` (PGlite: Postgres en WebAssembly, sin servidor).
- **`next build` + `npm run verificar:rutas`** (`scripts/verificar-rutas-dinamicas.mjs`): lee `.next/prerender-manifest.json` y falla si sale estática cualquier ruta que **no** esté en la lista de las que pueden serlo. Es una lista de permitidas a propósito: las páginas con datos de pacientes tienen que ser dinámicas, y que una pueda ser estática se decide agregándola ahí. Ver [Trampas-Recurrentes](Trampas-Recurrentes.md).
- **`npm run verificar:bundle`**: ningún secreto (ni centinela) en lo que llega al navegador ([Seguridad-OWASP](Seguridad-OWASP.md)).
- `npm run verificar:enlaces`.

### Protección de `master`

Un ruleset sobre `master` **sin bypass para administradores**: PR obligatorio, el check `verificar` del CI en verde, sin force-push y sin borrado. Todo entra por rama y PR.

### Dependabot (`.github/dependabot.yml`)

Semanal, para `npm` y `github-actions`. Sus PR pasan por el CI.

En la demo pública las actualizaciones de versión están apagadas con `open-pull-requests-limit: 0` en las dos entradas: la demo es una foto fija del repo privado. El archivo se conserva igual al del privado en todo lo demás. Las alertas y actualizaciones de seguridad se manejan desde Settings; ese límite no las afecta.

- **Agrupado**: un PR con lo menor y los parches de producción, otro con los de desarrollo, otro con las actions.
- **Juntos, con mayor incluida, también en las actualizaciones de seguridad**: `next` + `eslint-config-next` (separados rompen el lint) y `react` + `react-dom` + sus tipos (react-dom exige su misma versión de react).
- **Solos, para revisarlos a mano**: las versiones mayores fuera de esos dos grupos, las mayores de actions y `@supabase/ssr` y `server-only`, que están en 0.x —ahí Dependabot llama "menor" a un salto que puede romper, y `@supabase/ssr` toca la sesión—.
- **`cooldown`**: no propone versiones con menos de 7 días publicadas (14 si es mayor): es la ventana que aprovechan los paquetes comprometidos.
- **Ignora las mayores de `@types/node`**: el runtime está fijo en Node 24 (`engines.node`).
- **Ignora ESLint 10 y posteriores** mientras tres plugins de `eslint-config-next` (`eslint-plugin-react`, `eslint-plugin-jsx-a11y`, `eslint-plugin-import`) no declaren soporte: npm los instalaría forzados (`ERESOLVE overriding peer dependency`) y el lint es un paso obligatorio del CI. Se reactiva cuando `npm install -D eslint@latest` no dé ningún aviso de ese tipo, comparando antes las reglas activas y los avisos de un archivo con violaciones a propósito de cada plugin en las dos versiones.

## Ver también
- [Seguridad-OWASP](Seguridad-OWASP.md)
- [Trampas-Recurrentes](Trampas-Recurrentes.md)
- [Índice](../README.md)
