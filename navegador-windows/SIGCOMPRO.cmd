@echo off
rem ============================================================
rem  SIGCOMPRO - abre el navegador de SIGCOMPRO con la extension
rem  de validacion de cedula (ADRES) ya cargada.
rem ============================================================
setlocal
set "BASE=%~dp0"
set "URL=https://sigcompro.grupo-santacruz.com"
if exist "%BASE%url.txt" set /p URL=<"%BASE%url.txt"

start "" "%BASE%chrome\chrome.exe" ^
  --user-data-dir="%LOCALAPPDATA%\SIGCOMPRO\perfil" ^
  --load-extension="%BASE%extension" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-search-engine-choice-screen ^
  --app="%URL%"
endlocal
