<#
.SYNOPSIS
  Respaldo cifrado de la base de Supabase (public + auth), con retención.

.DESCRIPTION
  pg_dump en formato custom a un temporal de %TEMP%, cifrado con age hacia
  -Destino, y borrado del temporal en un finally. Ver scripts/respaldo/README.md.

  Qué entra: el esquema public completo (estructura, datos, GRANTs, RLS y el
  valor de numero_receta_seq) y auth con sus datos, salvo las tablas efímeras
  (sesiones, tokens, auditoría). Storage no entra.

.PARAMETER Destino
  Carpeta de los respaldos. Obligatoria, para no escribir dentro del repo por
  accidente. Ahí también va respaldos.log.

.PARAMETER EnvFile
  Archivo de donde se lee SUPABASE_DB_URL. Sin -Produccion, por defecto el .env
  de la raíz del repo (dev). Con -Produccion es obligatorio: la ruta del
  .env.produccion, que vive fuera del repo (no hay ruta por defecto).

.PARAMETER Produccion
  Sin esta bandera, la URL tiene que ser la de dev. Con ella, tiene que ser la
  de producción. Cualquier otra combinación falla antes de conectarse.

.PARAMETER SoloSimular
  No respalda: muestra qué respaldos conservaría y cuáles borraría la retención.

.EXAMPLE
  .\respaldar.ps1 -Destino D:\Respaldos\consultorio
  .\respaldar.ps1 -Destino D:\Respaldos\consultorio -SoloSimular
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Destino,
    [string]$EnvFile,
    [switch]$Produccion,
    [switch]$SoloSimular,
    [string]$LlavePublica,
    [int]$TamanoMinimoKB = 100,
    [int]$DiasDiarios = 14,
    [int]$SemanasSemanales = 8
)

$ErrorActionPreference = 'Stop'
# Solo para este proceso y sus hijos: psql y pg_* hablan UTF-8 con el servidor,
# e Invocar-Externo lee su salida como UTF-8.
$env:PGCLIENTENCODING = 'UTF8'
. (Join-Path $PSScriptRoot 'comun.ps1')

Exigir-EnvFileProduccion $Produccion $EnvFile
if (-not $EnvFile) { $EnvFile = Join-Path $script:RAIZ_REPO '.env' }
if (-not $LlavePublica) { $LlavePublica = Join-Path $PSScriptRoot 'llave-publica.txt' }
$entorno = if ($Produccion) { 'prod' } else { 'dev' }

# Tablas de auth cuyo CONTENIDO no se respalda: sesiones, tokens y auditoría.
# Su estructura sí entra. Al restaurar, la doctora vuelve a iniciar sesión.
$AUTH_EFIMERAS = @('sessions', 'refresh_tokens', 'mfa_amr_claims', 'mfa_challenges', 'flow_state',
    'one_time_tokens', 'audit_log_entries', 'saml_relay_states', 'webauthn_challenges', 'oauth_client_states')

# --- Retención ---------------------------------------------------------------
# Patrón EXACTO de lo que el script crea. Solo eso se puede borrar.
$PATRON = '^consultorio-(dev|prod)-(\d{4}-\d{2}-\d{2})_(\d{4})\.dump\.age$'

