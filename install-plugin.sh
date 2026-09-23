#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    Installing Mobile USB Preview Plugin for Photoshop    "
echo "=========================================================="

# 1. Rebuild latest .ccx package if packaging script is present
if [ -f "scripts/package-plugin.js" ]; then
  node scripts/package-plugin.js > /dev/null 2>&1 || true
fi

# 2. Check for Adobe UnifiedPluginInstallerAgent
UPIA="/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/MacOS/UnifiedPluginInstallerAgent"

if [ -x "$UPIA" ] && [ -f "$DIR/psd-mobile-preview.ccx" ]; then
  echo "--> Registering plugin via Adobe Unified Plugin Installer..."
  "$UPIA" --install "$DIR/psd-mobile-preview.ccx" > /dev/null 2>&1 || true
fi

# 3. Ensure files are directly in UXP Plugins/External directory
TARGET_DIR="$HOME/Library/Application Support/Adobe/UXP/Plugins/External/psdprevw_1.0.0"
mkdir -p "$TARGET_DIR"
cp -R plugin/* "$TARGET_DIR/"

# 4. Ensure plugin is registered in Adobe UXP PS.json
PS_JSON_DIR="$HOME/Library/Application Support/Adobe/UXP/PluginsInfo/v1"
PS_JSON="$PS_JSON_DIR/PS.json"
mkdir -p "$PS_JSON_DIR"

if command -v node > /dev/null 2>&1; then
  node -e "
    const fs = require('fs');
    const p = '$PS_JSON';
    let data = { plugins: [] };
    if (fs.existsSync(p)) {
      try { data = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
    }
    if (!Array.isArray(data.plugins)) data.plugins = [];
    const entry = {
      hostMinVersion: '24.0.0',
      name: 'Mobile USB Preview',
      path: '\$localPlugins/External/psdprevw_1.0.0',
      pluginId: 'psdprevw',
      status: 'enabled',
      type: 'uxp',
      versionString: '1.0.0'
    };
    const idx = data.plugins.findIndex(x => x.pluginId === 'psdprevw');
    if (idx >= 0) {
      data.plugins[idx] = entry;
    } else {
      data.plugins.push(entry);
    }
    fs.writeFileSync(p, JSON.stringify(data));
  "
fi

# 5. Automatically start the background bridge server
echo ""
echo "=========================================================="
echo "    Starting USB Bridge Server in Background...           "
echo "=========================================================="
"$DIR/start.sh"

echo ""
echo "=========================================================="
echo " [SUCCESS] Plugin & Server Setup Complete!"
echo " Plugin Directory: $TARGET_DIR"
echo ""
echo " IMPORTANT NEXT STEPS:"
if pgrep -i "Photoshop" > /dev/null; then
  echo " ⚠️  Photoshop is currently running!"
  echo "    You MUST QUIT Photoshop (Cmd+Q) and reopen it"
  echo "    for the Plugins menu to refresh."
else
  echo " 1. Open Photoshop."
fi
echo " 2. In the Photoshop menu bar, open:"
echo "    Plugins > Mobile USB Preview"
echo " 3. Connect your phone via USB cable and open the preview URL!"
echo "=========================================================="


