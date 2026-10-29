---
tags: [modulo, auth]
---

# Módulo 1 — Autenticación

Login con usuario y contraseña, **exclusivo para la doctora**. Único tipo de usuario en todo el sistema — no hay perfil de personal administrativo en esta versión.

- Delegado a Supabase Auth (JWT, expiración de sesión, protección contra fuerza bruta).
- No hay registro público ni recuperación pensada para múltiples roles.
- Se asume un solo usuario concurrente; no hay lógica de permisos por rol.
- Si la doctora pierde la contraseña se restablecerá manualmente desde el panel de Supabase cuando lo necesite

## Implementación (Fase 1)

| Pieza | Archivo |
|---|---|
| Pantalla de login | `app/login/page.tsx` + `formulario.tsx` |
| Inicio y cierre de sesión | `app/login/acciones.ts` (Server Actions) |
| Protección de rutas y refresco de sesión | `proxy.ts` en la raíz |

**`proxy.ts`, no `middleware.ts`.** La convención `middleware` quedó deprecada
en Next.js 16 y se renombró a `proxy`; misma funcionalidad, otro nombre de
archivo y de export.

**Toda página que no sea `/login` exige sesión.** La única petición que el
proxy deja pasar sin sesión es el `POST` de una Server Action (cabecera
`next-action`): la acción se protege sola con `clienteConSesion()` y responde
"la sesión caducó" sin que la pantalla pierda lo escrito — el modelo completo
está en [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md). El proxy guarda en `?volverA=` la
ruta que se intentó abrir para devolver ahí después de entrar, y solo acepta
rutas internas — un `volverA` absoluto convertiría el login en trampolín de
phishing.

**Se valida con `getUser()`, no con `getSession()`.** `getSession()` lee la
cookie sin verificarla, así que una cookie manipulada pasaría; `getUser()` la
comprueba contra el servidor de Supabase.

> [!warning] `getUser()` cuesta ~350-470 ms por petición, y es a sabiendas
> Esa comprobación es una llamada de red al servidor de auth de Supabase, y
> corre en **todas** las peticiones, no solo en las navegaciones. Medido el 21
> de agosto de 2026 en el listado de pacientes: `proxy.ts` 356-470 ms frente a
> 218-260 ms de todo el código de la aplicación (las consultas a la base
> incluidas). O sea: **el cuello de botella de la app es verificar la sesión, no
> leer los datos.** La medición completa está en
> [02-Gestion-Pacientes](02-Gestion-Pacientes.md).
>
> Se deja así. Cambiarlo por `getSession()` sería exactamente la regresión de
> seguridad que el párrafo de arriba describe, y ~1 s encaja con el uso real
> (la doctora abre una pantalla al empezar la consulta, no navega en bucle).
> Si algún día molesta, la salida NO es tocar `getUser()`: es sacar del
> servidor las pantallas que navegan a cada tecla — ver la nota del listado.
>
> **Tampoco se salta en los `POST` de Server Actions**, aunque la acción vuelva
> a llamar a `getUser()`. Se probó en el Paso 4: ahorraba ~125 ms por búsqueda,
> pero la renovación y el borrado de las cookies pasaban a la acción, y una
> acción que escribe cookies hace que Next vuelva a renderizar la página; con
> la sesión revocada, ese render sin sesión terminaba en `notFound()` y se
> perdía la consulta. Se revirtió; el caso completo y las mediciones están en
> [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md).

**El error de credenciales es uno solo**, igual para correo inexistente que para
contraseña incorrecta: distinguirlos permitiría averiguar qué correos tienen
cuenta (ver [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md)).

**Sin pantalla de recuperación de contraseña**, coherente con lo de arriba. El
diseño de Stitch traía un enlace "¿Olvidó su clave?"; se quitó, porque no lleva
a ningún lado.

## Ver también
- [Seguridad-OWASP](../arquitectura/Seguridad-OWASP.md)
- [Stack-Tecnologico](../arquitectura/Stack-Tecnologico.md)
- [Índice](../README.md)
