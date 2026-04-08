import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  Session,
  SessionStatus,
  SessionMetrics,
  SessionGroup,
  SSHConfig,
  SessionColor,
} from "@claude-hive/shared";
import { DEFAULT_METRICS } from "@claude-hive/shared";

interface ManagedSession {
  info: Session;
  pty: pty.IPty;
  outputBuffer: string; // ring buffer for reconnect
  onData: (data: string) => void;
  onExit: (code: number) => void;
}

const MAX_BUFFER = 100_000; // chars kept per session

// Resolve full path to claude binary at startup
function findClaude(): string {
  // Try which with login shell
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const result = execSync(`${shell} -lc 'which claude'`, { encoding: "utf-8", timeout: 5000 }).trim();
    if (result && existsSync(result)) return result;
  } catch {}

  // Try which directly
  try {
    const result = execSync("which claude", { encoding: "utf-8", timeout: 5000 }).trim();
    if (result && existsSync(result)) return result;
  } catch {}

  // Fallback common locations
  const paths = [
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
    `${homedir()}/.npm-global/bin/claude`,
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  throw new Error("Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code");
}

const CLAUDE_PATH = findClaude();
console.log(`[hive] Found claude at: ${CLAUDE_PATH}`);

// ANSI stripping regexes
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ANSI_OSC_RE = /\x1b\](?:[^\x07\x1b]*(?:\x07|\x1b\\))/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "").replace(ANSI_OSC_RE, "");
}

