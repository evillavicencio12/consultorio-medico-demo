<#
.SYNOPSIS
  Programa (o quita) el respaldo diario en el Programador de tareas de Windows.

.DESCRIPTION
  Registra la tarea "\Consultorio\Respaldo diario", que corre respaldar.ps1
  todos los días a las 13:00 (por defecto). Si la PC estaba apagada a esa hora,
  corre en cuanto se prenda (-StartWhenAvailable). Se corta a los 30 minutos.

  Corre con la sesión del usuario actual, SIN guardar su contraseña
  (LogonType Interactive). La consecuencia: la tarea solo corre mientras el
  usuario tiene la sesión de Windows iniciada. Si la PC está prendida pero en
  la pantalla de inicio de sesión, no corre hasta que el usuario entra (y
  entonces corre, por -StartWhenAvailable). Correrla sin sesión exigiría guardar
  la contraseña de Windows en la tarea, y eso es lo que se evita.

.PARAMETER Destino
  Carpeta de los respaldos (la misma que se le pasa a respaldar.ps1).

.PARAMETER EnvFile
  Archivo de entorno que leerá respaldar.ps1. Obligatorio con -Produccion: la
  ruta del .env.produccion, que vive fuera del repo (no hay ruta por defecto).

.PARAMETER Produccion
  Programa el respaldo de producción (respaldar.ps1 -Produccion). Sin él, la
  tarea respalda dev, que solo tiene datos sintéticos.

.PARAMETER Hora
  Hora diaria, en formato HH:mm. Por defecto 13:00.

.PARAMETER Quitar
  Borra la tarea.

.EXAMPLE
  .\programar.ps1 -Destino D:\Respaldos\consultorio -EnvFile "<ruta del .env.produccion>" -Produccion
  .\programar.ps1 -Quitar
#>
[CmdletBinding()]
param(
    [string]$Destino,
    [string]$EnvFile,
    [switch]$Produccion,
    [string]$Hora = '13:00',
    [switch]$Quitar
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'comun.ps1')
$CARPETA_TAREA = '\Consultorio\'
$NOMBRE_TAREA = 'Respaldo diario'

if ($Quitar) {
    Unregister-ScheduledTask -TaskPath $CARPETA_TAREA -TaskName $NOMBRE_TAREA -Confirm:$false
    Write-Output "Tarea $CARPETA_TAREA$NOMBRE_TAREA borrada."
    exit 0
}

if (-not $Destino) { throw 'Falta -Destino (la carpeta de los respaldos).' }
# Antes de crear nada.
Exigir-EnvFileProduccion $Produccion $EnvFile
if (-not (Test-Path -LiteralPath $Destino -PathType Container)) { New-Item -ItemType Directory -Path $Destino | Out-Null }
$Destino = (Resolve-Path -LiteralPath $Destino).ProviderPath
$rutaScript = Join-Path $PSScriptRoot 'respaldar.ps1'

# Entre comillas, las barras finales se duplican: "E:\" escaparía la comilla de cierre.
function Arg([string]$a) { '"' + ($a -replace '(\\+)$', '$1$1') + '"' }
$argumentos = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File {0} -Destino {1}' -f (Arg $rutaScript), (Arg $Destino)
if ($EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) { throw "No existe $EnvFile" }
    $argumentos += ' -EnvFile ' + (Arg (Resolve-Path -LiteralPath $EnvFile).ProviderPath)
}
if ($Produccion) { $argumentos += ' -Produccion' }
$entorno = if ($Produccion) { 'producción' } else { 'dev' }

$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $PSScriptRoot -Argument $argumentos
$disparador = New-ScheduledTaskTrigger -Daily -At $Hora
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
# Con la sesión del usuario, sin guardar contraseña.
$usuario = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskPath $CARPETA_TAREA -TaskName $NOMBRE_TAREA -Action $accion -Trigger $disparador `
    -Settings $ajustes -Principal $principal -Description 'Respaldo cifrado de la base del Consultorio Demo (scripts/respaldo).' `
    -Force | Out-Null

Write-Output "Tarea $CARPETA_TAREA$NOMBRE_TAREA registrada: respaldo de $entorno, diario a las $Hora, para $usuario, hacia $Destino."
Write-Output 'Corre solo con tu sesión de Windows iniciada; si a esa hora la PC estaba apagada, corre al prenderla.'
Write-Output "Para probarla ya: Start-ScheduledTask -TaskPath '$CARPETA_TAREA' -TaskName '$NOMBRE_TAREA'"
