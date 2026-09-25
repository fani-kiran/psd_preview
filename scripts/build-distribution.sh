#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    Building Single Distribution Packages for Mac & Win   "
echo "=========================================================="

# 1. Ensure latest plugin CCX is packaged
node scripts/package-plugin.js

DIST_DIR="$DIR/dist"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# ----------------------------------------------------
# A. BUILD MAC DISTRIBUTION PACKAGE
# ----------------------------------------------------
echo ""
echo "--> Creating macOS Distribution Package..."
MAC_STAGING="$DIST_DIR/Photoshop-Mobile-Preview-Mac"
mkdir -p "$MAC_STAGING"

# Copy essential files
cp -R "Install Plugin (Mac).command" "$MAC_STAGING/"
cp -R "Start PS Preview.app" "$MAC_STAGING/"
cp -R "Stop PS Preview.app" "$MAC_STAGING/"
cp -R "install-plugin.sh" "$MAC_STAGING/"
cp -R "start.sh" "$MAC_STAGING/"
cp -R "stop.sh" "$MAC_STAGING/"
cp -R "status.sh" "$MAC_STAGING/"
cp -R "psd-mobile-preview.ccx" "$MAC_STAGING/"
cp -R "USER_GUIDE.md" "$MAC_STAGING/"
cp -R "README.md" "$MAC_STAGING/"
cp -R "plugin" "$MAC_STAGING/"
cp -R "mobile-client" "$MAC_STAGING/"
cp -R "daemon" "$MAC_STAGING/"

# Copy bridge-server with pre-installed node_modules
mkdir -p "$MAC_STAGING/bridge-server"
cp -R "bridge-server/server.js" "$MAC_STAGING/bridge-server/"
cp -R "bridge-server/package.json" "$MAC_STAGING/bridge-server/"
cp -R "bridge-server/package-lock.json" "$MAC_STAGING/bridge-server/"
if [ -d "bridge-server/node_modules" ]; then
  cp -R "bridge-server/node_modules" "$MAC_STAGING/bridge-server/"
fi

# Ensure executable permissions
chmod +x "$MAC_STAGING/Install Plugin (Mac).command"
chmod +x "$MAC_STAGING/install-plugin.sh"
chmod +x "$MAC_STAGING/start.sh"
chmod +x "$MAC_STAGING/stop.sh"
chmod +x "$MAC_STAGING/status.sh"
chmod +x "$MAC_STAGING/Start PS Preview.app/Contents/MacOS/applet" 2>/dev/null || true
chmod +x "$MAC_STAGING/Stop PS Preview.app/Contents/MacOS/applet" 2>/dev/null || true

# Create Mac Zip
(cd "$DIST_DIR" && zip -r -q "Photoshop-Mobile-Preview-Mac.zip" "Photoshop-Mobile-Preview-Mac")
rm -rf "$MAC_STAGING"
echo "    [SUCCESS] Created: dist/Photoshop-Mobile-Preview-Mac.zip ($(du -h "$DIST_DIR/Photoshop-Mobile-Preview-Mac.zip" | cut -f1))"

# ----------------------------------------------------
# B. BUILD WINDOWS DISTRIBUTION PACKAGE
# ----------------------------------------------------
echo ""
echo "--> Creating Windows Distribution Package..."
WIN_STAGING="$DIST_DIR/Photoshop-Mobile-Preview-Windows"
mkdir -p "$WIN_STAGING"

# Copy Windows essential files
cp -R "Install-Plugin-Windows.bat" "$WIN_STAGING/"
cp -R "Start-Server-Windows.bat" "$WIN_STAGING/"
cp -R "Stop-Server-Windows.bat" "$WIN_STAGING/"
cp -R "psd-mobile-preview.ccx" "$WIN_STAGING/"
cp -R "USER_GUIDE.md" "$WIN_STAGING/"
cp -R "README.md" "$WIN_STAGING/"
cp -R "plugin" "$WIN_STAGING/"
cp -R "mobile-client" "$WIN_STAGING/"

# Copy bridge-server with node_modules
mkdir -p "$WIN_STAGING/bridge-server"
cp -R "bridge-server/server.js" "$WIN_STAGING/bridge-server/"
cp -R "bridge-server/package.json" "$WIN_STAGING/bridge-server/"
cp -R "bridge-server/package-lock.json" "$WIN_STAGING/bridge-server/"
if [ -d "bridge-server/node_modules" ]; then
  cp -R "bridge-server/node_modules" "$WIN_STAGING/bridge-server/"
fi

# Create Windows Zip
(cd "$DIST_DIR" && zip -r -q "Photoshop-Mobile-Preview-Windows.zip" "Photoshop-Mobile-Preview-Windows")
rm -rf "$WIN_STAGING"
echo "    [SUCCESS] Created: dist/Photoshop-Mobile-Preview-Windows.zip ($(du -h "$DIST_DIR/Photoshop-Mobile-Preview-Windows.zip" | cut -f1))"

echo ""
echo "=========================================================="
echo " [COMPLETE] Both distribution zip packages are ready in:"
echo "   - dist/Photoshop-Mobile-Preview-Mac.zip"
echo "   - dist/Photoshop-Mobile-Preview-Windows.zip"
echo "=========================================================="
