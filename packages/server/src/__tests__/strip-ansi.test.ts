// Stub unit test for stripAnsi() in session-manager.ts.
//
// This file does NOT run yet. Two blockers, both intentional:
//   1. vitest is not installed (see docs/adr/0001-test-framework.md;
//      Session 2 wires it into the workspace + CI after this PR lands).
//   2. stripAnsi() is currently a private helper in session-manager.ts.
//      It needs to be extracted to a sibling module (e.g. `ansi.ts`) and
//      exported before this test can import it. Doing the extract here
//      would touch feature code, which this PR is forbidden from doing —
//      it's a one-line follow-up PR or part of Session 1's work.
//
// When both blockers are cleared, update the import below and remove
// `describe.skip` → `describe`. The assertions themselves describe the
// behavior of the regexes currently defined in session-manager.ts:61.

import { describe, it, expect } from "vitest";
// import { stripAnsi } from "../ansi.js"; // <- target after extraction

// Local copy of the function under test. Delete this once the real one
// is exported and uncomment the import above. Keeping it here means the
// stub test still meaningfully runs once vitest is wired, even before the
// extract PR lands.
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ANSI_OSC_RE = /\x1b\](?:[^\x07\x1b]*(?:\x07|\x1b\\))/g;
function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "").replace(ANSI_OSC_RE, "");
}

describe.skip("stripAnsi", () => {
  it("passes plain text through unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("strips SGR color codes", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
  });

  it("strips compound SGR sequences", () => {
    expect(stripAnsi("\x1b[1;32mbold green\x1b[0m text")).toBe("bold green text");
  });

  it("strips cursor and clear-screen sequences", () => {
    expect(stripAnsi("\x1b[H\x1b[2Jcontent")).toBe("content");
  });

  it("strips OSC sequences terminated by BEL", () => {
    expect(stripAnsi("\x1b]0;Window Title\x07rest")).toBe("rest");
  });

  it("strips OSC sequences terminated by ST (ESC backslash)", () => {
    expect(stripAnsi("\x1b]0;Title\x1b\\rest")).toBe("rest");
  });

  it("preserves whitespace and control chars other than ANSI", () => {
    expect(stripAnsi("line1\nline2\tindented")).toBe("line1\nline2\tindented");
  });

  it("is idempotent — running twice equals running once", () => {
    const dirty = "\x1b[31m\x1b]0;t\x07hello\x1b[0m";
    expect(stripAnsi(stripAnsi(dirty))).toBe(stripAnsi(dirty));
  });
});
