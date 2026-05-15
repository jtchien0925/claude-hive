# QA Test Plan — Notifications Feature

Manual verification plan for the desktop-notifications feature that fires when
a session transitions into `waiting_approval`.

This plan is written to be executed against **Session 1's branch** once it
lands. It assumes the feature uses the standard Web Notifications API
(`window.Notification`) and exposes a bell-toggle in the UI to mute. If the
final implementation diverges, update the affected scenarios but keep the
acceptance criteria — those describe required behavior, not implementation.

## Setup

1. Wire up the mock CLI per `scripts/README.md` and confirm the server logs
   `[hive] Found claude at: <path-to-mock>` on boot.
2. Open `http://localhost:3000` in **Chrome or Firefox** (Safari's
   Notification permission UI behaves differently — note OS in bug reports).
3. **Reset notification permission for `localhost:3000` before each run**:
   - Chrome: site lock icon → Site settings → Notifications → Reset.
   - Firefox: site lock icon → Clear permissions.
   Without this, you can't re-test the first-time permission prompt.
4. Keep the browser DevTools console open for the full run — every scenario's
   pass criteria include "no console errors".

A scenario passes only if **all** acceptance criteria are met. File any
failure as a bug with: scenario number, repro steps, expected vs actual,
console screenshot, OS/browser.

---

## Scenario 1 — Permission grant flow

Three sub-cases. Reset permission to default between each.

### 1a. First-time grant

1. Permission state is "default" (never asked).
2. Spawn one mock session and let it reach `waiting_approval`.
3. **Expected:** browser shows the native permission prompt. After clicking
   "Allow", a desktop notification fires for this session.

**Acceptance:**
- Permission prompt appears exactly once.
- After grant, the notification for the current `waiting_approval` event
  fires (either immediately or on the next status transition — both are
  acceptable; document which the implementation does).
- No console errors.

### 1b. First-time denied

1. Permission state is "default".
2. Spawn a session, let it reach `waiting_approval`, click "Block" on the
   prompt.
3. **Expected:** no notification. The UI should not retry the prompt on
   subsequent `waiting_approval` events (browsers block re-prompts anyway,
   but the app should not throw or log errors).

**Acceptance:**
- No notification fires.
- No uncaught errors in the console.
- The session's in-app status indicator (`bg-amber-400 animate-pulse`) still
  works — denial of notifications must not break in-app state display.

### 1c. Previously granted

1. Permission state is already "granted" from a prior run (do **not** reset).
2. Spawn a session, let it reach `waiting_approval`.
3. **Expected:** no permission prompt, notification fires directly.

**Acceptance:**
- No permission prompt shown.
- Notification fires on the transition.
- No console errors.

---

## Scenario 2 — Single session, single notification

1. Permission granted.
2. Spawn one mock session.
3. Watch it transition `idle → streaming → waiting_approval`.

**Acceptance:**
- **Exactly one** desktop notification fires for this transition.
- The notification's title/body identifies the correct session (name + maybe
  working dir).
- Re-renders of the React tree (resize the window, switch tabs) do not
  produce duplicate notifications.

---

## Scenario 3 — Five simultaneous sessions

This is the hardest scenario. Notifications must not be collapsed.

1. Permission granted.
2. Spawn five mock sessions in quick succession (use "New session" five times
   within ~5 seconds — they'll all hit `waiting_approval` within a small
   window of each other).
3. Watch the OS notification center.

**Acceptance:**
- **Five distinct notifications** appear in the OS notification center, one
  per session. macOS may stack them under the app group — that's OS-level
  grouping, not collapse; check the stack contains five.
- Each notification's body references a different session (no duplicates of
  the same session name).
- Order of notifications matches order of `waiting_approval` transitions
  (verify against server logs if uncertain).
- No console errors.

**Common failure mode to watch for:** an effect keyed off "any session is
waiting" instead of per-session transitions — that fires once for the first
session and silently drops the other four.

---

## Scenario 4 — Re-entry into `waiting_approval`

Dedupe must be **per-transition**, not per-session-lifetime.

1. Permission granted.
2. Spawn one mock session pointed at `claude-loop` (or pass `--loop` — see
   `scripts/README.md`).
