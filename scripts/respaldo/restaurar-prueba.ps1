<#
.SYNOPSIS
  Prueba de restauración de un respaldo, en la base aparte prueba_restauracion de dev.

.DESCRIPTION
  Descifra el respaldo a un temporal de %TEMP%, lo restaura en la base
  prueba_restauracion de la instancia de DEV y compara el conteo de filas de
  cada tabla (public, auth.users, auth.identities) y el valor de
  numero_receta_seq contra la base de origen (postgres de dev). El temporal se
  borra en un finally.

  Nunca restaura sobre la base postgres de dev ni contra producción: solo dev,
  y solo en una base que se llama exactamente prueba_restauracion. Crear y
  borrar esa base pide confirmación (salvo -Si).

  Para que los conteos coincidan, restaura un respaldo recién hecho: dev puede
  cambiar entre un respaldo viejo y hoy (ver README.md, prueba mensual).

.PARAMETER Archivo
  El .dump.age a probar. Obligatorio al restaurar.

.PARAMETER LlavePrivada
  Archivo de la llave privada de age. Obligatorio al restaurar. Se niega a
  usarla si está dentro del repo.

.PARAMETER BorrarAlFinal
  Al terminar, borra prueba_restauracion (pide confirmación, salvo -Si).

.PARAMETER SoloBorrar
  No restaura: solo borra prueba_restauracion (pide confirmación, salvo -Si).
  No pide ni -Archivo ni -LlavePrivada.

.EXAMPLE
  .\restaurar-prueba.ps1 -Archivo D:\Respaldos\consultorio\consultorio-dev-2026-10-18_1300.dump.age -LlavePrivada C:\llaves\consultorio.txt

  Restaura el respaldo en prueba_restauracion y compara con dev.

.EXAMPLE
  .\restaurar-prueba.ps1 -SoloBorrar

  Borra prueba_restauracion, sin pedir el archivo ni la llave.
#>
# Dos conjuntos de parámetros: restaurar (por defecto) exige el archivo y la
# llave; -SoloBorrar no necesita ninguno de los dos.
# Sin posiciones: todo va con nombre, igual en los dos conjuntos.
[CmdletBinding(DefaultParameterSetName = 'Restaurar', PositionalBinding = $false)]
param(
    [Parameter(ParameterSetName = 'Restaurar', Mandatory = $true)][string]$Archivo,
    [Parameter(ParameterSetName = 'Restaurar', Mandatory = $true)][string]$LlavePrivada,
    [Parameter(ParameterSetName = 'Restaurar')][switch]$BorrarAlFinal,
    [Parameter(ParameterSetName = 'SoloBorrar')][switch]$SoloBorrar,
    [string]$EnvFile,
    [switch]$Si
)

$ErrorActionPreference = 'Stop'
# Solo para este proceso y sus hijos: psql y pg_* hablan UTF-8 con el servidor,
# e Invocar-Externo lee su salida como UTF-8.
$env:PGCLIENTENCODING = 'UTF8'
. (Join-Path $PSScriptRoot 'comun.ps1')

$BASE_PRUEBA = 'prueba_restauracion'
# El modo sale del conjunto que resolvió PowerShell, no del valor del switch.
$modoBorrar = $PSCmdlet.ParameterSetName -eq 'SoloBorrar'
if ($modoBorrar -and -not $SoloBorrar.IsPresent) {
    throw '-SoloBorrar:$false no tiene sentido: para restaurar, omite -SoloBorrar y pasa -Archivo y -LlavePrivada.'
}
if (-not $EnvFile) { $EnvFile = Join-Path $script:RAIZ_REPO '.env' }

function Confirmar([string]$Pregunta) {
    if ($Si) { return $true }
    $r = Read-Host "$Pregunta (S/N)"
    return $r -match '^[sS]'
}

function Psql($Url, [string]$Sql, $Contrasena) {
    $r = Invocar-Externo 'psql' @("--dbname=$Url", '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', $Sql) $Contrasena
    if ($r.Codigo -ne 0) { throw "psql falló: $(Resumen-Corto $r.Errores)" }
    return $r.Salida.Trim()
}

function Existe-Base($Origen, $Contrasena) {
    return (Psql $Origen "select count(*) from pg_database where datname = '$BASE_PRUEBA'" $Contrasena) -eq '1'
}

