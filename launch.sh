#!/bin/bash
# Launch Claude Hive: hive server on :9900, web dashboard on :3000.
# Verifies each process actually came up before declaring success — silently
# reporting "running" while a process has crashed is worse than reporting
# the crash. Per-process logs are kept under .hive-logs/ for debugging.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Colors
AMBER='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[0;90m'
NC='\033[0m'

echo -e "${AMBER}⬡ Claude Hive${NC} — starting up..."
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${DIM}Installing dependencies...${NC}"
  pnpm install
fi

# Per-process log directory (gitignored)
LOG_DIR="$DIR/.hive-logs"
mkdir -p "$LOG_DIR"
SERVER_LOG="$LOG_DIR/server.log"
WEB_LOG="$LOG_DIR/web.log"

# Kill any existing hive processes on our ports
lsof -ti:9900 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Wait for a TCP port to start accepting connections, or time out.
# Returns 0 if the port binds within the deadline, 1 otherwise.
wait_for_port() {
  local port="$1"
  local timeout_secs="$2"
  local deadline=$(($(date +%s) + timeout_secs))
  while [ $(date +%s) -lt $deadline ]; do
    if lsof -i ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

# Print the tail of a log file with a labeled banner.
show_log_tail() {
  local label="$1"
  local file="$2"
  echo -e "${DIM}--- last 30 lines of $label log ($file) ---${NC}"
  if [ -f "$file" ]; then
    tail -n 30 "$file"
  else
    echo -e "${DIM}(no log captured)${NC}"
  fi
  echo -e "${DIM}--- end log ---${NC}"
}

# Track whether anything failed, but don't bail mid-startup — show the user
# what we know and clean up rather than leaving zombie processes.
STARTUP_OK=1

# ── Start hive server ───────────────────────────────────────────
echo -e "${GREEN}▸${NC} Starting hive server on :9900"
( cd packages/server && pnpm dev ) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

# Server should bind quickly — give it 15s to be generous on cold starts.
if ! wait_for_port 9900 15; then
  STARTUP_OK=0
  echo -e "${RED}✗${NC} Hive server did not bind to :9900 within 15s"
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo -e "${RED}  → server process exited${NC}"
  fi
  show_log_tail "server" "$SERVER_LOG"
fi

# ── Start web dashboard ─────────────────────────────────────────
echo -e "${GREEN}▸${NC} Starting web dashboard on :3000"
( cd apps/web && pnpm dev ) >"$WEB_LOG" 2>&1 &
WEB_PID=$!

# Next dev is slower to bind — allow 30s for first compile.
if ! wait_for_port 3000 30; then
  STARTUP_OK=0
  echo -e "${RED}✗${NC} Web dashboard did not bind to :3000 within 30s"
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo -e "${RED}  → web process exited${NC}"
  fi
  show_log_tail "web" "$WEB_LOG"
fi

cleanup() {
  echo -e "\n${AMBER}⬡${NC} Shutting down..."
  kill "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
  wait "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Stopped"
}
trap cleanup SIGINT SIGTERM

# ── Report status ───────────────────────────────────────────────
echo ""
if [ $STARTUP_OK -eq 1 ]; then
  echo -e "${GREEN}✓${NC} Claude Hive is running"
  echo -e "  ${DIM}Dashboard:${NC}  http://localhost:3000"
  echo -e "  ${DIM}Server:${NC}     ws://localhost:9900"
  echo -e "  ${DIM}Logs:${NC}       $LOG_DIR/"
  echo ""
  echo -e "${DIM}Press Ctrl+C to stop${NC}"
  open "http://localhost:3000" 2>/dev/null || true
else
  echo -e "${RED}✗${NC} Claude Hive failed to start cleanly. See logs above."
  echo -e "${DIM}  Full logs in: $LOG_DIR/${NC}"
  echo -e "${DIM}  Common cause: incompatible Node version. CI tests Node 20 + 22.${NC}"
  echo -e "${DIM}  Current: $(node --version 2>/dev/null || echo 'node not found')${NC}"
  cleanup
  exit 1
fi

# Block until either child exits, then clean up the other.
wait -n "$SERVER_PID" "$WEB_PID" 2>/dev/null || true
echo -e "${RED}✗${NC} A Claude Hive process exited unexpectedly. Tail of logs:"
if ! kill -0 "$SERVER_PID" 2>/dev/null; then show_log_tail "server" "$SERVER_LOG"; fi
if ! kill -0 "$WEB_PID" 2>/dev/null; then show_log_tail "web" "$WEB_LOG"; fi
cleanup
exit 1
