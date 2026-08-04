#!/usr/bin/env bash
PORT=8090
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Use separate gcloud config so business project ADC is unaffected
export CLOUDSDK_CONFIG="$HOME/.config/gcloud-journaly"

# Kill any existing process on the port
PID=$(lsof -ti tcp:$PORT)
if [ -n "$PID" ]; then
    kill -9 $PID
    echo "[$TIMESTAMP] Killed existing process (PID $PID) on port $PORT"
else
    echo "[$TIMESTAMP] No existing process on port $PORT"
fi

# Start the service
nohup uv run uvicorn app.main:app --reload --port $PORT > api.log 2>&1 &
NEW_PID=$!
echo "[$TIMESTAMP] Started My Journaly API on port $PORT (PID $NEW_PID)"
echo "[$TIMESTAMP] Logs: tail -f api/api.log"
