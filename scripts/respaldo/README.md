# Respaldo de la base

Respaldo diario, cifrado, de la base de Supabase, con prueba de restauración. **Es obligatorio en cualquier plan de Supabase.** Si se contrata Pro (pendiente, [ADR-004](../../docs/adr/ADR-004-plan-supabase-pro.md)), sus backups diarios son una capa extra: viven dentro de Supabase, en la misma cuenta. Estos quedan en una carpeta tuya, fuera de Supabase, y se pueden restaurar en otro proyecto.

| Archivo | Qué hace |
|---|---|
| `respaldar.ps1` | `pg_dump` → cifrado con age → `-Destino`, con retención y log |
| `restaurar-prueba.ps1` | descifra un respaldo, lo restaura en la base `prueba_restauracion` de **dev** y compara los conteos de filas |
| `programar.ps1` | registra (o quita) la tarea diaria en el Programador de tareas |
| `llave-publica.txt` | la llave **pública** de age. La privada nunca va en el repositorio |
| `comun.ps1` | lo que comparten los scripts (lectura de la URL, ocultar secretos, procesos) |

## Requisitos

- **PowerShell 5.1**, el de Windows. No usa módulos externos.
- **`pg_dump`, `pg_restore` y `psql` 17**, en el PATH: los dos servidores son Postgres 17.
- **[age](https://github.com/FiloSottile/age)** en el PATH, con `age-keygen` para crear las llaves.
- **`SUPABASE_DB_URL`** en el archivo de entorno: `.env` del repo para dev; para producción, el `.env.produccion` que vive fuera del repo y se pasa siempre con `-EnvFile "<ruta del .env.produccion>"`: no hay ruta por defecto. Es la del **session pooler**, puerto 5432: el transaction pooler (6543) no sirve para `pg_dump`. Ver `.env.example`.
- **La llave pública** pegada en `llave-publica.txt`, en una línea que empieza con `age1…`. Para crear el par:

  ```powershell
  age-keygen -o C:\ruta\fuera\del\repo\consultorio-respaldo.txt   # privada; imprime la pública
  ```

  Guarda la privada fuera de la PC también (un USB o el gestor de contraseñas). **Sin ella no se puede descifrar ningún respaldo.**

## Primera vez con la llave real

Desde la raíz del repo, en PowerShell. Si la política de ejecución no deja correr scripts locales, corre una vez `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. En los ejemplos, la llave privada está en `C:\ruta\fuera\del\repo\llaves\consultorio-respaldo.txt` y los respaldos van a `C:\ruta\fuera\del\repo\respaldos-consultorio`. Cambia las rutas por las tuyas, siempre fuera del repo.

1. **Pega tu llave pública** en `scripts\respaldo\llave-publica.txt`, en lugar de la línea `age1…` que haya (o del marcador `PEGA_AQUI_LA_LLAVE_PUBLICA` de un clon nuevo). Si solo tienes la privada, la pública sale de ella:

   ```powershell
   age-keygen -y C:\ruta\fuera\del\repo\llaves\consultorio-respaldo.txt
   ```

   Comprueba que quedó una línea `age1…`:

   ```powershell
   Select-String -Path .\scripts\respaldo\llave-publica.txt -Pattern '^age1'
   ```

   La llave pública se puede commitear; la privada, nunca.

2. **Haz un respaldo de dev** a una carpeta fuera del repo:

   ```powershell
   .\scripts\respaldo\respaldar.ps1 -Destino C:\ruta\fuera\del\repo\respaldos-consultorio
   ```

   Tiene que terminar con `OK: consultorio-dev-….dump.age (… KB)` y dejar una línea `OK` en `respaldos.log`.

3. **Restáuralo en `prueba_restauracion`** con tu llave privada. Pide confirmación antes de crear la base:

   ```powershell
   $ultimo = Get-ChildItem C:\ruta\fuera\del\repo\respaldos-consultorio\consultorio-dev-*.dump.age | Sort-Object Name | Select-Object -Last 1
   .\scripts\respaldo\restaurar-prueba.ps1 -Archivo $ultimo.FullName -LlavePrivada C:\ruta\fuera\del\repo\llaves\consultorio-respaldo.txt
   ```

   Lo esperado:
   - `pg_restore` con **0 errores inesperados**. Los 7 esperados son `public` ya existe y los `ALTER DEFAULT PRIVILEGES` de los roles internos de Supabase.
   - Todas las filas de la tabla en `OK`: conteos, `numero_receta_seq`, políticas y GRANTs.
   - Termina con `OK: el respaldo se restauró y todos los conteos coinciden.`

4. **Borra `prueba_restauracion`.** También pide confirmación:

   ```powershell
   .\scripts\respaldo\restaurar-prueba.ps1 -SoloBorrar
   ```

Si todo salió bien, programa la tarea diaria con `programar.ps1` (ver «Programarlo a diario»).

## Qué se respalda

- **`public` completo:** estructura, datos, GRANTs, RLS y el valor de `numero_receta_seq`. Sin ese valor, el correlativo de recetas volvería a empezar ([ADR-002](../../docs/adr/ADR-002-numero-receta-global.md)).
- **`auth` con sus datos.** No entra el contenido de las tablas efímeras: `sessions`, `refresh_tokens`, `mfa_amr_claims`, `mfa_challenges`, `flow_state`, `one_time_tokens`, `audit_log_entries`, `saml_relay_states`, `webauthn_challenges` y `oauth_client_states`. Su estructura sí entra. `auth.users` guarda la cuenta de la doctora con el hash de su contraseña.
- **`storage` no entra:** la app no lo usa, y los archivos de Storage nunca entran en un `pg_dump`.

**La URL y la contraseña nunca se imprimen ni van al log.** La contraseña viaja a `pg_dump` por `PGPASSWORD`, solo en el proceso hijo. Todo lo que escriben los programas pasa por un filtro que tapa la contraseña, la URL, el host y las IPs.

## Uso

```powershell
# Dev (por defecto lee el .env de la raíz del repo)
.\scripts\respaldo\respaldar.ps1 -Destino D:\Respaldos\consultorio

# Producción: exige -Produccion, -EnvFile con la ruta del archivo Y que la URL sea la de producción
.\scripts\respaldo\respaldar.ps1 -Destino D:\Respaldos\consultorio -EnvFile "<ruta del .env.produccion>" -Produccion

# Ver qué conservaría y qué borraría la retención, sin respaldar ni borrar nada
.\scripts\respaldo\respaldar.ps1 -Destino D:\Respaldos\consultorio -SoloSimular
```

- **Nombre:** `consultorio-<dev|prod>-yyyy-MM-dd_HHmm.dump.age`, con la hora de Ecuador (UTC−5 fijo, sin depender de la zona de la PC).
- **Guarda de entorno:** sin `-Produccion`, solo acepta la URL de dev. Con `-Produccion`, exige `-EnvFile` y solo acepta la URL de producción. Cualquier otra combinación falla antes de conectarse.
- **Sin rastros:** el dump sin cifrar va a un temporal de `%TEMP%` y se borra en un `finally`. Si no se puede borrar, el script falla y lo dice. Si una corrida se corta sin llegar al `finally` (la PC se apaga a mitad), la siguiente borra al arrancar los temporales `consultorio-respaldo-*`/`consultorio-restauracion-*` de más de una hora.
- **Tiempos máximos:** `pg_dump` 15 min y `age` 5 min, dentro de los 30 min de la tarea programada: el script falla y limpia antes de que el Programador lo mate.
- **`-Destino` fuera del repo:** si queda dentro, el script se niega.
- **Contraseña con caracteres especiales:** la URL se separa por el último `@`, así que `#`, `/`, `?` o `@` en la contraseña no la parten, vengan codificados (`%23`) o no.
- **Retención, por entorno y con la fecha del nombre:**
  - conserva el **más reciente** de cada uno de los últimos 14 días que tienen respaldo (si corre dos veces el mismo día, el anterior de ese día se borra);
  - conserva el más reciente de cada semana, de lunes a domingo, de las últimas 8 semanas;
  - solo borra en `-Destino`, sin subcarpetas, y solo lo que coincide exactamente con el patrón del nombre.
- **Log:** una línea por ejecución en `-Destino\respaldos.log`, con fecha, entorno, tamaño, duración, OK o ERROR y un mensaje corto.
- **Código de salida:** distinto de 0 si algo falla. También falla si el archivo cifrado no tiene la cabecera de age o pesa menos de `-TamanoMinimoKB`, que por defecto es 100. El de dev pesa unos 284 KB.

## Programarlo a diario

```powershell
# Producción: el respaldo que importa, con los datos reales (13:00 todos los días)
.\scripts\respaldo\programar.ps1 -Destino D:\Respaldos\consultorio -EnvFile "<ruta del .env.produccion>" -Produccion
.\scripts\respaldo\programar.ps1 -Destino D:\Respaldos\consultorio -EnvFile "<ruta del .env.produccion>" -Produccion -Hora 12:30
.\scripts\respaldo\programar.ps1 -Quitar
```

**Sin `-Produccion`, la tarea respalda dev**, que solo tiene datos sintéticos: sirve para probar la tarea, no como respaldo. Hay una sola tarea; registrarla otra vez la reemplaza.

Registra la tarea `\Consultorio\Respaldo diario` con `Register-ScheduledTask`:

- **Disparador diario a las 13:00.** No de madrugada: la PC va a estar apagada.
- **`-StartWhenAvailable`:** si a las 13:00 la PC estaba apagada, la tarea corre en cuanto se prende.
- **`-ExecutionTimeLimit` de 30 minutos.**
- **`-MultipleInstances IgnoreNew`:** dos respaldos nunca corren a la vez.
- **Corre con tu sesión, sin guardar tu contraseña** (`LogonType Interactive`).

> **Advertencia:** la tarea **solo corre mientras tienes la sesión de Windows iniciada**. Si la PC está prendida pero en la pantalla de inicio de sesión, espera a que entres, y entonces corre por `-StartWhenAvailable`. Correrla sin sesión obligaría a guardar tu contraseña de Windows en la tarea, y eso es justo lo que se evita.

Para probarla en el momento, sin esperar a las 13:00:

```powershell
Start-ScheduledTask -TaskPath '\Consultorio\' -TaskName 'Respaldo diario'
Get-ScheduledTaskInfo -TaskPath '\Consultorio\' -TaskName 'Respaldo diario'   # LastTaskResult 0 = OK
```

Como corre más de una vez al día (al prender la PC y otra vez si la reinicias después de las 13:00), la retención conserva el **más reciente de cada día**.

## Prueba de restauración (una vez al mes)

Un respaldo que nunca se restauró no está probado. El destino es la base **`prueba_restauracion` dentro de la instancia de dev**, nunca la base `postgres` de dev ni producción:

- el session pooler deja conectarse a otra base del mismo servidor;
- los roles de Supabase (`anon`, `authenticated`, …) existen en todo el servidor;
- la base nueva admite `pgcrypto` y `uuid-ossp`.

1. **Haz un respaldo nuevo de dev**, para que los conteos sean comparables. Dev puede haber cambiado desde un respaldo viejo:

   ```powershell
   .\scripts\respaldo\respaldar.ps1 -Destino D:\Respaldos\consultorio
   ```

2. **Restáuralo:** pide confirmación antes de crear la base.

   ```powershell
   .\scripts\respaldo\restaurar-prueba.ps1 -Archivo D:\Respaldos\consultorio\consultorio-dev-AAAA-MM-DD_HHMM.dump.age -LlavePrivada C:\ruta\fuera\del\repo\consultorio-respaldo.txt
   ```

   Descifra a un temporal (que se borra en un `finally`), crea `prueba_restauracion`, restaura y compara el conteo de filas de cada tabla de `public`, `auth.users` y `auth.identities`, más el valor de `numero_receta_seq`, el número de políticas RLS y una huella de los GRANTs, contra la base `postgres` de dev. Sale con código 1 si algo no coincide o si `pg_restore` da un error fuera de los esperados.

   Los errores permitidos están en `$ESPERADOS` de `restaurar-prueba.ps1`, cada uno con su entrada del TOC, su mensaje completo y su comando: `public` ya existe y los 6 `ALTER DEFAULT PRIVILEGES` de `supabase_auth_admin` (en `auth`) y `supabase_admin` (en `public`). Si un error permitido se repite, o si el total que informa `pg_restore` no cuadra con lo reconocido, también falla.

   > Si falla por un error de `pg_restore` que no está en la lista permitida, no lo agregues sin revisar. Primero confirma que es un cambio de Supabase en sus roles internos y no un problema del respaldo. Solo entonces se actualiza la lista, por PR.

3. **Borra la base de prueba:** también pide confirmación.

   ```powershell
   .\scripts\respaldo\restaurar-prueba.ps1 -SoloBorrar
   ```

   No pide ni `-Archivo` ni `-LlavePrivada`. O pasa `-BorrarAlFinal` en el paso 2. El borrado usa `DROP DATABASE … WITH (FORCE)`, porque Supavisor deja abierta una conexión inactiva.

**Guardas:** la llave privada se rechaza si su ruta queda dentro del repo; la URL tiene que ser la de dev, y la de producción se rechaza siempre; y la base de destino se llama exactamente `prueba_restauracion`.

## Restaurar en un proyecto nuevo de Supabase (desastre)

Lo que el respaldo **sí** recupera, en un proyecto nuevo, también Postgres 17:

1. **`public` completo:**
   ```powershell
   pg_restore --no-owner --schema=public --dbname=<URL del proyecto nuevo> respaldo.dump
   ```
   Recupera estructura, datos, GRANTs, RLS y el valor de la secuencia de recetas.
2. **La cuenta de la doctora:**
   ```powershell
   pg_restore --no-owner --data-only --schema=auth --table=users --table=identities --dbname=<URL> respaldo.dump
   ```
   Solo los datos, porque la estructura de `auth` la crea Supabase. Funciona si la versión de Auth del proyecto nuevo tiene las mismas columnas. La doctora entra con su misma contraseña.

Primero descifra con `age --decrypt --identity <llave privada> --output respaldo.dump <archivo>.dump.age`, y borra `respaldo.dump` al terminar.

Lo que el respaldo **no** recupera, porque no está en la base o lo administra Supabase, y hay que rehacer a mano:

- roles y contraseñas de la base: los trae el proyecto nuevo;
- extensiones: se crean con `CREATE EXTENSION`;
- vault, graphql, realtime, cron y los archivos de Storage;
- la configuración de Auth (Site URL, Redirect URLs, registros desactivados) y del proyecto;
- las claves de API y el secreto JWT: el proyecto nuevo tiene otras, así que hay que actualizar las variables de Vercel;
- el event trigger `ensure_rls`: se recrea activando «Enable automatic RLS» en el panel ([Entornos](../../docs/arquitectura/Entornos.md)).