function Borrar-Base($Origen, $Contrasena) {
    if (-not (Existe-Base $Origen $Contrasena)) { Write-Output "La base $BASE_PRUEBA no existe; no hay nada que borrar."; return }
    if (-not (Confirmar "¿Borrar la base $BASE_PRUEBA de dev?")) { Write-Output 'No se borró.'; return }
    # WITH (FORCE): Supavisor deja una conexión inactiva abierta a la base.
    [void](Psql $Origen "drop database $BASE_PRUEBA with (force)" $Contrasena)
    if (Existe-Base $Origen $Contrasena) { throw "La base $BASE_PRUEBA sigue existiendo." }
    Write-Output "Base $BASE_PRUEBA borrada."
}

# Los únicos errores de pg_restore que se aceptan, cada uno con su entrada del
# TOC (tipo, etiqueta y dueño; sin los números, que cambian de un respaldo a
# otro), su mensaje completo y la primera línea del comando, que lleva el esquema. Son los que da una base nueva de Supabase y
# no afectan lo restaurado: public ya existe, y postgres no puede cambiar los
# privilegios por defecto de los roles internos (supabase_auth_admin en auth,
# supabase_admin en public); en un proyecto nuevo esos ya vienen puestos. Los
# de FOR ROLE postgres sí se restauran. Si Supabase cambia sus roles, la prueba
# falla y hay que revisar esta lista a mano.
$PRIVILEGIOS = 'could not execute query: ERROR:  permission denied to change default privileges'
$ESPERADOS = @(
    'SCHEMA public pg_database_owner | could not execute query: ERROR:  schema "public" already exists | CREATE SCHEMA public;'
    "DEFAULT ACL DEFAULT PRIVILEGES FOR SEQUENCES supabase_auth_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES TO postgres;"
    "DEFAULT ACL DEFAULT PRIVILEGES FOR FUNCTIONS supabase_auth_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS TO postgres;"
    "DEFAULT ACL DEFAULT PRIVILEGES FOR TABLES supabase_auth_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO postgres;"
    "DEFAULT ACL DEFAULT PRIVILEGES FOR SEQUENCES supabase_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;"
    "DEFAULT ACL DEFAULT PRIVILEGES FOR FUNCTIONS supabase_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;"
    "DEFAULT ACL DEFAULT PRIVILEGES FOR TABLES supabase_admin | $PRIVILEGIOS | ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;"
)

# Cada error de la salida de pg_restore como 'entrada | mensaje | comando'.
# Formato de pg_restore: "pg_restore: from TOC entry N; tableoid oid <tipo> <etiqueta> <dueño>",
# luego "pg_restore: error: <mensaje>" y "Command was: <comando>".
function Errores-PgRestore([string]$Texto) {
    $lista = New-Object System.Collections.Generic.List[string]
    $entrada = '(sin entrada del TOC)'
    $lineas = @($Texto -split "`r?`n")
    for ($i = 0; $i -lt $lineas.Count; $i++) {
        if ($lineas[$i] -match '^pg_restore: from TOC entry \d+; \d+ \d+ (.+)$') { $entrada = $Matches[1].Trim(); continue }
        if ($lineas[$i] -match '^pg_restore: error: (.+)$') {
            $mensaje = $Matches[1].TrimEnd()
            $deEntrada = $entrada
            $entrada = '(sin entrada del TOC)'
            # El comando viene después del mensaje (y de un DETAIL o HINT, si los hay).
            $comando = ''
            for ($j = $i + 1; $j -lt $lineas.Count -and $lineas[$j] -notmatch '^pg_restore: '; $j++) {
                if ($lineas[$j] -match '^Command was: (.*)$') { $comando = $Matches[1].Trim(); break }
            }
            $lista.Add("$deEntrada | $mensaje | $comando")
        }
        # La entrada del TOC vale solo para el error que viene justo después;
        # un error fatal posterior (archivo cortado, conexión) no la hereda.
        elseif ($lineas[$i] -match '^pg_restore: ') { $entrada = '(sin entrada del TOC)' }
    }
    return , $lista.ToArray()
}

