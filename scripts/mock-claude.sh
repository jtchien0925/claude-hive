#!/usr/bin/env bash
# Mock claude CLI for manual QA of the notifications feature.
#
# Mimics the surface area that packages/server/src/session-manager.ts uses:
#   - Accepts an optional `-p '<prompt>'` flag (silently ignored).
#   - Streams a few lines of output, then prints "Allow this action? (y/n)".
#   - Waits on stdin. Any reply continues; in --loop mode it re-prompts.
#
# The line "Allow this action? (y/n)" is the trigger string detectStatus()
# looks for ("Allow" and "(y/n)" both match), so the server marks the session
# as `waiting_approval`, which is what the notifications feature listens for.
#
# Flags:
#   -p '<prompt>'   Match real CLI flag. Echoed back, not otherwise used.
#   --loop          After the user answers, prompt again. Useful for testing
#                   re-entry into waiting_approval (dedupe-reset scenario).
#   --help          Print this header and exit.
#
# Env:
#   MOCK_CLAUDE_DELAY  Seconds between output chunks (default 0.5).
#
# See scripts/README.md for how to point claude-hive at this script.

set -u

PROMPT=""
LOOP=0
DELAY="${MOCK_CLAUDE_DELAY:-0.5}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p)
      PROMPT="${2:-}"
      shift 2
      ;;
    --loop)
      LOOP=1
      shift
      ;;
    --help|-h)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

echo "[mock-claude] starting (pid=$$)"
if [[ -n "$PROMPT" ]]; then
  echo "[mock-claude] received prompt: $PROMPT"
fi

while :; do
  echo "[mock-claude] thinking..."
  sleep "$DELAY"
  echo "[mock-claude] I want to run a tool."
  sleep "$DELAY"
  echo ""
  echo "Allow this action? (y/n)"

  if ! IFS= read -r reply; then
    break
  fi

  echo "[mock-claude] you said: ${reply:-<empty>}"

  if [[ $LOOP -eq 0 ]]; then
    break
  fi

  sleep "$DELAY"
done

echo "[mock-claude] done."
