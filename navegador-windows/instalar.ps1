# ============================================================
#  Instala el "Navegador SIGCOMPRO" para el usuario actual:
#  copia los archivos a %LOCALAPPDATA%\SIGCOMPRO\navegador y crea
#  el acceso directo "SIGCOMPRO" en el escritorio y en el menu Inicio.
#  No requiere permisos de administrador.
# ============================================================
$ErrorActionPreference = "Stop"
$origen  = Split-Path -Parent $MyInvocation.MyCommand.Path
$destino = Join-Path $env:LOCALAPPDATA "SIGCOMPRO\navegador"

Write-Host "Instalando el navegador SIGCOMPRO en $destino ..."

# Si SIGCOMPRO esta abierto, se cierra para poder reemplazar los archivos.
Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like "$destino*" } |
  Stop-Process -Force -ErrorAction SilentlyContinue

if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
New-Item -ItemType Directory -Path $destino -Force | Out-Null
foreach ($item in @("chrome", "extension", "SIGCOMPRO.cmd", "sigcompro.ico", "url.txt")) {
  $ruta = Join-Path $origen $item
  if (Test-Path $ruta) { Copy-Item $ruta -Destination $destino -Recurse -Force }
}

# Acceso directo: abre chrome.exe directamente (sin ventana negra de consola).
$url = "https://sigcompro.grupo-santacruz.com"
$urlTxt = Join-Path $destino "url.txt"
if (Test-Path $urlTxt) { $url = (Get-Content $urlTxt -TotalCount 1).Trim() }
$perfil = Join-Path $env:LOCALAPPDATA "SIGCOMPRO\perfil"
$argumentos = @(
  "--user-data-dir=`"$perfil`"",
  "--load-extension=`"$(Join-Path $destino 'extension')`"",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-search-engine-choice-screen",
  "--app=`"$url`""
) -join " "

$shell = New-Object -ComObject WScript.Shell
$accesos = @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "SIGCOMPRO.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Programs")) "SIGCOMPRO.lnk")
)
foreach ($lnk in $accesos) {
  $a = $shell.CreateShortcut($lnk)
  $a.TargetPath = Join-Path $destino "chrome\chrome.exe"
  $a.Arguments = $argumentos
  $a.WorkingDirectory = $destino
  $a.IconLocation = Join-Path $destino "sigcompro.ico"
  $a.Description = "SIGCOMPRO - Carnes Santacruz"
  $a.Save()
}

Write-Host ""
Write-Host "Listo. Se creo el acceso directo 'SIGCOMPRO' en el escritorio."
Write-Host "Abriendo SIGCOMPRO..."
Start-Process (Join-Path $destino "chrome\chrome.exe") -ArgumentList $argumentos
