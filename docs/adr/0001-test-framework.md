# ADR 0001 — Unit test framework for `packages/shared` and `packages/server`

- **Status:** Proposed
- **Date:** 2026-05-15
- **Deciders:** Session 0 (QA harness), Session 2 (CI wiring)

## Context

Both backend packages are pure TypeScript (`type: "module"`, `tsc` build),
no test runner is currently wired up. Recent QA work (this PR) exposed
that we have testable pure functions like `stripAnsi()` and a growing
`detectStatus()` state machine in `session-manager.ts` that would benefit
from unit coverage before Session 1's notifications feature lands and adds
more state transitions.

Session 2 is wiring whatever runner we pick into CI immediately after this
PR lands, so the decision is on the critical path. The realistic options
are **Vitest** and Node's built-in **`node:test`**.

## Options considered

### Option A — Vitest

- Mature, ergonomic API (`describe`/`it`/`expect`).
- First-class ESM and TypeScript support — no extra config to test
  `type: "module"` packages.
- Built-in watch mode, parallel test execution per file, fast.
- Rich matcher library, snapshot testing, mocking utilities out of the box.
- Bundles vite and a dep tree of ~150 transitive deps. Adds ~30MB to the
  workspace `node_modules` (currently ~600MB — material but not dramatic).
- Widely understood; low onboarding cost for contributors.

### Option B — `node:test` + `node:assert`

- Zero dependencies, ships with Node ≥ 20 (which we already require).
- Native ESM support, no transpiler step needed to run `.ts` if we pair it
  with `tsx` or `--import tsx` for ergonomics.
- Test API is leaner: `test('name', () => { assert.equal(...) })`. Fewer
  matchers, no built-in mocking (we'd hand-roll or pull a tiny lib).
- Watch mode (`--watch`) exists but is younger and less polished.
- Reporters / output formatting are usable but plain compared to Vitest.

## Decision

**Adopt Vitest** for `packages/shared` and `packages/server`.

Drivers:
1. We're not dependency-allergic — the repo already ships Next.js, xterm,
   node-pty, and Tailwind. Vitest's tree is negligible against that.
2. The notifications feature lands next; we'll want richer assertions
   (object-shape matchers, async waits, timers) that `node:assert`'s
   surface forces us to reimplement.
3. Onboarding: every external contributor has used Vitest or Jest; very
   few have used `node:test` in anger. Lower friction for PRs.
4. Editor integration (VS Code Vitest extension) is excellent — encourages
   running tests locally, which is what we actually care about.

The cost we accept: 30MB more in `node_modules` and a transitive surface
that we have to keep current (Dependabot will handle that).

## Apps/web is out of scope

This ADR covers `packages/shared` and `packages/server` only. The Next.js
app has its own constraints (jsdom, React Testing Library) and is best
decided when we actually need component tests — likely after the
notifications feature stabilizes and we want to lock its UI behaviors.

## Consequences

- Add `vitest` as a workspace devDependency at the root, and a
  `test` / `test:watch` script in each target package.
- Test files live under `src/__tests__/*.test.ts` (colocated, easy to
  find).
- Session 2 will add a `pnpm -r --filter "./packages/*" test` step to CI
  after this lands. Tests must run in headless Node with no PTY / network.
- One stub test ships with this ADR (`packages/server/src/__tests__/
  strip-ansi.test.ts`) so Session 2 has a green baseline to wire against.
  The test deliberately exercises behavior that isn't exported yet — see
  the file header for what needs to change in `session-manager.ts` to make
  `stripAnsi` testable. **That extraction is Session 1's call or a follow-
  up PR; this ADR does not block on it.**

## Status

Proposed. Approval gates:
- Session 0 (this PR): drafts ADR + stub test, requests review.
- Session 2: confirms CI wiring assumption and approves runner choice.
- Once both approve, status flips to Accepted.
