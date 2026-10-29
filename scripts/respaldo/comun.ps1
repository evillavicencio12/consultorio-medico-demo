# scripts/respaldo/comun.ps1
#
# Lo que comparten respaldar.ps1 y restaurar-prueba.ps1. Se carga con
# dot-sourcing (". $PSScriptRoot\comun.ps1"); no es un módulo.
#
# Regla de todo este directorio: la URL de la base y su contraseña NUNCA se
# imprimen ni se escriben en el log. La contraseña viaja a pg_dump/psql por la
# variable PGPASSWORD del proceso hijo (no queda en la línea de comandos), y
# toda salida de esos programas pasa por Ocultar-Secretos antes de mostrarse.

Set-StrictMode -Version Latest

# Los refs de dev y producción no están escritos aquí: Leer-Refs los toma del
# archivo de entorno (SUPABASE_REF_DEV y SUPABASE_REF_PRODUCCION).
$script:REF_DEV = $null
$script:REF_PROD = $null
$script:RAIZ_REPO = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).ProviderPath

# Lo que hay que tapar en cualquier texto que salga de aquí. Se llena al leer la URL.
$script:SECRETOS = New-Object System.Collections.Generic.List[string]

function Ocultar-Secretos([string]$Texto) {
    if ([string]::IsNullOrEmpty($Texto)) { return '' }
    $t = $Texto
    foreach ($s in $script:SECRETOS) {
        if ($s) { $t = $t.Replace($s, '***') }
    }
    # Por si algo se coló igual: cualquier URL de Postgres, IP o host de Supabase.
    $t = [regex]::Replace($t, 'postgres(ql)?://\S+', '<url>')
    $t = [regex]::Replace($t, '\b\d{1,3}(\.\d{1,3}){3}\b', '<ip>')
    $t = [regex]::Replace($t, '[A-Za-z0-9.-]+\.(pooler\.)?supabase\.(com|co)', '<host>')
    return $t
}

function Leer-VariableDeEnv([string]$EnvFile, [string]$Nombre) {
    $linea = Get-Content -LiteralPath $EnvFile -Encoding UTF8 |
        Where-Object { $_ -match "^\s*$Nombre\s*=" } |
        Select-Object -Last 1
    if (-not $linea) { return $null }
    $valor = ($linea -replace "^\s*$Nombre\s*=\s*", '').Trim().Trim('"').Trim("'")
    if ($valor) { return $valor } else { return $null }
}

# Los refs, para las guardas de entorno. Sin el de dev no se sigue: sin él no
# hay forma de distinguir dev de cualquier otro proyecto.
function Leer-Refs([string]$EnvFile) {
    $script:REF_DEV = Leer-VariableDeEnv $EnvFile 'SUPABASE_REF_DEV'
    $script:REF_PROD = Leer-VariableDeEnv $EnvFile 'SUPABASE_REF_PRODUCCION'
    if (-not $script:REF_DEV) { throw "SUPABASE_REF_DEV no está en $EnvFile" }
    if (-not $script:REF_PROD) { throw "SUPABASE_REF_PRODUCCION no está en $EnvFile" }
}

function Leer-UrlDeEnv([string]$EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
        throw "No existe el archivo de entorno: $EnvFile"
    }
    $linea = Get-Content -LiteralPath $EnvFile -Encoding UTF8 |
        Where-Object { $_ -match '^\s*SUPABASE_DB_URL\s*=' } |
        Select-Object -Last 1
    if (-not $linea) { throw "SUPABASE_DB_URL no está en $EnvFile" }
    $valor = ($linea -replace '^\s*SUPABASE_DB_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
    if (-not $valor) { throw "SUPABASE_DB_URL está vacía en $EnvFile" }
    return $valor
}

# Separa la URL en lo que se puede pasar por la línea de comandos (sin
# contraseña) y la contraseña, y registra todo lo sensible para Ocultar-Secretos.
#
# Sin [System.Uri]: una contraseña pegada sin codificar, con # / ? o @, se
# partiría y un pedazo terminaría en el nombre de la base, que sí viaja por la
# línea de comandos. Aquí la contraseña es todo lo que hay entre el primer ':'
# después del usuario y el ÚLTIMO '@'.
function Separar-Url([string]$Url) {
    $m = [regex]::Match($Url, '^postgres(?:ql)?://([^:/@]+):(.+)@([A-Za-z0-9.-]+)(?::(\d+))?(?:/([^?#/]*))?(\?[^#]*)?$')
    if (-not $m.Success) {
        if ($Url -notmatch '^postgres(ql)?://') { throw 'SUPABASE_DB_URL no es una URL de Postgres.' }
        throw 'SUPABASE_DB_URL no tiene la forma postgresql://usuario:contraseña@servidor:puerto/base.'
    }
    $usuario = $m.Groups[1].Value
    $contrasenaCodificada = $m.Groups[2].Value
    # Si viene codificada (%23 por #), se decodifica; si no, queda igual.
    $contrasena = [System.Uri]::UnescapeDataString($contrasenaCodificada)
    $servidor = $m.Groups[3].Value

    $script:SECRETOS.Add($Url)
    $script:SECRETOS.Add($contrasenaCodificada)
    $script:SECRETOS.Add($contrasena)
    $script:SECRETOS.Add($servidor)

    $puerto = if ($m.Groups[4].Success) { [int]$m.Groups[4].Value } else { 5432 }
    $base = if ($m.Groups[5].Success -and $m.Groups[5].Value) { $m.Groups[5].Value } else { 'postgres' }
    $consulta = $m.Groups[6].Value
    $sinContrasena = "postgresql://$usuario@${servidor}:$puerto/$base$consulta"
    $script:SECRETOS.Add($sinContrasena)
    return [pscustomobject]@{
        SinContrasena = $sinContrasena
        Contrasena    = $contrasena
        Usuario       = $usuario
        Servidor      = $servidor
        Puerto        = $puerto
        Base          = $base
        Consulta      = $consulta
    }
}