// Token pricing constants (Claude Sonnet rates as rough estimate)
const INPUT_PRICE_PER_TOKEN = 3 / 1_000_000;   // $3/1M tokens
const OUTPUT_PRICE_PER_TOKEN = 15 / 1_000_000;  // $15/1M tokens
const CHARS_PER_TOKEN = 4;

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private groups = new Map<string, SessionGroup>();
  private dataListeners = new Map<string, Set<(sessionId: string, data: string) => void>>();
  private updateListeners = new Set<(session: Session) => void>();
  private removeListeners = new Set<(sessionId: string) => void>();
  private lastKilledInfo: { name: string; workingDir: string } | null = null;
  private streamingCharCounts = new Map<string, number>();

  createSession(opts: {
    name: string;
    workingDir: string;
    initialPrompt?: string;
    cols?: number;
    rows?: number;
    color?: SessionColor;
    ssh?: SSHConfig;
  }): Session {
    const id = randomUUID();

    // Resolve ~ to home directory
    const workingDir = opts.workingDir.replace(/^~/, homedir());

    const shell = process.env.SHELL || "/bin/zsh";
    let spawnCmd: string;

    if (opts.ssh) {
      // Build SSH command to run claude on remote host
      const ssh = opts.ssh;
      const parts = ["ssh", "-tt"];
      if (ssh.port) parts.push("-p", String(ssh.port));
      if (ssh.identityFile) parts.push("-i", ssh.identityFile);
      parts.push(`${ssh.user}@${ssh.host}`);
      parts.push(`"cd ${ssh.remoteWorkingDir} && claude"`);
      spawnCmd = parts.join(" ");
    } else {
      // Build the claude command via shell so symlinks and shebangs work
      spawnCmd = CLAUDE_PATH;
      if (opts.initialPrompt) {
        // Escape single quotes in the prompt
        const escaped = opts.initialPrompt.replace(/'/g, "'\\''");
        spawnCmd += ` -p '${escaped}'`;
      }
    }

    // Spawn via login shell so PATH and env are fully set up
    const term = pty.spawn(shell, ["-l", "-c", spawnCmd], {
      name: "xterm-256color",
      cols: opts.cols || 120,
      rows: opts.rows || 30,
      cwd: workingDir,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        FORCE_COLOR: "1",
      } as Record<string, string>,
    });

    const now = Date.now();
    const info: Session = {
      id,
      name: opts.name,
      workingDir: opts.workingDir,
      status: "idle",
      createdAt: now,
      pid: term.pid,
      metrics: { ...DEFAULT_METRICS, lastActivity: now },
    };

    if (opts.ssh) {
      info.ssh = opts.ssh;
    }

    const managed: ManagedSession = {
      info,
      pty: term,
      outputBuffer: "",
      onData: () => {},
      onExit: () => {},
    };

    // Track output
    managed.onData = (data: string) => {
      // Append to ring buffer
      managed.outputBuffer += data;
      if (managed.outputBuffer.length > MAX_BUFFER) {
        managed.outputBuffer = managed.outputBuffer.slice(-MAX_BUFFER);
      }

      // Update metrics
      managed.info.metrics.lastActivity = Date.now();
      managed.info.metrics.duration = Date.now() - managed.info.createdAt;

      // Simple status detection from output
      this.detectStatus(managed, data);

      // Notify listeners
      const listeners = this.dataListeners.get("*") || new Set();
      const sessionListeners = this.dataListeners.get(id) || new Set();
      for (const cb of listeners) cb(id, data);
      for (const cb of sessionListeners) cb(id, data);
    };

    managed.onExit = (code: number) => {
      managed.info.status = "stopped";
      // Don't remove — just update status so it stays visible in sidebar
      this.notifyUpdate(managed.info);
    };

    term.onData((data) => managed.onData(data));
    term.onExit(({ exitCode }) => managed.onExit(exitCode));

    this.sessions.set(id, managed);
    return info;
  }

  private detectStatus(managed: ManagedSession, data: string) {
    const prev = managed.info.status;

    // Detect tool use patterns
    if (data.includes("\u23F3") || data.includes("Running") || data.includes("Executing")) {
      managed.info.status = "tool_use";
      managed.info.metrics.toolCalls++;
    } else if (data.includes("Allow") || data.includes("(y/n)") || data.includes("approve")) {
      managed.info.status = "waiting_approval";
    } else if (data.includes("\u276F") || data.includes(">") || data.includes("$")) {
      // Prompt indicators — likely idle
      managed.info.status = "idle";
    } else if (data.length > 20) {
      // Substantial output = streaming
      managed.info.status = "streaming";
    }

    // Token estimation: accumulate output chars while streaming
    const sid = managed.info.id;
    if (managed.info.status === "streaming") {
      const current = this.streamingCharCounts.get(sid) || 0;
      this.streamingCharCounts.set(sid, current + data.length);
    }

    // When transitioning away from streaming, finalize token estimates
    if (prev === "streaming" && managed.info.status !== "streaming") {
      const charCount = this.streamingCharCounts.get(sid) || 0;
      const outputTokens = Math.round(charCount / CHARS_PER_TOKEN);
      // Rough heuristic: input tokens ~ 2x output tokens for typical interactions
      const inputTokens = Math.round(outputTokens * 2);

      managed.info.metrics.outputTokens += outputTokens;
      managed.info.metrics.inputTokens += inputTokens;
      managed.info.metrics.tokenEstimate = managed.info.metrics.inputTokens + managed.info.metrics.outputTokens;
      managed.info.metrics.costEstimate =
        managed.info.metrics.inputTokens * INPUT_PRICE_PER_TOKEN +
        managed.info.metrics.outputTokens * OUTPUT_PRICE_PER_TOKEN;

      this.streamingCharCounts.set(sid, 0);
    }

    // Also watch for explicit token/cost patterns in output
    if (data.includes("tokens") || data.includes("Token")) {
      // If the output mentions tokens, try to parse numbers near the word
      const tokenMatch = data.match(/(\d[\d,]+)\s*tokens?/i);
      if (tokenMatch) {
        const parsed = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
        if (!isNaN(parsed) && parsed > 0) {
          managed.info.metrics.tokenEstimate = parsed;
          // Approximate split: 60% input, 40% output
          managed.info.metrics.inputTokens = Math.round(parsed * 0.6);
          managed.info.metrics.outputTokens = Math.round(parsed * 0.4);
          managed.info.metrics.costEstimate =
            managed.info.metrics.inputTokens * INPUT_PRICE_PER_TOKEN +
            managed.info.metrics.outputTokens * OUTPUT_PRICE_PER_TOKEN;
        }
      }
    }

    if (prev !== managed.info.status) {
      this.notifyUpdate(managed.info);
    }
  }

  killSession(id: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    // Stash info before killing so restart can use it
    this.lastKilledInfo = { name: managed.info.name, workingDir: managed.info.workingDir };
    // Neutralize callbacks so residual PTY events are ignored
    managed.onData = () => {};
    managed.onExit = () => {};
    try { managed.pty.kill(); } catch {}
    this.sessions.delete(id);
    this.streamingCharCounts.delete(id);
    // Clear any session-specific terminal data listeners
    this.dataListeners.delete(id);
    for (const cb of this.removeListeners) cb(id);
    return true;
  }

  getLastKilled(): { name: string; workingDir: string } | null {
    return this.lastKilledInfo;
  }

  sendInput(id: string, data: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    try {
      managed.pty.write(data);
    } catch { return false; }
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    try {
      managed.pty.resize(cols, rows);
    } catch { return false; }
    return true;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)?.info;
  }

  getSessionBuffer(id: string): string {
    return this.sessions.get(id)?.outputBuffer || "";
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map((m) => {
      m.info.metrics.duration = Date.now() - m.info.createdAt;
      return m.info;
    });
  }

  // ── Color & Rename ─────────────────────────────────────────

  setSessionColor(id: string, color: SessionColor): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    managed.info.color = color;
    this.notifyUpdate(managed.info);
    return true;
  }

  renameSession(id: string, name: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    managed.info.name = name;
    this.notifyUpdate(managed.info);
    return true;
  }

  // ── Group Management ───────────────────────────────────────

  createGroup(name: string): SessionGroup {
    const group: SessionGroup = {
      id: randomUUID(),
      name,
      sessionIds: [],
      createdAt: Date.now(),
    };
    this.groups.set(group.id, group);
    return group;
  }

  deleteGroup(id: string): boolean {
    return this.groups.delete(id);
  }

  addToGroup(groupId: string, sessionId: string): SessionGroup | null {
    const group = this.groups.get(groupId);
    if (!group) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (!group.sessionIds.includes(sessionId)) {
      group.sessionIds.push(sessionId);
    }
    return group;
  }

  removeFromGroup(groupId: string, sessionId: string): SessionGroup | null {
    const group = this.groups.get(groupId);
    if (!group) return null;
    group.sessionIds = group.sessionIds.filter((id) => id !== sessionId);
    return group;
  }

  listGroups(): SessionGroup[] {
    return Array.from(this.groups.values());
  }

  // ── Export Logs ────────────────────────────────────────────

  exportLogs(sessionId: string, format: "text" | "json" | "ansi"): { data: string; filename: string } | null {
    const managed = this.sessions.get(sessionId);
    if (!managed) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeName = managed.info.name.replace(/[^a-zA-Z0-9_-]/g, "_");

    switch (format) {
      case "ansi": {
        return {
          data: managed.outputBuffer,
          filename: `${safeName}_${timestamp}.ans`,
        };
      }
      case "text": {
        return {
          data: stripAnsi(managed.outputBuffer),
          filename: `${safeName}_${timestamp}.txt`,
        };
      }
      case "json": {
        const strippedText = stripAnsi(managed.outputBuffer);
        const jsonData = {
          sessionId: managed.info.id,
          name: managed.info.name,
          workingDir: managed.info.workingDir,
          createdAt: managed.info.createdAt,
          duration: Date.now() - managed.info.createdAt,
          output: strippedText,
        };
        return {
          data: JSON.stringify(jsonData, null, 2),
          filename: `${safeName}_${timestamp}.json`,
        };
      }
    }
  }

  // ── Event Listeners ────────────────────────────────────────

  onTerminalData(cb: (sessionId: string, data: string) => void) {
    if (!this.dataListeners.has("*")) this.dataListeners.set("*", new Set());
    this.dataListeners.get("*")!.add(cb);
    return () => this.dataListeners.get("*")!.delete(cb);
  }

  onSessionUpdate(cb: (session: Session) => void) {
    this.updateListeners.add(cb);
    return () => this.updateListeners.delete(cb);
  }

  onSessionRemove(cb: (sessionId: string) => void) {
    this.removeListeners.add(cb);
    return () => this.removeListeners.delete(cb);
  }

  private notifyUpdate(session: Session) {
    for (const cb of this.updateListeners) cb({ ...session });
  }

  destroy() {
    for (const [id] of this.sessions) {
      this.killSession(id);
    }
  }
}
