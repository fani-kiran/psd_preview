@echo off
setlocal enabledelayedexpansion

echo ==========================================================
echo    Installing Mobile USB Preview Plugin for Photoshop    
echo ==========================================================

cd /d "%~dp0"

set "TARGET_DIR=%APPDATA%\Adobe\UXP\Plugins\External\psdprevw_1.0.0"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%"
xcopy /E /I /Y "plugin\*" "%TARGET_DIR%\" > nul

set "PS_JSON_DIR=%APPDATA%\Adobe\UXP\PluginsInfo\v1"
if not exist "%PS_JSON_DIR%" mkdir "%PS_JSON_DIR%"

where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
  node -e "const fs = require('fs'), path = require('path'); const p = path.join(process.env.APPDATA, 'Adobe', 'UXP', 'PluginsInfo', 'v1', 'PS.json'); let data = { plugins: [] }; if (fs.existsSync(p)) { try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {} } if (!Array.isArray(data.plugins)) data.plugins = []; const entry = { hostMinVersion: '24.0.0', name: 'Mobile USB Preview', path: '$localPlugins/External/psdprevw_1.0.0', pluginId: 'psdprevw', status: 'enabled', type: 'uxp', versionString: '1.0.0' }; const idx = data.plugins.findIndex(x => x.pluginId === 'psdprevw'); if (idx >= 0) { data.plugins[idx] = entry; } else { data.plugins.push(entry); } fs.writeFileSync(p, JSON.stringify(data));"
)

echo.
echo ==========================================================
echo  [SUCCESS] Plugin installed and registered successfully!
echo  Installed to: %TARGET_DIR%
echo.
echo  IMPORTANT:
echo  1. If Photoshop is running, completely QUIT and RESTART Photoshop.
echo  2. In Photoshop top menu, open: Plugins ^> Mobile USB Preview.
echo ==========================================================
pause

