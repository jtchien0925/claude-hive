# Review-Readiness Audit: `feat/notifications`

**Audience:** Session 1 (notifications implementer) — read this before pushing your PR.
**Reviewer:** Session 2 (this audit)
**Scope:** Pre-implementation audit of the three codepaths notifications will touch. No code changes proposed here — just risks, current behavior, and a protocol recommendation.

---

## 1. `packages/server/src/session-manager.ts` — `detectStatus()` (line 186)

### Current logic (lines 189–201)

```ts
if (data.includes("⏳") || data.includes("Running") || data.includes("Executing")) {
  managed.info.status = "tool_use";
  managed.info.metrics.toolCalls++;
} else if (data.includes("Allow") || data.includes("(y/n)") || data.includes("approve")) {
  managed.info.status = "waiting_approval";
} else if (data.includes("❯") || data.includes(">") || data.includes("$")) {
  managed.info.status = "idle";
} else if (data.length > 20) {
  managed.info.status = "streaming";
}
```

The `data` argument is **a single PTY chunk** (often a partial line, sometimes mid-word). It's matched as a raw substring against ANSI-bearing terminal output — `stripAnsi()` is **not** applied before the check.

### False-positive risk for `waiting_approval`

`waiting_approval` is the loudest signal we'd want to notify on (user is blocked). Mis-firing it will train users to ignore the bell. The substrings are all dangerously generic:

#### `"Allow"` — case-sensitive, unanchored
Triggers on any chunk containing the literal substring `Allow`, anywhere, including inside prose Claude is writing.

Concrete cases that will mis-fire today:
- Claude explaining code: *"This function will **Allow** users to authenticate."*
- Code blocks Claude prints: `// Allow CORS for localhost`, `app.use(cors({ origin: 'Allow' }))`
- Error messages Claude is summarizing: *"`PermissionError: not Allowed`"* — `Allowed` contains `Allow`
- Markdown headings Claude generates: `### Allowed file types`
- File paths surfaced in tool output: `/etc/hosts.allow` (no — capital `A`), but `Allowlist.md`, `AllowedOrigins`, etc. all hit
- Prose around the word "allow" in any header/title-cased context

#### `"(y/n)"` — narrowest of the three, but still leaks
This is the closest to a true approval-prompt signal, but Claude often *describes* prompts rather than emits them:
- *"The CLI asks `Continue? (y/n)` before deleting…"*
- A README or man page Claude is reading aloud: `"Use --force to skip the (y/n) prompt"`
- Code Claude is writing: `console.log("Confirm (y/n): ")`
- Test fixtures: `expect(stdout).toContain("(y/n)")`

#### `"approve"` — case-sensitive, unanchored, lowercase
Worst offender by recall:
- *"I'll **approve** that approach."* — Claude's own phrasing
- *"Once you approve, I'll merge."*
- Code: `if (user.approved) { … }`, `.approve()` method calls, `auto_approve: true`
- GitHub-related output: `gh pr review --approve`, `Approvals: 1`, `approved by jtchien0925`
- Any discussion of PR review, code review, or auth flows
- `disapprove`, `unapproved`, `approver`, `approved` all contain `approve`

### Additional structural risks

1. **Chunk boundary problem.** PTY chunks split on arbitrary byte boundaries, so the *real* approval prompt (e.g., `❯ 1. Yes\n  2. No`) may arrive over multiple `data` callbacks and never be matched as a single substring — meanwhile the false-positives above arrive in single chunks of streaming prose and hit immediately. The detector's recall on the real signal is probably worse than its precision on the noise.
2. **ANSI not stripped.** Color codes can split or break the substrings the matcher is looking for, further reducing recall on the actual prompt.
3. **Else-if order swallows transitions.** If a chunk contains both `"Running"` and `"approve"`, `tool_use` wins and `waiting_approval` is missed. Real Claude output frequently mixes both within one streaming burst.
4. **Status oscillation.** `idle` triggers on `">"` or `"$"` — every shell prompt, every `>` in markdown blockquotes, every `>` in JSX/HTML. A single streaming chunk can flip the session through `streaming → idle → streaming` repeatedly. **This is the core dedupe problem the notifications feature must handle.** See §3.

### Suggested test cases for Session 1's PR

The detector should be tested against these strings to demonstrate that the current matcher has these defects (and that any new logic the notifications feature adds — e.g., dedupe by transition — accounts for them). These are **inputs that should NOT raise `waiting_approval`** but currently do:

| # | Input chunk | Reason it should not fire |
|---|---|---|
| 1 | `"This will Allow the request to proceed.\n"` | Prose, not a prompt |
| 2 | `"// Allow CORS\napp.use(cors())\n"` | Code comment |
| 3 | `"Approved by reviewer\n"` | GitHub status line |
| 4 | `"Run \`gh pr review --approve\` to merge\n"` | Documentation prose |
| 5 | `"The CLI prompts (y/n) before deletion.\n"` | Description of a prompt, not the prompt itself |
| 6 | `"AllowedOrigins: ['localhost']\n"` | Config snippet |
| 7 | `"I'll approve that approach.\n"` | Claude's own meta-commentary |
| 8 | `"function approveTransaction() {\n"` | Code Claude is writing |

