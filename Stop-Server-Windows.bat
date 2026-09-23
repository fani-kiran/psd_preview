@echo off
setlocal enabledelayedexpansion

echo ==========================================================
echo    Stopping Photoshop Mobile Preview Server
echo ==========================================================

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3890') do (
  taskkill /F /PID %%a 2>nul
)

echo [SUCCESS] Bridge server stopped. Port 3890 is free.
echo ==========================================================
pause
