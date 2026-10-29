---
tags: [arquitectura, seguridad, owasp]
---

# Seguridad Arquitectónica (OWASP Top 10)

| Riesgo | Mitigación |
|---|---|
| 1. Fallas en Control de Acceso | RLS en Supabase: solo la doctora autenticada lee/escribe pacientes, consultas y recetas. Además, **toda Server Action verifica la sesión dentro de sí misma** — ver la regla más abajo: `proxy.ts` protege rutas, no acciones. |
| 2. Fallas Criptográficas | HTTPS/TLS 1.2+ en todo el tráfico. Contraseñas con bcrypt/argon2. |
| 3. Inyección | Supabase (PostgREST) + TypeScript tipado; consultas parametrizadas por defecto. |
| 4. Diseño Inseguro | Datos importados de Sheets se validan antes de insertar; nunca se confía ciegamente en el formato de origen. |
| 5. Config. de Seguridad Incorrecta | Service Account (JWT) sin exponer al público. `.env` nunca al repositorio. |
| 6. Componentes Vulnerables | `npm audit` periódico. |
| 7. Identificación y Autenticación | Delegado a Supabase Auth. |
| 8. Integridad del Software y Datos | TypeScript en compilación; importación de catálogos validada antes de guardar. |
| 9. Registro y Monitoreo | Logs de Vercel y Supabase: logins, peticiones fallidas, errores. |
| 10. SSRF | Server Actions/API Routes solo hablan con Supabase y la API oficial de Google. |

## Nota crítica sobre claves
La clave pública (`anon`) de Supabase **sí** puede verse en DevTools del navegador — su seguridad depende de RLS, no de estar oculta. Lo que **nunca** debe aparecer ahí: la clave privada del Service Account de Google, ni ninguna clave de rol de servicio de Supabase. Si aparecen, es un error de configuración (variable con prefijo `NEXT_PUBLIC_` mal usada). Esas claves viven solo del lado del servidor.

Eso dejó de depender de que alguien lo recuerde:

```
npm run build
npm run verificar:bundle    # scripts/verificar-bundle-sin-secretos.mjs
```

Busca los **valores** de los secretos del `.env` —no sus nombres, que pueden salir en un mensaje de error sin significar nada— en todo lo que llega al navegador: `.next/static` y lo prerenderizado (`.next/server/app/**/*.{html,rsc,body}`, donde quedaría un secreto que un Server Component pasara como prop a uno de cliente). Sale con código 1 si encuentra alguno.

Qué caza y qué no: caza un secreto que Next **copia** al navegador —renombrado a `NEXT_PUBLIC_…`, pasado por `env:` en `next.config.ts`, o metido en una prop de una página prerenderizada—. No caza importar un módulo de servidor desde un componente de cliente (Next no copia el valor: queda `undefined`); eso lo frena `server-only` al compilar.

**Sin `.env`, en el CI**, no hay secretos que buscar, y un "no encontré nada" sin haber buscado sería un falso verde. Por eso (Paso 5):

