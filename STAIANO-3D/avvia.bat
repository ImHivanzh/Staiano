@echo off
cd /d "%~dp0"
if not exist node_modules\next\package.json (
  echo Dipendenze mancanti. Eseguire npm ci nella cartella del progetto.
  pause
  exit /b 1
)
echo Staiano HVAC: http://127.0.0.1:3015
npm run dev
