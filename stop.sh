#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_DST="$HOME/Library/LaunchAgents/com.psdpreview.bridge.plist"

echo "=========================================================="
echo "    Stopping Photoshop Mobile Preview Bridge Server       "
echo "=========================================================="

# Unload from LaunchAgent
if [ -f "$PLIST_DST" ]; then
  launchctl unload "$PLIST_DST" 2>/dev/null || true
  rm -f "$PLIST_DST"
fi

# Kill background PID if tracked
if [ -f "$DIR/.server.pid" ]; then
  PID=$(cat "$DIR/.server.pid")
  kill -9 $PID 2>/dev/null || true
  rm -f "$DIR/.server.pid"
fi

# Kill any remaining process on port 3890
PIDS=$(lsof -ti :3890 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
fi

echo " [STOPPED] Bridge server has been stopped and unloaded."
echo "=========================================================="