- El script exige un valor por cada uno de **tres grupos**: una clave de Supabase (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`), la Service Account descifrable (con `client_email` y `private_key`) y el ID del Sheet de medicamentos. Si falta alguno, falla listándolos.
- Busca también cada secreto con el prefijo `NEXT_PUBLIC_` delante, si existe, y descifra también esa variante de la Service Account.
- De la clave privada busca la **segunda línea** del cuerpo base64: la primera es casi toda cabecera ASN.1, igual en todas las claves RSA, y una línea entera no tiene saltos, así que aparece igual en texto que escapada (`\n`) dentro de un literal de JavaScript.
- El CI le da al build **centinelas**: valores falsos y marcados (`centinela-ci-…`), con y sin el prefijo, escritos una sola vez en el `env` del job de `.github/workflows/ci.yml`. No son secretos; si alguno aparece, el paso falla.
- Por eso `verificar:bundle` usa `--env-file-if-exists=.env` y no `--env-file=.env`: en local lee el `.env`; en el CI, los centinelas del entorno.

Comprobado con mutaciones: sin centinelas falla listando los tres grupos; con uno de menos, lo nombra; dan `FUGA` un bundle con el centinela de `NEXT_PUBLIC_SUPABASE_SECRET_KEY`, un HTML prerenderizado con el del Sheet y la clave escapada en un literal JS (que la versión anterior, que buscaba el comienzo de la clave con saltos reales, daba por limpia).

El script se escribió en la Fase 5, cuando la pantalla de Configuración puso por primera vez un componente de cliente al lado del código que descifra la clave de la Service Account ([07-Configuracion](../modulos/07-Configuracion.md)).

## Dependencias: riesgo aceptado

Al 16 de octubre de 2026, `npm audit` reporta **5 vulnerabilidades altas**, todas en la cadena de lint de `eslint-config-next` (`@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`). Se aceptan:

- **Son solo de desarrollo**: corren cuando se ejecuta el lint, sobre el código del propio repositorio, nunca sobre entrada de un usuario.
- **No llegan al bundle** ni al servidor: `npm audit --omit=dev` da 0 vulnerabilidades.
- **El arreglo que propone npm es bajar `eslint-config-next` a la 14**, una versión mayor atrás de `next` 16: rompería el lint y no corresponde. Se revisa en cada actualización de `next` / `eslint-config-next`.

La crítica que sí afectaba (`next` 16.3.1, RCE en servidores Windows, que es donde corre `npm run dev`) se corrigió subiendo a 16.4.2.

## Secretos

- Las claves de Service Account (Google) y de rol de servicio (Supabase) **nunca** llevan el prefijo `NEXT_PUBLIC_` ni se exponen al cliente.
- `credenciales.json` (Service Account de Google) vive **fuera del repositorio**, un nivel arriba de esta carpeta. Ningún script lo lee del disco: se carga en `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` dentro de `.env`. No volver a meterlo en el repo.
- Las variables de entorno están documentadas en `.env.example` (plantilla sin valores, sí versionada). Hay dos archivos reales y ninguno se sube: `.env` (dev) y `.env.produccion` (producción, que Next nunca carga solo y vive fuera del repo). Los scripts se corren con `node --env-file=.env scripts/<script>.mjs`; contra producción, con `--env-file="<ruta del .env.produccion>"` y la guarda de `lib/entorno.ts` de por medio — ver [Entornos](Entornos.md). No existe `.env.local` en este proyecto.
- `.gitignore` ya cubre `.env*` (con excepción para `.env.example`), `credenciales.json` y `node_modules/`.
- **Ningún dato identificable de pacientes entra al repositorio** — ni en código, ni en documentación, ni en CSVs, ni en los **metadatos** de un PDF. Antes de commitear una plantilla PDF hay que revisar su `/Title`, `/Author`, `/Subject`, `/Keywords` y `/Creator`: exportar desde Google Docs o Word arrastra ahí el nombre del archivo original. Ya pasó una vez; ver la migración inicial de datos.

## Cabeceras de seguridad (`next.config.ts`, Paso 5)

| Cabecera | Valor | Por qué |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Que el navegador no adivine tipos de archivo |
| `X-Frame-Options` | `DENY` | Que ningún sitio enmarque la app. `DENY` y no `SAMEORIGIN`: el único `<iframe>` de la app (`app/(app)/vista-previa-pdf.tsx`) carga un `blob:` con el PDF, nunca una página del sitio, y un blob no recibe cabeceras |
| `Referrer-Policy` | `same-origin` | Las URLs llevan el id del paciente: no salen del sitio |
| `Permissions-Policy` | cámara, micrófono, geolocalización, USB, pagos y `browsing-topics` desactivados | La app no usa ninguno |
| `Cross-Origin-Opener-Policy` | `same-origin` | Aísla la ventana de otras pestañas de otro origen |
| `Strict-Transport-Security` | `max-age=63072000`; **solo en producción** | Solo HTTPS. En desarrollo no: fijaría HSTS a `localhost`. Sin `preload` ni `includeSubDomains` hasta decidir el dominio (Fase 6) |
| `Content-Security-Policy-Report-Only` | ver abajo; **solo en producción** | Observar antes de aplicar |

También `poweredByHeader: false`: sin `X-Powered-By: Next.js`.

**Por qué la CSP empieza en Report-Only.** Next mete scripts en línea en cada página (la carga de RSC, `self.__next_f.push(…)`) y la app usa `style={…}` en los desplegables. Una CSP aplicada sin `'unsafe-inline'` ni nonce rompería la hidratación: la doctora vería la app muerta. Report-Only la deja funcionar y registra lo que se habría bloqueado. No va en desarrollo (React necesita `eval`). Sin `report-uri`: un servicio externo de reportes recibiría URLs con el id de pacientes.

La política vive en `next.config.ts` (la constante `CSP`, con el porqué de cada directiva al lado); aquí no se copia, para que no haya dos versiones. Lo esencial: todo `'self'`; `'unsafe-inline'` solo en estilos; `blob:` en `frame-src` e `img-src` por la vista previa del PDF; `connect-src 'self'`, porque el navegador nunca habla con Supabase ni con Google; `object-src 'none'`. `font-src 'self'` sin excepciones, porque IBM Plex está en el repositorio (`app/_fuentes/ibm-plex/`) y `next/font/local` la sirve desde `/_next/static/media`: ni el navegador ni el build hablan con Google Fonts. Comprobado el 17 de octubre de 2026 con `next build && next start`: ninguna petición del navegador fuera del sitio y ninguna violación de `font-src`. El build compila con la red cortada (`HTTPS_PROXY` hacia un puerto muerto), mientras que con `next/font/google` fallaba ([Sistema-de-Diseno](../diseno/Sistema-de-Diseno.md)).

**Lo observado** (16 de octubre de 2026, `next build && next start` contra dev):

- La E2E recoge las violaciones de la página y de cada marco: **solo los scripts en línea de Next** contra `script-src 'self'`. Nada más.
- **`object-src 'none'` no bloquea el visor de PDF.** Un documento `blob:` hereda la CSP de quien lo crea, y el visor de Chrome es un complemento: había que comprobarlo. Con Chromium **con interfaz**, la vista previa carga el visor (`chrome-extension://…`) dentro del marco `blob:` y no aparece ninguna violación de `object-src` ni de `frame-src`. Sin interfaz (headless) Chromium no tiene visor y descarga el PDF; la E2E acepta las dos cosas como prueba de que la navegación del marco no se bloqueó.
- `X-Frame-Options: DENY` no toca la vista previa: ningún rechazo de marco, con o sin interfaz. La E2E falla si el navegador se niega a mostrar un marco.

**Para pasarla a aplicada**, lo que falta es exactamente lo observado: los scripts en línea de Next. La salida correcta es un **nonce** por petición, generado en `proxy.ts` y puesto en la CSP (las tres páginas estáticas pasarían a dinámicas; las de pacientes ya lo son). La alternativa, `'unsafe-inline'`, deja la CSP casi sin valor contra XSS. Pendiente de decidir.

## Regla: toda Server Action verifica la sesión dentro de sí misma

Aplica al riesgo 1 de la tabla (Fallas en Control de Acceso) y es **regla general del proyecto**, no de una pantalla: vale para toda Server Action nueva, en cualquier fase futura.

`proxy.ts` protege **rutas**. Una Server Action es un endpoint POST propio, con su identificador, y **se ejecuta desde cualquier ruta que incluya su módulo**. Que la pantalla que la muestra esté detrás del proxy no dice nada sobre quién puede dispararla.

Comprobado en la Fase 5, no deducido: la acción de la pantalla de Configuración se disparó por POST **contra `/pacientes`** y se ejecutó igual. Contra `/login` —ruta pública— devolvió `{}` porque Next no resolvió la acción en el grafo de esa ruta, pero eso es una propiedad del *build*: bastaría que un layout compartido importara el módulo de acciones para perderla. La documentación de Next lo dice sin rodeos: *«you should still treat Server Actions as reachable via direct POST requests and verify authentication and authorization inside each one»* (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`). La ofuscación del identificador es ruido añadido, no la defensa.

```ts
// lib/supabase/sesion.ts — la misma verificación para todas las acciones
const supabase = await clienteConSesion();
if (!supabase) return { ok: false, mensaje: SESION_CADUCADA };
```

- **`getUser()`, nunca `getSession()`.** getSession lee la cookie sin validarla: una cookie manipulada pasaría. Es la diferencia entre comprobar la sesión y creerle, y es la misma decisión —con su coste medido, 356-470 ms— que documenta `proxy.ts`.
- **Aplica aunque la acción use `lib/supabase/server.ts`** y RLS ya la cubra. RLS es la red de abajo, no el control de acceso de la aplicación: sin la comprobación, una petición anónima viaja hasta Postgres y vuelve como error genérico en vez de como rechazo con sentido.
- **Aplica con más razón si la acción toca `lib/supabase/admin.ts`**, que salta RLS: ahí no hay red de abajo.
- **Vale también para los route handlers** (`app/**/route.ts`; hoy no hay ninguno): el que se agregue verifica la sesión por su cuenta con `getUser()` y no confía en `proxy.ts`. El proxy deja pasar sin sesión cualquier `POST` con cabecera `next-action` —ver más abajo—, esa cabecera la puede poner cualquiera, y un route handler no tiene `clienteConSesion()` detrás por defecto. Si aparece el primero, `tests/sesion-acciones.test.ts` tiene que revisarlo también.
- Excepciones legítimas, las dos únicas: `iniciarSesion`, cuyo trabajo *es* autenticar, y `cerrarSesion`, que solo cierra la sesión que haya (sin sesión, `signOut()` no tiene nada que leer ni escribir). Están anotadas, con su motivo, en `tests/sesion-acciones.test.ts`; una tercera exige anotarla allí y aquí.

**Estado: las 7 Server Actions cumplen la regla** (Paso 4, 16 de octubre de 2026), todas con la misma función `clienteConSesion()` de `lib/supabase/sesion.ts` y el mismo texto `SESION_CADUCADA`: `crearPaciente`, `actualizarPaciente`, `guardarConsultaAccion`, `buscarCie10Accion`, `buscarMedicamentosAccion`, `previsualizarImportacion` y `confirmarImportacion`. Las dos búsquedas, sin sesión, devuelven la lista vacía con el mensaje, y el buscador lo muestra en lugar de "no hay coincidencias" (antes RLS daba la lista vacía sin explicación). Excepción legítima: `iniciarSesion`; `cerrarSesion` solo cierra la sesión que haya.

### El modelo: tres capas, cada una con su trabajo

| Capa | Protege | Sin sesión |
|---|---|---|
| `proxy.ts` | **Páginas** | Redirige al login (307), salvo el `POST` con cabecera `next-action`, que pasa sin propagar el borrado de las cookies |
| `clienteConSesion()` dentro de cada Server Action | **Acciones** | Responde `SESION_CADUCADA` sin leer ni escribir nada, ni el borrado de las cookies |
| RLS en Postgres | **Datos** | La última capa: si las dos de arriba fallaran, una petición anónima no ve ni escribe filas |

**Por qué el proxy deja pasar las acciones** (Paso 4, 16 de octubre de 2026). Hasta entonces también las redirigía, y se comprobó en Chromium contra dev lo que eso le hacía a la doctora con la sesión caducada a mitad de una consulta: el `fetch` de la acción seguía el 307, recibía el HTML del login, el cliente de Next lanzaba, y la pantalla decía *«No se pudo consultar el catálogo… la consulta se puede registrar igual»* o *«Revisa la conexión»*. Las dos cosas falsas. La redirección no protegía nada que la acción no protegiera ya, y escondía el único mensaje útil. Ahora la acción responde `SESION_CADUCADA`, el buscador y el guardado lo muestran como error (rojo, `role="alert"`) y el formulario conserva lo escrito. El texto dice dónde volver a entrar —en **otra pestaña**—, porque navegar al login desde la consulta perdería lo escrito (no hay borrador); la cookie nueva vale también para la pestaña de la consulta, y basta con volver a intentarlo. Verificado en Chromium contra dev.

La excepción es exactamente esa y no más ancha: **solo `POST` y solo con la cabecera `next-action`**. Un `GET` con la cabecera, o un `POST` sin ella, se redirigen como siempre (`tests/proxy.test.ts`). Que la cabecera la pueda poner cualquiera no importa: lo único que abre es la acción, y la acción verifica.

### Sesión revocada: ningún borrado de cookies en la respuesta de una acción

**El caso** (lo encontró la revisión del Paso 4, 16 de octubre de 2026): la doctora tiene una consulta a medio escribir y su sesión se **revoca** —cerró sesión en otra pestaña; `signOut()` es global—. Al buscar en CIE-10, `getUser()` descubre la sesión muerta y auth-js pide **borrar** las cookies. Si ese borrado viaja en la respuesta de la Server Action, Next vuelve a renderizar la página, ya sin sesión: RLS oculta al paciente, la página llama a `notFound()` y la consulta, con lo escrito, se convierte en un 404.

Comprobado en Chromium contra dev, y comprobado también **cuándo apareció**: con el `proxy.ts` anterior al bloque 3 la acción recibía un 307 sin cookies (aviso falso de "catálogo caído", pero sin 404 y con lo escrito); desde el bloque 3, el POST pasaba con el borrado que el proxy había puesto en `respuesta`, y terminaba en 404. La verificación del bloque 3 no lo vio porque borraba las cookies a mano: sin cookies no hay nada que borrar y no hay `Set-Cookie`.

**El arreglo, en dos capas:**

- **`proxy.ts`**: el `POST` con `next-action` sin usuario válido sigue con `NextResponse.next()`: ni la `respuesta` con el borrado, ni la petición con las cookies ya vaciadas por su `setAll` (con `{ request }` Next reenviaría esas cookies reescritas, y la acción no vería nunca la sesión revocada).
- **`clienteConSesion()`** (`lib/supabase/sesion.ts`): las cookies que `getUser()` quiera escribir se **acumulan** y se deciden al final. Con usuario se escriben todas (la renovación tiene que seguir funcionando aunque ocurra en la acción); sin usuario se **descartan los borrados**. Si una escritura fallara, deja un `console.warn` con los nombres de las cookies, nunca su valor; solo en este contexto, el de las acciones, donde no poder escribir sería una anomalía (en un Server Component es lo normal, y ahí el `catch` de `lib/supabase/server.ts` calla).
- **Solo los borrados** (`esBorrado()` en `lib/supabase/cookies.ts`: valor vacío o `maxAge` 0), en las dos capas. Una **renovación** que salió bien y después falló `/user` (por la red, por ejemplo) se propaga y se escribe igual: tirarla dejaría en el navegador un refresh token que Supabase ya consumió.

Las cookies revocadas se borran en la **siguiente navegación**: el `GET` se redirige al login y el proxy, en `/login`, las borra.

**Verificación permanente**, con `npm run dev` levantado: `npm run verificar:sesion-revocada` (`scripts/verificar-sesion-revocada.mjs`, solo contra dev). Exige el aviso de sesión caducada, ningún 404, lo escrito intacto, ningún `Set-Cookie` de `sb-` en la respuesta de la acción, y que el `GET /pacientes` siguiente termine en el login con las cookies borradas. Mutaciones comprobadas: si `clienteConSesion()` escribe sin acumular, falla (`Set-Cookie`, 404, se pierde lo escrito); si el proxy devuelve `respuesta`, falla igual, y además `tests/proxy.test.ts`, que también falla si el proxy deja de filtrar los borrados. La lógica de acumular, descartar borrados y escribir renovaciones tiene su prueba unitaria en `tests/cliente-con-sesion.test.ts`. El script exige una app local (`BASE_URL` en `localhost`) y usa el paciente sintético «PRUEBA ADULTO COMPLETO UNO».

**Lo que este arreglo no cubre** (señalado por la revisión, aceptado por ahora):

- **La causa de fondo** es que la página de consulta trata "sin sesión" igual que "el paciente no existe" y llama a `notFound()`. Cualquier otro render sin sesión —una acción futura que use `crearClienteServidor()` directamente y escriba cookies, un `router.refresh()`— volvería a perder lo escrito. La defensa de fondo es el borrador (abajo).
- **Con la sesión revocada, cada búsqueda repite dos llamadas fallidas a Supabase Auth** (la del proxy y la de la acción) hasta que haya una navegación, porque ya nadie borra las cookies en esas respuestas. La doctora ve el aviso y vuelve a entrar; con el reposo del buscador son pocas llamadas, pero cuentan para el límite de Auth.

**Idea para después, no implementada:** un borrador del formulario de consulta en `sessionStorage` protegería lo escrito ante este y cualquier otro fallo. Deja datos clínicos en el navegador de la doctora, así que es una decisión de privacidad que se toma aparte.

### Por qué el proxy no se salta `getUser()` en las acciones

Se probó (Paso 4): la acción ya llama a `getUser()`, y el del proxy es un segundo viaje a Supabase Auth en serie en cada búsqueda del autocompletado. Quitarlo ahorraba **unos 125 ms por búsqueda** (~15 %), medido con `next build && next start` contra dev, 30 búsquedas por ronda desde el navegador:

| | Mediana | p90 |
|---|---|---|
| Proxy con `getUser()` (4 rondas) | 842–878 ms | 862–973 ms |
| Proxy sin `getUser()` en las acciones (4 rondas) | 715–735 ms | 765–791 ms |

Se revirtió, porque entonces la renovación y el borrado de las cookies pasaban a hacerse **dentro de la acción**, y una acción que escribe cookies hace que Next vuelva a renderizar la página: con la sesión revocada, ese render sin sesión terminaba en `notFound()` y la consulta se perdía (comprobado en Chromium); con el token simplemente caducado, la página se volvía a renderizar una vez por hora, un costo que la medición no incluía. 125 ms no pagan ese riesgo. `tests/proxy.test.ts` exige que el proxy llame a `getUser()` también en los `POST` de acciones, para que nadie lo quite sin pasar por aquí.

La renovación con el proxy actual está comprobada en Chromium contra dev, forzando la caducidad con `expires_at` en el pasado dentro de la cookie (auth-js decide por ese campo, así que se ejercita el refresh token real): una búsqueda con el token caducado trae `Set-Cookie`, refresh token nuevo y `expires_at` futuro; tres búsquedas a la vez, también; y en los dos casos, tras esperar 15 s (más que el intervalo de reutilización de 10 s), caducar otra vez y buscar, vuelve a renovar y `/pacientes` no redirige. Dato útil si algo así vuelve a fallar: Supabase, si se usa el padre del refresh token activo, devuelve el activo (guía *User sessions*, «refresh token reuse detection»), así que una cookie que no se llegó a guardar no mata la sesión: la deja sin actualizar.

### Cómo se prueba la regla

`tests/sesion-acciones.test.ts` **descubre solo** todas las acciones: recorre el proyecto, encuentra los archivos `"use server"` e importa cada exportación. Sin sesión, cada una tiene que responder `SESION_CADUCADA` sin tocar nada del cliente salvo `auth.getUser` (ni `from()`, ni `rpc()`, ni `storage`, ni otro método de `auth`), ni el cliente admin, ni el Sheet, ni `fetch`, ni `revalidatePath` o `redirect` —estos dos harían que Next renderizara la página protegida para una petición anónima—; con sesión, tiene que pasar la verificación (esa parte va con una lista explícita de argumentos, que tiene que coincidir con lo descubierto). Una acción nueva entra en la prueba sin que nadie la anote, y una sin verificación la hace fallar; el detector se prueba a sí mismo con tres ejemplos malos (`tests/fixtures/accion-sin-verificacion.ts`): sin verificación, con `revalidatePath` antes y con `storage` antes. También falla si alguien escribe `"use server"` dentro de una función, porque esa acción escaparía al barrido. Las únicas excepciones, con su motivo en el test, son `iniciarSesion` y `cerrarSesion`.

El caso completo, con la tabla de pruebas, está en [07-Configuracion](../modulos/07-Configuracion.md).

## Ver también
- [Supabase-en-la-App](Supabase-en-la-App.md) — los tres clientes y cuál salta RLS
- [Stack-Tecnologico](Stack-Tecnologico.md)
- [Índice](../README.md)
