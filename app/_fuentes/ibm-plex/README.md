# IBM Plex (fuentes de la app)

Las carga `app/layout.tsx` con `next/font/local`. Por qué están aquí, y la comparación con la versión de Google que se usaba antes: [Sistema-de-Diseno](../../../docs/diseno/Sistema-de-Diseno.md).

## Licencia

SIL Open Font License 1.1, en [`OFL.txt`](OFL.txt), copiada sin cambios del `LICENSE.txt` de los paquetes (es igual en los dos). «Plex» es un nombre reservado (Reserved Font Name): los archivos se usan **sin modificar**. Recortarlos o convertirlos daría una versión modificada, que ya no podría llamarse así.

## Origen

Paquetes oficiales de IBM en npm (repositorio https://github.com/IBM/plex). Se descargaron con `npm pack`, no se instalan como dependencia:

| Paquete | `integrity` del registro (comprobada contra el `.tgz`) |
|---|---|
| `@ibm/plex-sans@1.1.0` | `sha512-WPgvO6Yfj2w5YbhyAr1tv95RUz4LRJlqN+CmYvBglabXteufP1D1E9BABMde+ZIKdRbFJDoKF5eQzfhpnbgZcQ==` |
| `@ibm/plex-mono@2.5.0` | `sha512-STBJIPxPomOYPmBMO7z5TKPJUotAF9u3gAUumTqVgwgrAO+K4FRNh0MlhsoJjKhJKsMbBJR10/bk4inkj/wc1w==` |

| Archivo | Ruta en el paquete | SHA-256 |
|---|---|---|
| `IBMPlexSans-Regular.woff2` | `fonts/complete/woff2/` | `ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a` |
| `IBMPlexSans-SemiBold.woff2` | `fonts/complete/woff2/` | `f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205` |
| `IBMPlexMono-Regular.woff2` | `fonts/complete/woff2/` | `ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350` |

Son los `complete` y no el corte `split/…Latin1`, porque ese no trae el espacio de cifra (U+2007) que usa `formatFechaCorta` (`lib/fechas.ts`).

## Para actualizarlas

1. `npm pack @ibm/plex-sans@<versión>` (o `plex-mono`) en una carpeta temporal, fuera del repositorio.
2. Comprobar que el `.tgz` coincide con `npm view @ibm/plex-sans@<versión> dist.integrity`.
3. Copiar los mismos tres archivos de `fonts/complete/woff2/` y el `LICENSE.txt` como `OFL.txt`.
4. Actualizar las tablas de arriba.
5. Repetir la comparación visual descrita en Sistema-de-Diseno.md.
