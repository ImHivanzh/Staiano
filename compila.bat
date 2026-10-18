@echo off
setlocal
cd /d "%~dp0"
echo Staiano HVAC - compilazione e pubblicazione del pacchetto
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "deploy\build-release.ps1" %*
set "code=%ERRORLEVEL%"
echo.
if not "%code%"=="0" (
  echo Compilazione interrotta. Il messaggio di errore e sopra.
) else (
  echo Operazione completata.
)
pause
exit /b %code%
