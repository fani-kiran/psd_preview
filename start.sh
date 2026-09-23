#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

mkdir -p "$DIR/logs"

# Check if node_modules are installed
if [ ! -d "bridge-server/node_modules" ]; then
  echo "Installing bridge dependencies..."
  cd bridge-server && npm install && cd ..
fi

NODE_BIN=$(which node || echo "/usr/local/bin/node")
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

# Copy latest plist to ~/Library/LaunchAgents
cp "$PLIST_SRC" "$PLIST_DST"

# Load and start LaunchAgent (Runs forever, auto-restarts on crash or reboot)
launchctl load -w "$PLIST_DST"

# Wait up to 3 seconds for server to bind port 3890
sleep 1.5

if lsof -i :3890 >/dev/null 2>&1; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
  echo ""
  echo " [SUCCESS] Server is running in the background FOREVER!"
  echo ""
  echo "  - Port:         3890"
  echo "  - Mobile URL:   http://${LOCAL_IP}:3890"
  echo "  - Log File:     $DIR/logs/server.log"
  echo "  - Auto-Restart: Enabled (Runs forever, revives on crash/reboot)"
  echo ""
  echo " Zero Terminal Needed! You can safely CLOSE this terminal window."
  echo " To stop anytime, run: ./stop.sh (or double click 'Stop Server.app')"
  echo "=========================================================="
else
  echo ""
  echo " [NOTE] Starting fallback background runner..."
  nohup "$NODE_BIN" bridge-server/server.js >> "$DIR/logs/server.log" 2>&1 &
  echo $! > "$DIR/.server.pid"
  sleep 1.5
  echo " Server running in background (PID: $(cat "$DIR/.server.pid"))."
fi