# La misma conexión, apuntando a otra base del mismo servidor.
function Url-ConBase($Conexion, [string]$Base) {
    $url = "postgresql://$($Conexion.Usuario)@$($Conexion.Servidor):$($Conexion.Puerto)/$Base$($Conexion.Consulta)"
    $script:SECRETOS.Add($url)
    return $url
}

function Comillas([string]$a) {
    # Reglas de CommandLineToArgvW: barras antes de una comilla se duplican.
    $a = [regex]::Replace($a, '(\\*)"', '$1$1\"')
    $a = [regex]::Replace($a, '(\\+)$', '$1$1')
    return '"' + $a + '"'
}

# Corre un programa sin tuberías de PowerShell (que en 5.1 corrompen binarios y
# vuelven errores las líneas de stderr). Devuelve código, stdout y stderr ya
# ocultados. La contraseña, si se da, va solo al entorno del proceso hijo.
function Invocar-Externo([string]$Programa, [string[]]$Argumentos, [string]$Contrasena = $null, [int]$TiempoMaxSeg = 1500) {
    $comando = Get-Command $Programa -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $comando) { throw "No se encontró '$Programa' en el PATH." }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $comando.Source
    $psi.Arguments = ($Argumentos | ForEach-Object { Comillas $_ }) -join ' '
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    # Las rutas relativas, contra la carpeta actual de PowerShell (donde las
    # validó Test-Path), no contra la del proceso.
    $psi.WorkingDirectory = (Get-Location).ProviderPath
    # Con PGCLIENTENCODING=UTF8 (lo ponen los scripts), psql escribe en UTF-8.
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    if ($Contrasena) { $psi.EnvironmentVariables['PGPASSWORD'] = $Contrasena }
    # Que libpq no lea un .pgpass ni servicios del usuario por su cuenta.
    $psi.EnvironmentVariables['PGPASSFILE'] = 'NUL'
    $p = [System.Diagnostics.Process]::Start($psi)
    $salida = $p.StandardOutput.ReadToEndAsync()
    $errores = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit($TiempoMaxSeg * 1000)) {
        try { $p.Kill() } catch { }
        throw "$Programa no terminó en $TiempoMaxSeg s."
    }
    $p.WaitForExit()
    return [pscustomobject]@{
        Codigo  = $p.ExitCode
        Salida  = Ocultar-Secretos $salida.Result
        Errores = Ocultar-Secretos $errores.Result
    }
}

# Primera línea útil de un texto, ya ocultada y corta: para el log y los errores.
function Resumen-Corto([string]$Texto, [int]$Max = 160) {
    $linea = ($Texto -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
    if (-not $linea) { return '' }
    $linea = (Ocultar-Secretos $linea).Trim()
    if ($linea.Length -gt $Max) { $linea = $linea.Substring(0, $Max) + '…' }
    return $linea
}

# Hora de Ecuador sin depender de la zona de la PC: UTC-5 fijo (Ecuador no
# cambia de hora desde 1993).
function Ahora-Ecuador { return [DateTime]::UtcNow.AddHours(-5) }

# ¿La ruta está dentro del repositorio?
function Dentro-DelRepo([string]$Ruta) {
    $raiz = $script:RAIZ_REPO.TrimEnd('\') + '\'
    return ($Ruta.TrimEnd('\') + '\').StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)
}

# Con -Produccion, la ruta del .env.produccion es obligatoria (no hay ruta por
# defecto) y tiene que estar fuera del repo, donde ninguna búsqueda lo alcanza.
function Exigir-EnvFileProduccion([bool]$Produccion, [string]$EnvFile) {
    if (-not $Produccion) { return }
    if (-not $EnvFile) { throw 'Con -Produccion, -EnvFile es obligatorio: la ruta del .env.produccion, que vive fuera del repo.' }
    if (Dentro-DelRepo ([System.IO.Path]::GetFullPath([System.IO.Path]::Combine((Get-Location).ProviderPath, $EnvFile)))) {
        throw 'Con -Produccion, el archivo de entorno tiene que estar fuera del repo.'
    }
}

# Temporales sin cifrar que dejó una corrida cortada (tarea terminada por el
# Programador, PC apagada a mitad): el finally no llegó a correr. Se borran los
# de más de una hora, para no tocar los de una corrida que esté en curso.
function Borrar-TemporalesViejos {
    Get-ChildItem -LiteralPath $env:TEMP -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^consultorio-(respaldo|restauracion)-[0-9a-f]{32}\.dump$' -and $_.LastWriteTime -lt (Get-Date).AddHours(-1) } |
        ForEach-Object { Borrar-Temporal $_.FullName; $_.Name }
}

function Borrar-Temporal([string]$Ruta) {
    if ($Ruta -and (Test-Path -LiteralPath $Ruta)) {
        Remove-Item -LiteralPath $Ruta -Force -ErrorAction SilentlyContinue
    }
    if ($Ruta -and (Test-Path -LiteralPath $Ruta)) {
        throw "No se pudo borrar el temporal $Ruta. Bórralo a mano: puede tener datos sin cifrar."
    }
}
