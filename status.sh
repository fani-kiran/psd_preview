#!/usr/bin/env bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID=$(lsof -ti :3890 2>/dev/null || true)

echo "=========================================================="
echo "    Photoshop Mobile Preview - Server Status             "
echo "=========================================================="

if [ -n "$PID" ]; then
  echo " Status:      RUNNING (PID: $PID)"
  echo " Port:        3890"
  
  # Fetch JSON status from server API
  API_STATUS=$(curl -s --max-time 2 http://localhost:3890/api/status 2>/dev/null || true)
  if [ -n "$API_STATUS" ]; then
    PS_CONN=$(echo "$API_STATUS" | grep -o '"photoshopConnected":[^,]*' | cut -d: -f2)
    MOBILE_COUNT=$(echo "$API_STATUS" | grep -o '"mobileClientsCount":[^,]*' | cut -d: -f2)
    DOC_NAME=$(echo "$API_STATUS" | grep -o '"name":"[^"]*"' | head -1 | cut -d: -f2 | tr -d '"')
    ADB_CONN=$(echo "$API_STATUS" | grep -o '"adb":{"available":[^}]*' | grep -o '"connected":[^,]*' | cut -d: -f2)
    ADB_DEV=$(echo "$API_STATUS" | grep -o '"device":"[^"]*"' | head -1 | cut -d: -f2 | tr -d '"')
    echo " Photoshop:   Connected ($PS_CONN)"
    echo " Mobile Apps: $MOBILE_COUNT connected"
    echo " Active Doc:  $DOC_NAME"
    if [ "$ADB_CONN" == "true" ]; then
      echo " Android USB: Connected via ADB ($ADB_DEV) -> http://localhost:3890"
    else
      echo " Android USB: Waiting for USB connection"
    fi
  fi
  echo ""
  echo " Recent Logs (logs/server.log):"
  echo " --------------------------------------------------------"
  tail -n 10 "$DIR/logs/server.log" 2>/dev/null || echo " No log entries yet."
else
  echo " Status:      STOPPED (Port 3890 is free)"
  echo " To start:    Run ./start.sh or double click 'Start Server.app'"
fi
echo "=========================================================="
