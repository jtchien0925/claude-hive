# QA scripts

## `mock-claude.sh` — fake Claude CLI for notification testing

A drop-in stand-in for the real `claude` binary that the server discovers via
`findClaude()` in `packages/server/src/session-manager.ts`. It streams output
and then prints `Allow this action? (y/n)`, which is the trigger pattern
`detectStatus()` matches to mark a session as `waiting_approval` — the state
the notifications feature listens for.

### Pointing claude-hive at the mock

`findClaude()` resolves the binary by running `which claude` under a **login
shell** (`$SHELL -lc 'which claude'`). That means you can't just `export
PATH=...` in the same terminal — the login shell may re-read your dotfiles and
override the prepended path. Pick one of the two approaches below.

#### Option A — temporary mock dir on PATH (recommended for a single test run)

Create a sibling directory containing a `claude` symlink, then start the dev
server with that dir prepended to PATH. Login-shell dotfiles on most setups
**prepend** their own paths to whatever PATH they inherit, so a path you
inject before they run typically survives. Verify with the check below.

```bash
mkdir -p /tmp/hive-mock-bin
ln -sf "$(pwd)/scripts/mock-claude.sh" /tmp/hive-mock-bin/claude

# Verify the mock wins under a login shell (this is what findClaude() does):
PATH="/tmp/hive-mock-bin:$PATH" zsh -lc 'which claude'
# → /tmp/hive-mock-bin/claude   ✅  good — proceed
# → /opt/homebrew/bin/claude    ❌  your dotfiles override; use Option B

# Then start claude-hive:
PATH="/tmp/hive-mock-bin:$PATH" pnpm dev
```

The server logs `[hive] Found claude at: ...` on startup — confirm it points
to the mock before spawning sessions.

#### Option B — persistent mock dir (works regardless of dotfiles)

Add the mock dir to PATH in `~/.zshenv` (sourced by **every** zsh invocation,
including `-lc`):

```bash
echo 'export PATH="$HOME/hive-mock-bin:$PATH"' >> ~/.zshenv
mkdir -p ~/hive-mock-bin
ln -sf "$(pwd)/scripts/mock-claude.sh" ~/hive-mock-bin/claude
```

Remove the export when you're done QA'ing — otherwise every future shell will
keep finding the mock first.

### Spawning four mock sessions

With the mock wired up, open the claude-hive web UI and create four sessions
via "New session". Working directory can be anything (the mock ignores it).
Each session will, after ~1s, print the approval prompt and the server will
flip its status to `waiting_approval` — at which point the notifications
feature should fire (see `docs/qa-notifications.md` for the full test plan).

To test the **re-entry** scenario (session goes back into `waiting_approval`
after the user answers), launch with the looped variant — set the initial
prompt to `--loop` in the New Session dialog, or symlink a second wrapper:

```bash
cat > ~/hive-mock-bin/claude-loop <<'EOF'
#!/usr/bin/env bash
exec "$HOME/hive-mock-bin/claude" --loop "$@"
EOF
chmod +x ~/hive-mock-bin/claude-loop
```

…then point `findClaude()` at `claude-loop` for that test, or just type `y`
in the session's terminal pane to send the approval down — the mock in
`--loop` mode will re-prompt indefinitely.

### Cleaning up

```bash
rm -rf /tmp/hive-mock-bin ~/hive-mock-bin
# And undo the ~/.zshenv export if you used Option B.
```
