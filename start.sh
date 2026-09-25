#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Ensure Android platform-tools & common Node paths are in PATH
export PATH="$HOME/Library/Android/sdk/platform-tools:/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p "$DIR/logs"

# Check if node is installed
NODE_BIN=$(which node 2>/dev/null || true)
if [ -z "$NODE_BIN" ]; then
  if [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  else
    echo "=========================================================="
    echo " [ERROR] Node.js is not installed on this Mac."
    echo " Please install Node.js from: https://nodejs.org"
    echo "=========================================================="
    exit 1
  fi
fi

# Check if node_modules are installed
if [ ! -d "bridge-server/node_modules" ]; then
  echo "Installing bridge dependencies..."
  cd bridge-server && npm install && cd ..
fi

PLIST_SRC="$DIR/daemon/com.psdpreview.bridge.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.psdpreview.bridge.plist"

# Check if user requested foreground mode
if [ "$1" == "--foreground" ] || [ "$1" == "-f" ]; then
  echo "Starting server in foreground mode (Ctrl+C to stop)..."
  # Free port 3890 if already bound
  OLD_PID=$(lsof -ti :3890 2>/dev/null || true)
  if [ -n "$OLD_PID" ]; then
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
  fi
  exec "$NODE_BIN" bridge-server/server.js
fi

# Background & Forever Mode via macOS LaunchAgent
echo "=========================================================="
echo "    Photoshop Mobile Preview - Background Daemon Manager   "
echo "=========================================================="

mkdir -p "$HOME/Library/LaunchAgents"

# Stop existing LaunchAgent instance if loaded
launchctl unload "$PLIST_DST" 2>/dev/null || true

# Free port 3890 if previously occupied
OLD_PID=$(lsof -ti :3890 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
fi

# Generate dynamic LaunchAgent plist for current directory & user
cat <<EOF > "$PLIST_DST"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.psdpreview.bridge</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$DIR/bridge-server/server.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$DIR/logs/server.log</string>
    <key>StandardErrorPath</key>
    <string>$DIR/logs/server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "$NODE_BIN"):$HOME/Library/Android/sdk/platform-tools:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

# Load and start LaunchAgent (Runs forever, auto-restarts on crash or reboot)
launchctl load -w "$PLIST_DST"

# Wait up to 3 seconds for server to bind port 3890
sleep 1.5

if lsof -i :3890 >/dev/null 2>&1; then
  echo ""
  echo " =========================================================="
  echo "  [SUCCESS] USB Bridge Server Running (Zero Wi-Fi Needed!)"
  echo " =========================================================="
  echo ""
  echo "  - Port:         3890"
  echo "  - Android USB:  http://localhost:3890 (via USB Debugging / ADB)"
  echo "  - iPhone USB:   Settings > Personal Hotspot > 'USB Only'"
  echo "  - Network:      100% Offline Physical USB Cable Only"
  echo "  - Log File:     $DIR/logs/server.log"
  echo "  - Auto-Restart: Enabled (Runs in background forever)"
  echo ""
  echo " Zero Terminal Needed! You can safely CLOSE this window."
  echo " Open Photoshop > Plugins > Mobile USB Preview to view canvas."
  echo "=========================================================="
else
  echo ""
  echo " [NOTE] Starting fallback background runner..."
  nohup "$NODE_BIN" bridge-server/server.js >> "$DIR/logs/server.log" 2>&1 &
  echo $! > "$DIR/.server.pid"
  sleep 1.5
  echo " Server running in background (PID: $(cat "$DIR/.server.pid"))."
fi