And **inputs that SHOULD fire but might not** (chunk-split or ANSI-wrapped):

| # | Input | Why it might miss |
|---|---|---|
| 9 | `"\x1b[33mDo you want to allow this?\x1b[0m\n"` | ANSI between letters can split the substring (depends on chunking, but the matcher gives no margin) |
| 10 | Two chunks: `"Do you want to "` then `"allow this? (y/n)"` | Substring search is per-chunk; the prompt arrives split |
| 11 | The actual Claude Code permission UI: `"❯ 1. Yes\n  2. No, and tell Claude what to do differently"` | Contains none of `Allow` / `(y/n)` / `approve` — current matcher misses entirely |

**Recommendation for Session 1:** Don't try to fix the detector in the notifications PR — that's a separate problem. But assume the signal is **noisy** when designing dedupe, and write tests that confirm the notification layer doesn't fire on cases 1–8 even though the underlying status flips.

---

## 2. `apps/web/lib/use-hive.ts` — WebSocket reducer / state-update pattern

### Current shape

There is **no reducer** — `useHive` uses individual `useState` calls per slice (`sessions`, `groups`, `connected`, `homeDir`, `browseDirs`) and updates them inside the `ws.onmessage` switch (lines 42–135).

### `session_updated` handler — the relevant one (lines 67–86)

```ts
case "session_updated":
  setSessions((prev) =>
    prev.map((s) => {
      if (s.id !== msg.session.id) return s;
      if (
        s.status === msg.session.status &&
        s.name === msg.session.name &&
        s.color === msg.session.color &&
        s.workingDir === msg.session.workingDir
      ) {
        // Mutate metrics in place — these don't affect rendering
        s.metrics = msg.session.metrics;
        return s;
      }
      return msg.session;
    })
  );
  break;
```

### Implications for notifications

**Good news:**
- Prev-vs-next status comparison is **trivial to wire in here**. The handler already has `s.status` (prev) and `msg.session.status` (next) in scope at line 74. A notification dispatch can sit right next to the existing status comparison without restructuring anything.
- The handler does **not** collapse transitions — every `session_updated` from the server hits this code. Server-side, `notifyUpdate` is only called when `prev !== managed.info.status` in `detectStatus` (session-manager.ts:245), so the WS message itself is already transition-gated.
- React state updates here use immutable replacement (`return msg.session`) for visible changes, so a `useEffect` watching `sessions` would re-fire on transition.

**Watch out for:**
1. **In-place metrics mutation (line 80).** When only metrics change, the same `s` object is returned and React will see no reference change. This is intentional (avoids re-render cascades) but means a `useEffect([sessions])` won't trigger on metric-only updates. Notifications care about status, not metrics, so this is fine — but don't rely on `sessions` identity changes for anything else.
2. **No prev-status memo exposed.** If notifications are implemented inside a `useEffect` watching `sessions`, the effect sees only the *new* array — to compute a transition, the consumer needs its own `useRef<Map<sessionId, SessionStatus>>` to remember the previous status per session. This is the cleanest place to live; the alternative (computing transitions inside `useHive`) couples the hook to a UI concern.
3. **Reconnect replays full state.** On WS reconnect, the server sends `session_list` (line 46) which **replaces all sessions wholesale**. A naive prev-vs-next diff after reconnect will see every session's status as a "transition from undefined → current" and could fire a flurry of notifications. The notifications layer must handle the reconnect / initial-list case explicitly (e.g., seed the prev-status map from the first `session_list` without firing).
4. **`session_created`** also delivers a session with a status (lines 53–61). New-session creation should not generally fire a notification, but if it does, dedupe should treat the create as the baseline.
5. **Multiple WS messages can arrive in the same tick.** React 18 batches updates, so a `useEffect` may see the *combined* result of several updates and miss intermediate transitions. For notifications this is mostly fine (we only care about the latest status), but worth knowing.

### Recommendation for Session 1

Put the notification dispatch **inside a new component-level `useEffect`** that consumes `sessions` from `useHive()` and maintains its own `prevStatusRef = useRef<Map<string, SessionStatus>>(new Map())`. Don't modify `useHive` itself — the hook is already doing the right thing by gating `session_updated` on visible-field changes. Adding the notification logic *outside* the hook keeps the data layer pure and the notification policy easy to test and toggle.

---

## 3. Protocol decision: new `status_transition` event vs. piggyback on `session_updated`

### Option A — New dedicated `status_transition` event

