#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Colors
AMBER='\033[0;33m'
GREEN='\033[0;32m'
DIM='\033[0;90m'
NC='\033[0m'

echo -e "${AMBER}⬡ Claude Hive${NC} — starting up..."
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
  echo -e "${DIM}Installing dependencies...${NC}"
  pnpm install
fi

# Kill any existing hive processes on our ports
lsof -ti:9900 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Start server in background
echo -e "${GREEN}▸${NC} Starting hive server on :9900"
cd packages/server
pnpm dev &
SERVER_PID=$!
cd "$DIR"

# Wait a moment for server to start
sleep 1

# Start web app
echo -e "${GREEN}▸${NC} Starting web dashboard on :3000"
cd apps/web
pnpm dev &
WEB_PID=$!
cd "$DIR"

# Wait for web to be ready, then open browser
sleep 3
echo -e ""
echo -e "${GREEN}✓${NC} Claude Hive is running"
echo -e "  ${DIM}Dashboard:${NC}  http://localhost:3000"
echo -e "  ${DIM}Server:${NC}     ws://localhost:9900"
echo -e ""
echo -e "${DIM}Press Ctrl+C to stop${NC}"

# Open browser
open "http://localhost:3000" 2>/dev/null || true

# Wait and handle shutdown
cleanup() {
  echo -e "\n${AMBER}⬡${NC} Shutting down..."
  kill $SERVER_PID $WEB_PID 2>/dev/null || true
  wait $SERVER_PID $WEB_PID 2>/dev/null || true
  echo -e "${GREEN}✓${NC} Stopped"
}

trap cleanup SIGINT SIGTERM
wait
