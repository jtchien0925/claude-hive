# Contributing to Claude Hive

Thanks for your interest in improving Claude Hive. This guide covers the local
workflow expected for any change that goes into `main`.

## Prerequisites

- **Node.js** 20 or 22 (LTS). Newer majors (23+) are not yet validated by CI.
- **pnpm** 10.8.0 or compatible (`npm install -g pnpm`).
- **Claude Code** CLI installed and authenticated:
  `npm install -g @anthropic-ai/claude-code`.

## Setup

```bash
git clone https://github.com/jtchien0925/claude-hive.git
cd claude-hive
pnpm install
```

## Pre-PR check

Run the same checks CI runs before opening a pull request. If any of these
fail, your PR will be blocked:

```bash
pnpm format:check   # Prettier — run `pnpm format` to auto-fix
pnpm lint           # ESLint across all workspaces
pnpm typecheck      # tsc --noEmit across all workspaces
pnpm build          # Production build for server + web
```

To fix formatting in place:

```bash
pnpm format
```

## Branch naming

Branches use a short prefix that signals intent:

| Prefix   | Use for                                              |
| -------- | ---------------------------------------------------- |
| `feat/`  | New user-visible feature (e.g., `feat/notifications`) |
| `fix/`   | Bug fix                                              |
| `chore/` | Tooling, CI, deps, refactors with no behavior change |
| `docs/`  | Documentation only                                   |
| `perf/`  | Performance improvement                              |

Examples: `feat/broadcast-input`, `fix/terminal-resize-race`, `chore/ci`.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) style. Keep
the subject line under ~72 characters. Examples:

- `feat: desktop notifications for waiting_approval`
- `fix(server): handle SSH disconnect cleanly`
- `chore(ci): add lint, typecheck, and GitHub Actions`
- `docs: clarify SSH setup in README`

## Pull requests

1. Fork or branch off `main`.
2. Make your change. Add or update docs and tests where applicable.
3. Run the pre-PR check above.
4. Push and open a PR. Link any related issue.
5. Keep PRs focused — one logical change per PR is much easier to review.

## Architecture overview

See the [README](./README.md#architecture) for the layout. Briefly:

- `apps/web/` — Next.js dashboard (port 3000)
- `packages/server/` — WebSocket + PTY manager (port 9900)
- `packages/shared/` — Types and protocol definitions consumed by both

Changes to the WebSocket protocol must update `packages/shared/src/index.ts`
in the same PR as any consumer change in `apps/web/` or `packages/server/`.

## Reporting issues

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS, Node version (`node --version`), and pnpm version

For security issues, please email the maintainer rather than opening a public
issue.