**Pros:**
- Server has the canonical "prev" already (`prev` local var in `detectStatus`, line 187). Server-side dedupe is trivial and correct.
- Self-documenting protocol — readers grep for `status_transition` to find notification logic.
- Easy to extend with a `reason` field later (`"approval_prompt_detected"`, `"streaming_started"`, etc.).
- Client doesn't need to track per-session prev-state for notifications.

**Cons:**
- **Two events fire for every transition** (`session_updated` + `status_transition`) — small bandwidth cost, low-stakes for a single-user local app, but it's duplicate state on the wire.
- New surface area on `ServerMessage` union and the client switch — slightly more code to keep in sync.
- Notification policy (which transitions matter) becomes a *server* concern rather than a UI concern. If we later want per-user notification preferences, the server has to either send everything (defeating the point) or know about user prefs.

### Option B — Piggyback on `session_updated`

**Pros:**
- Zero protocol churn — `session_updated` already carries the new status and is already transition-gated server-side (only sent when `prev !== status`).
- Notification policy lives on the **client**, which is the right layer for "should I bother the user about this?" — easy to toggle, easy to add per-user prefs later, easy to mock in tests.
- The `useHive` hook stays unchanged. The notification layer is purely additive at the React component level.

**Cons:**
- Client must remember prev-status per session (a `Map<id, status>` ref). Not hard, but it's a small piece of stateful logic the client now owns.
- On reconnect, client receives `session_list` (full replacement) and must avoid treating the reseed as transitions — handled by initializing the prev-map from the first `session_list` without dispatching.
- The "transition" concept is implicit in the diff — slightly less self-documenting than a dedicated event.

### Recommendation: **Option B (piggyback on `session_updated`)**

**Rationale:**
1. **The server is already doing the right thing.** `notifyUpdate` is called only when status actually changes (session-manager.ts:245). The wire signal *is* a transition signal — wrapping it in a second event is ceremony, not information.
2. **Notification policy is a UI/UX concern, not a transport concern.** Whether to fire a desktop notification depends on browser permission, tab focus, user prefs, dedupe windows — all things the client knows and the server doesn't. Putting the policy on the client keeps the right separation.
3. **Reversibility is cheap.** If we later discover we need a richer signal (e.g., the chunk that triggered the transition for richer notification copy), we can add a `transitionReason?: string` field to `Session` or the existing `session_updated` payload without breaking the protocol.
4. **The detector is noisy (see §1).** Since `waiting_approval` is unreliable, the client will likely need a "suppress within N seconds of last notification for this session" dedupe regardless. That logic is much easier to write where the React state lives — keeping it on the client avoids a server round-trip just to ask "should I really notify now?".
5. **Less code to review and maintain.** Option A adds ~40 lines across server, shared, and client; Option B adds ~20 lines confined to one new file in `apps/web/`.

**One thing to formalize, though:** add a brief note to `packages/shared/src/index.ts` near the `session_updated` definition stating *"emitted only on visible-field change, including status transitions; safe to use as a transition signal"*. That makes the implicit contract explicit so a future reader doesn't add a "send periodically for keepalive" optimization that breaks notifications.

---

## Punch list for Session 1's PR

Things this audit recommends Session 1 address (or explicitly punt on with a comment):

- [ ] **Dedupe on flap.** A single PTY chunk can flip status multiple times (see §1). Suppress duplicate notifications for the same `(sessionId, status)` within a short window (suggest 2–5s).
- [ ] **Reconnect quiet-seed.** First `session_list` after WS connect must seed the prev-status map without firing notifications. Same for `session_created`.
- [ ] **Tab-focus suppression.** If the browser tab is focused, no desktop notification (the user can already see the bell). Reasonable default; can be a pref later.
- [ ] **Permission flow.** `Notification.requestPermission()` must be called from a user gesture (click), not on app load — browsers will silently deny otherwise. Bell-toggle is a natural place.
- [ ] **No PII in body.** Session names can contain anything the user typed. Truncate or sanitize before passing to `new Notification(title, { body })`.
- [ ] **A11y on the bell toggle.** `aria-label`, keyboard-activatable (button, not div), visible focus ring.
- [ ] **Test against the §1 false-positive list.** At minimum, a unit test that simulates `session_updated` for a session whose status flips to `waiting_approval` from a chunk containing `"I'll approve that"` and asserts the notification policy still fires (because policy doesn't second-guess the server) — but document the known-noisy detector in a code comment so reviewers understand the limitation.

---

## Out of scope for the notifications PR

- Fixing the detector itself (§1). Separate ticket. Probably wants a state machine + ANSI-stripped, line-buffered matching against the actual Claude Code permission UI markers (`❯`, the numbered choices), not substring search.
- Per-user notification preferences (sound on/off, quiet hours, per-session opt-out). Ship the bell first.
- Notification on `error` or `stopped`. Phase 2.
