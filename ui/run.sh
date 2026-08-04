#!/usr/bin/env bash
PORT=5173
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Kill any existing process on the port
PID=$(lsof -ti tcp:$PORT)
if [ -n "$PID" ]; then
    kill -9 $PID
    echo "[$TIMESTAMP] Killed existing process (PID $PID) on port $PORT"
else
    echo "[$TIMESTAMP] No existing process on port $PORT"
fi

# Start the dev server
nohup npm run dev > ui.log 2>&1 &
NEW_PID=$!
echo "[$TIMESTAMP] Started My Journaly UI on port $PORT (PID $NEW_PID)"
echo "[$TIMESTAMP] Logs: tail -f ui/ui.log"