# Cuántos errores esperados dio pg_restore y cuáles no lo son. Un esperado
# cuenta exacto (mayúsculas incluidas) y a lo sumo una vez; si se repite, la
# repetición es inesperada.
function Clasificar-PgRestore([int]$Codigo, [string]$Texto) {
    $errores = Errores-PgRestore $Texto
    $vistos = @{}
    $inesperados = New-Object System.Collections.Generic.List[string]
    foreach ($e in $errores) {
        if ($ESPERADOS -ccontains $e -and -not $vistos.ContainsKey($e)) { $vistos[$e] = $true } else { $inesperados.Add($e) }
    }
    # Que ningún error se haya escapado del análisis: pg_restore dice cuántos ignoró.
    $ignorados = if ($Texto -match 'pg_restore: warning: errors ignored on restore: (\d+)') { [int]$Matches[1] } else { 0 }
    if ($ignorados -ne $errores.Count -or ($Codigo -ne 0 -and $errores.Count -eq 0)) {
        $inesperados.Add("pg_restore salió con código $Codigo e informó $ignorados error(es); se reconocieron $($errores.Count).")
    }
    return [pscustomobject]@{ Esperados = $vistos.Count; Inesperados = $inesperados }
}

# Conteo exacto de cada tabla de public más auth.users y auth.identities, y el
# valor de la secuencia de recetas. Devuelve un diccionario nombre -> valor.
function Conteos($Url, $Contrasena) {
    $tablas = (Psql $Url "select table_schema || '.' || table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" $Contrasena) -split "`r?`n" |
        Where-Object { $_ }
    $tablas += @('auth.users', 'auth.identities')
    $partes = $tablas | ForEach-Object { "select '$_', count(*)::text from $_" }
    $partes += "select 'secuencia numero_receta_seq', last_value::text || case when is_called then '' else ' (sin usar)' end from public.numero_receta_seq"
    # Que los permisos también hayan vuelto: políticas RLS y GRANTs de las tablas de public.
    # Solo ASCII en el SQL: psql recibe los argumentos en la página de códigos de
    # Windows, no en UTF-8, y una tilde rompe la consulta.
    $partes += "select 'politicas_rls', count(*)::text from pg_policies where schemaname = 'public'"
    $partes += "select 'grants_md5', md5(coalesce(string_agg(relname || '=' || coalesce(relacl::text, ''), ';' order by relname), '')) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r', 'S')"
    $filas = (Psql $Url ($partes -join ' union all ') $Contrasena) -split "`r?`n" | Where-Object { $_ }
    $nombres = @{ 'politicas_rls' = 'políticas RLS de public'; 'grants_md5' = 'GRANTs de public (huella md5)' }
    $d = [ordered]@{}
    foreach ($f in $filas) {
        $c = $f.Split('|', 2)
        $d[$(if ($nombres.ContainsKey($c[0])) { $nombres[$c[0]] } else { $c[0] })] = $c[1]
    }
    return $d
}

