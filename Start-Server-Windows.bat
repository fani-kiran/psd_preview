@echo off
setlocal enabledelayedexpansion

echo ==========================================================
echo    Starting Photoshop Mobile Preview Server
echo ==========================================================

cd /d "%~dp0"

if not exist "logs\" mkdir "logs"

if not exist "bridge-server\node_modules\" (
  echo Installing bridge server dependencies...
  cd bridge-server
  call npm install --no-audit --no-fund
  cd ..
)

netstat -ano | findstr :3890 >nul 2>nul
if %ERRORLEVEL% equ 0 (
  echo [INFO] Bridge server is ALREADY running on port 3890.
) else (
  powershell -Command "Start-Process node -ArgumentList 'bridge-server\server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
  timeout /t 2 /nobreak >nul 2>nul
  echo [SUCCESS] Server started in background on port 3890!
)

echo.
echo Server Status: Port 3890
echo To access preview:
echo   - Local: http://localhost:3890
echo ==========================================================
pause