function Plan-Retencion([string]$Carpeta, [string]$Entorno, [datetime]$Ahora) {
    $respaldos = @(Get-ChildItem -LiteralPath $Carpeta -File | ForEach-Object {
            $m = [regex]::Match($_.Name, $PATRON)
            $momento = [datetime]::MinValue
            # Una fecha imposible (2026-02-30) no es un respaldo de este script: no se toca.
            if ($m.Success -and $m.Groups[1].Value -eq $Entorno -and
                [datetime]::TryParseExact("$($m.Groups[2].Value) $($m.Groups[3].Value)", 'yyyy-MM-dd HHmm',
                    [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$momento)) {
                [pscustomobject]@{ Archivo = $_; Momento = $momento }
            }
        })
    $conservar = New-Object 'System.Collections.Generic.HashSet[string]'
    $motivo = @{}

    # Diarios: el MÁS RECIENTE de cada uno de los últimos N días que tienen
    # respaldo. Si corre dos veces el mismo día, el anterior de ese día se borra.
    $porDia = $respaldos | Group-Object { $_.Momento.ToString('yyyy-MM-dd') } |
        Sort-Object Name -Descending | Select-Object -First $DiasDiarios
    foreach ($g in $porDia) {
        $r = $g.Group | Sort-Object Momento -Descending | Select-Object -First 1
        [void]$conservar.Add($r.Archivo.Name); $motivo[$r.Archivo.Name] = 'diario'
    }

    # Semanales: el más reciente de cada semana (lunes a domingo) de las
    # últimas M semanas del calendario, contando la actual.
    $lunesActual = $Ahora.Date.AddDays( - (([int]$Ahora.DayOfWeek + 6) % 7))
    $desde = $lunesActual.AddDays(-7 * ($SemanasSemanales - 1))
    $porSemana = $respaldos | Where-Object { $_.Momento -ge $desde } |
        Group-Object { $_.Momento.Date.AddDays( - (([int]$_.Momento.DayOfWeek + 6) % 7)).ToString('yyyy-MM-dd') }
    foreach ($g in $porSemana) {
        $r = $g.Group | Sort-Object Momento -Descending | Select-Object -First 1
        if ($conservar.Add($r.Archivo.Name)) { $motivo[$r.Archivo.Name] = "semanal (semana del $($g.Name))" }
    }

    return $respaldos | Sort-Object Momento -Descending | ForEach-Object {
        [pscustomobject]@{
            Nombre    = $_.Archivo.Name
            Ruta      = $_.Archivo.FullName
            Conservar = $conservar.Contains($_.Archivo.Name)
            Motivo    = if ($conservar.Contains($_.Archivo.Name)) { $motivo[$_.Archivo.Name] } else { 'se borra' }
        }
    }
}

function Aplicar-Retencion([string]$Carpeta, [string]$Entorno, [datetime]$Ahora, [bool]$Simular) {
    $carpetaReal = (Resolve-Path -LiteralPath $Carpeta).ProviderPath.TrimEnd('\')
    $plan = @(Plan-Retencion $Carpeta $Entorno $Ahora)
    $borrados = 0
    foreach ($r in $plan) {
        if ($Simular) {
            Write-Host ("  {0}  {1}  ({2})" -f $(if ($r.Conservar) { 'CONSERVA' } else { 'BORRARÍA' }), $r.Nombre, $r.Motivo)
            continue
        }
        if ($r.Conservar) { continue }
        # Doble guarda: solo dentro de -Destino (sin subcarpetas) y solo el patrón exacto.
        if ((Split-Path -Parent $r.Ruta).TrimEnd('\') -ne $carpetaReal) { throw "Retención: $($r.Nombre) no está en $carpetaReal" }
        if ($r.Nombre -notmatch $PATRON) { throw "Retención: $($r.Nombre) no coincide con el patrón" }
        Remove-Item -LiteralPath $r.Ruta -Force
        $borrados++
    }
    return $borrados
}

# --- Ejecución ---------------------------------------------------------------
# Nunca dentro del repo: ni los respaldos ni respaldos.log tienen que poder commitearse.
if (Dentro-DelRepo ([System.IO.Path]::GetFullPath([System.IO.Path]::Combine((Get-Location).ProviderPath, $Destino)))) {
    throw '-Destino está dentro del repositorio. Usa una carpeta fuera del repo.'
}
if (-not (Test-Path -LiteralPath $Destino -PathType Container)) {
    if ($SoloSimular) { throw "No existe la carpeta $Destino" }
    New-Item -ItemType Directory -Path $Destino | Out-Null
}
$Destino = (Resolve-Path -LiteralPath $Destino).ProviderPath
$ahora = Ahora-Ecuador

if ($SoloSimular) {
    Write-Output "Retención ($entorno, $DiasDiarios diarios + $SemanasSemanales semanales), simulada al $($ahora.ToString('yyyy-MM-dd HH:mm')) de Ecuador:"
    [void](Aplicar-Retencion $Destino $entorno $ahora $true)
    Write-Output 'Simulación: no se borró nada.'
    exit 0
}

$log = Join-Path $Destino 'respaldos.log'
$nombre = "consultorio-$entorno-$($ahora.ToString('yyyy-MM-dd_HHmm')).dump.age"
$final = Join-Path $Destino $nombre
$parcial = "$final.parcial"
$temporal = Join-Path $env:TEMP ("consultorio-respaldo-{0}.dump" -f [guid]::NewGuid().ToString('N'))
$reloj = [System.Diagnostics.Stopwatch]::StartNew()
$codigo = 0
$mensaje = ''
$tamanoKB = 0

try {
    # 0. Temporales sin cifrar de una corrida anterior que se cortó.
    $viejos = @(Borrar-TemporalesViejos)
    if ($viejos.Count) { Write-Output "Borrados $($viejos.Count) temporal(es) de una corrida anterior que se cortó." }

    # 1. La llave pública: un marcador no es una llave.
    if (-not (Test-Path -LiteralPath $LlavePublica -PathType Leaf)) { throw "No existe la llave pública $LlavePublica" }
    $LlavePublica = (Resolve-Path -LiteralPath $LlavePublica).ProviderPath
    $llaves = @(Get-Content -LiteralPath $LlavePublica | Where-Object { $_ -match '^\s*age1[0-9a-z]{58}\s*$' })
    if ($llaves.Count -eq 0) { throw 'llave-publica.txt no tiene una llave age válida (age1…): pega la llave pública antes de respaldar.' }

    # 2. La URL y la guarda de entorno, antes de conectarse a nada.
    Leer-Refs $EnvFile
    $url = Leer-UrlDeEnv $EnvFile
    $conexion = Separar-Url $url
    if ($Produccion) {
        if (-not $url.Contains($script:REF_PROD)) { throw 'Con -Produccion, la URL tiene que ser la de producción, y no lo es.' }
    } else {
        if ($url.Contains($script:REF_PROD)) { throw 'La URL es la de producción: para respaldarla hay que pasar -Produccion.' }
        if (-not $url.Contains($script:REF_DEV)) { throw 'La URL no es la de dev; sin -Produccion solo se respalda dev.' }
    }
    $url = $null

    # 3. pg_dump al temporal (archivo, no tubería).
    $argumentos = @('--format=custom', "--file=$temporal", '--no-password', '--lock-wait-timeout=60000',
        '--no-publications', '--no-subscriptions', '--schema=public', '--schema=auth')
    foreach ($t in $AUTH_EFIMERAS) { $argumentos += "--exclude-table-data=auth.$t" }
    $argumentos += "--dbname=$($conexion.SinContrasena)"
    # Tiempos máximos: pg_dump 15 min + age 5 min, dentro de los 30 min de la tarea
    # programada, para que el script falle (y limpie) antes de que la maten.
    $r = Invocar-Externo 'pg_dump' $argumentos $conexion.Contrasena 900
    if ($r.Codigo -ne 0) { throw "pg_dump falló ($($r.Codigo)): $(Resumen-Corto $r.Errores)" }
    if (-not (Test-Path -LiteralPath $temporal) -or (Get-Item -LiteralPath $temporal).Length -eq 0) {
        throw 'pg_dump terminó sin generar el archivo.'
    }

    # 4. Cifrado con age a un .parcial; solo se renombra si todo está bien.
    $r = Invocar-Externo 'age' @('--encrypt', '--recipients-file', $LlavePublica, '--output', $parcial, $temporal) $null 300
    if ($r.Codigo -ne 0) { throw "age falló ($($r.Codigo)): $(Resumen-Corto $r.Errores)" }

    # 5. Verificación del cifrado: cabecera de age y tamaño razonable.
    $bytes = New-Object byte[] 21
    $fs = [System.IO.File]::OpenRead($parcial)
    try { [void]$fs.Read($bytes, 0, 21) } finally { $fs.Dispose() }
    if ([System.Text.Encoding]::ASCII.GetString($bytes) -ne 'age-encryption.org/v1') { throw 'El archivo cifrado no tiene la cabecera de age.' }
    $tamanoKB = [math]::Round((Get-Item -LiteralPath $parcial).Length / 1KB)
    if ($tamanoKB -lt $TamanoMinimoKB) { throw "El respaldo pesa $tamanoKB KB, menos que el mínimo de $TamanoMinimoKB KB: sospechoso." }
    Move-Item -LiteralPath $parcial -Destination $final

    # 6. Retención, solo después de un respaldo bueno.
    $borrados = Aplicar-Retencion $Destino $entorno $ahora $false
    $mensaje = "respaldo creado; retención borró $borrados"
    Write-Output "OK: $nombre ($tamanoKB KB). Retención: $borrados borrado(s)."
} catch {
    $codigo = 1
    $mensaje = Resumen-Corto $_.Exception.Message
    $host.UI.WriteErrorLine("ERROR: $mensaje")
} finally {
    $conexion = $null
    try { Borrar-Temporal $temporal } catch { $codigo = 1; $mensaje = Resumen-Corto $_.Exception.Message; $host.UI.WriteErrorLine("ERROR: $mensaje") }
    if (Test-Path -LiteralPath $parcial) { Remove-Item -LiteralPath $parcial -Force -ErrorAction SilentlyContinue }
    $reloj.Stop()
    $estado = if ($codigo -eq 0) { 'OK' } else { 'ERROR' }
    $linea = '{0} | {1} | {2} KB | {3:N1} s | {4} | {5}' -f $ahora.ToString('yyyy-MM-dd HH:mm'), $entorno, $tamanoKB,
        $reloj.Elapsed.TotalSeconds, $estado, (Ocultar-Secretos $mensaje)
    try { Add-Content -LiteralPath $log -Value $linea -Encoding UTF8 } catch { $codigo = 1; $host.UI.WriteErrorLine("ERROR: no se pudo escribir el log: $($_.Exception.Message)") }
}
exit $codigo