$temporal = Join-Path $env:TEMP ("consultorio-restauracion-{0}.dump" -f [guid]::NewGuid().ToString('N'))
$codigo = 0
try {
    # 1. La llave privada, fuera del repo (solo al restaurar).
    if (-not $modoBorrar) {
        if (-not (Test-Path -LiteralPath $LlavePrivada -PathType Leaf)) { throw "No existe la llave privada $LlavePrivada" }
        $llave = (Resolve-Path -LiteralPath $LlavePrivada).ProviderPath
        if (Dentro-DelRepo $llave) {
            throw 'La llave privada está dentro del repositorio. Muévela fuera del repo antes de seguir: nunca debe estar ahí.'
        }
    }

    # 2. Solo dev, nunca producción.
    Leer-Refs $EnvFile
    $url = Leer-UrlDeEnv $EnvFile
    if ($url.Contains($script:REF_PROD)) { throw 'La URL es la de producción: la restauración de prueba solo se hace en dev.' }
    if (-not $url.Contains($script:REF_DEV)) { throw 'La URL no es la de dev.' }
    $conexion = Separar-Url $url
    $url = $null
    if ($conexion.Base -eq $BASE_PRUEBA) { throw "La URL de origen apunta a $BASE_PRUEBA; tiene que apuntar a la base de la app." }
    $origen = $conexion.SinContrasena
    $prueba = Url-ConBase $conexion $BASE_PRUEBA

    if ($modoBorrar) { Borrar-Base $origen $conexion.Contrasena }
    else {

    if (-not (Test-Path -LiteralPath $Archivo -PathType Leaf)) { throw "No existe $Archivo" }

    # 3. Descifrar al temporal (antes de crear nada: con la llave equivocada falla aquí).
    $r = Invocar-Externo 'age' @('--decrypt', '--identity', $llave, '--output', $temporal, (Resolve-Path -LiteralPath $Archivo).ProviderPath)
    if ($r.Codigo -ne 0) { throw "age no pudo descifrar ($($r.Codigo)): $(Resumen-Corto $r.Errores)" }
    Write-Output "Descifrado: $([math]::Round((Get-Item -LiteralPath $temporal).Length / 1KB)) KB en un temporal."

    # 4. La base de prueba: tiene que no existir, y se crea con confirmación.
    if (Existe-Base $origen $conexion.Contrasena) {
        throw "La base $BASE_PRUEBA ya existe (de una prueba anterior). Bórrala con -SoloBorrar y vuelve a intentar."
    }
    if (-not (Confirmar "¿Crear la base $BASE_PRUEBA en dev para restaurar?")) { throw 'Cancelado: no se creó la base.' }
    [void](Psql $origen "create database $BASE_PRUEBA" $conexion.Contrasena)
    # Las extensiones que usa auth viven en el esquema extensions, como en Supabase.
    [void](Psql $prueba 'create schema if not exists extensions; create extension if not exists pgcrypto schema extensions; create extension if not exists "uuid-ossp" schema extensions' $conexion.Contrasena)
    Write-Output "Base $BASE_PRUEBA creada."

    # 5. Restaurar.
    # --verbose: sin él, pg_restore no imprime la línea "from TOC entry" de cada error.
    $r = Invocar-Externo 'pg_restore' @('--no-owner', '--no-password', '--verbose', "--dbname=$prueba", $temporal) $conexion.Contrasena
    $c = Clasificar-PgRestore $r.Codigo $r.Errores
    $inesperados = $c.Inesperados
    Write-Output ("pg_restore terminó con código {0}: {1} de {2} error(es) esperado(s) y {3} inesperado(s)." -f $r.Codigo, $c.Esperados, $ESPERADOS.Count, $inesperados.Count)
    $inesperados | Select-Object -First 10 | ForEach-Object { Write-Output "  INESPERADO: $(Resumen-Corto $_ 300)" }

    # 6. Comparar conteos.
    $a = Conteos $origen $conexion.Contrasena
    # Si la restauración quedó a medias, contar en la base de prueba puede fallar
    # (falta una tabla o la secuencia): eso es una diferencia, no un error aparte.
    try { $b = Conteos $prueba $conexion.Contrasena }
    catch { $b = [ordered]@{}; Write-Output "No se pudo contar en ${BASE_PRUEBA}: $(Resumen-Corto $_.Exception.Message)" }
    $distintos = 0
    Write-Output ''
    Write-Output ('{0,-36} {1,12} {2,12}  {3}' -f 'Tabla', 'Origen', 'Restaurado', '')
    # Las claves de las dos bases: una tabla que está solo en la restaurada también es una diferencia.
    $claves = @($a.Keys) + @($b.Keys | Where-Object { -not $a.Contains($_) })
    foreach ($k in $claves) {
        $va = if ($a.Contains($k)) { $a[$k] } else { '(falta)' }
        $vb = if ($b.Contains($k)) { $b[$k] } else { '(falta)' }
        $ok = $va -eq $vb
        if (-not $ok) { $distintos++ }
        Write-Output ('{0,-36} {1,12} {2,12}  {3}' -f $k, $va, $vb, $(if ($ok) { 'OK' } else { 'DISTINTO' }))
    }
    if ($distintos -gt 0 -or $inesperados.Count -gt 0) {
        $codigo = 1
        $host.UI.WriteErrorLine("ERROR: la restauración no es fiel ($distintos diferencia(s), $($inesperados.Count) error(es) inesperado(s) de pg_restore).")
    } else {
        Write-Output ''
        Write-Output 'OK: el respaldo se restauró y todos los conteos coinciden.'
    }

    if ($BorrarAlFinal) { Borrar-Base $origen $conexion.Contrasena }
    elseif ($codigo -eq 0) { Write-Output "La base $BASE_PRUEBA queda creada. Bórrala con -SoloBorrar cuando termines." }
    }
} catch {
    $codigo = 1
    $host.UI.WriteErrorLine("ERROR: $(Resumen-Corto $_.Exception.Message 300)")
} finally {
    $conexion = $null
    try { Borrar-Temporal $temporal } catch { $codigo = 1; $host.UI.WriteErrorLine("ERROR: $(Resumen-Corto $_.Exception.Message)") }
}
exit $codigo