3. Session reaches `waiting_approval` → notification fires (#1).
4. In the session's terminal pane, type `y<Enter>`. The mock answers and
   re-prompts; the server should briefly leave `waiting_approval` (status
   flips to `streaming` or `idle` as new output arrives) and then re-enter.
5. **Expected:** a second notification fires on the re-entry.

**Acceptance:**
- Two notifications total for the two transitions into `waiting_approval`.
- Dedupe state must reset on the transition **out** of `waiting_approval`,
  not on user interaction with the notification.
- Repeat one more cycle to confirm: three transitions → three notifications.

---

## Scenario 5 — Bell toggle off

1. Permission granted.
2. Locate the bell-toggle in the UI and turn it **off**.
3. Spawn a session, let it reach `waiting_approval`.

**Acceptance:**
- No notification fires.
- No `Notification` constructor call is made — verify by checking that
  permission is not re-prompted even if permission was somehow reset (a
  belt-and-suspenders check that the toggle short-circuits before the API
  call).
- In-app status indicator still updates normally.
- Toggle the bell back **on**, trigger another `waiting_approval` (use
  `--loop` mode), confirm notifications resume immediately — no page
  reload required.

---

## Scenario 6 — Page refresh while already in `waiting_approval`

The trickiest correctness case. Notifications must fire on **fresh
transitions**, not on stale state observed at load.

1. Permission granted.
2. Spawn a session, let it reach `waiting_approval`, dismiss the notification.
3. **Refresh the page** (Cmd+R / Ctrl+R) while the session is still in
   `waiting_approval`.

**Acceptance:**
- After reload, the session appears in the UI with its `waiting_approval`
  status indicator pulsing.
- **No notification fires** during the reload — the session was already in
  `waiting_approval` before the page existed; the user has already been
  notified.
- Now have the session leave and re-enter `waiting_approval` (loop mode or
  spawn another session that hits the state) — that **must** fire a
  notification. Reload is not allowed to permanently suppress future
  notifications for sessions that were already-pending at load time.

**Implementation note for reviewers:** the dedupe key cannot be just
`sessionId` — it has to be `sessionId + transition-counter` or equivalent,
so a fresh client doesn't see "this session is in waiting_approval" as a
new transition. The most common bug here is firing one notification on
every page load for every already-pending session.

---

## Scenario 7 — Browser without Notification API

Some browsers, private modes, and embedded webviews don't expose
`window.Notification`. Feature must degrade silently.

**Repro (Chrome DevTools, easiest):**
1. Open DevTools → Console.
2. Run: `delete window.Notification` (this only removes it for the current
   page session — refresh restores it).
3. Spawn a session and let it reach `waiting_approval`.

**Acceptance:**
- No console errors, no uncaught exceptions, no red text.
- In-app status indicator continues to work (the pulsing amber dot still
  appears).
- The bell-toggle either hides itself or disables itself gracefully — it
  must not crash when clicked.
- The app remains fully usable; nothing else breaks.

---

## Scenario 8 — Notification click focuses window + selects session

1. Permission granted.
2. Spawn two mock sessions (call them A and B).
3. Switch focus to another application (cmd-tab away).
4. Wait for B to hit `waiting_approval`. Click the desktop notification.

**Acceptance:**
- The browser window/tab containing claude-hive comes to the foreground.
- The UI navigates to / selects session B (not A, not the most-recently-
  selected one, not the first in the list).
- If multiple notifications are pending, clicking notification for session
  B selects B; clicking the one for A then selects A.
- No console errors.

---

## Regression smoke (run after all scenarios)

After running scenarios 1–8, confirm the feature didn't break adjacent
functionality:

- Session creation / deletion still works.
- Terminal panes still attach to the correct PTY.
- Status detection for non-`waiting_approval` states (`idle`, `streaming`,
  `tool_use`, `stopped`) still flips colors correctly in the sidebar.
- Theme toggle still works.
- Console: no errors logged across any scenario.

---

## Sign-off

Once all eight scenarios pass plus the regression smoke:
- Comment on Session 1's PR with a checklist of which scenarios passed,
  link this doc, and note browser/OS used.
- If any scenario fails, file individual issues — do not approve until all
  blocking scenarios pass. Scenarios 3, 4, and 6 are the most likely to
  expose real bugs; treat any failure there as a blocker.
