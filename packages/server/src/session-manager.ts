import * as pty from "node-pty";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type {
  Session,
  SessionStatus,
  SessionMetrics,
} from "@claude-hive/shared";

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

export class SessionManager {
  private sessions = new Map<string, ManagedSession>();
  private dataListeners = new Map<string, Set<(sessionId: string, data: string) => void>>();
  private updateListeners = new Set<(session: Session) => void>();
  private removeListeners = new Set<(sessionId: string) => void>();

  createSession(opts: {
    name: string;
    workingDir: string;
    initialPrompt?: string;
    cols?: number;
    rows?: number;
  }): Session {
    const id = randomUUID();

    // Resolve ~ to home directory
    const workingDir = opts.workingDir.replace(/^~/, homedir());

    // Build the claude command via shell so symlinks and shebangs work
    const shell = process.env.SHELL || "/bin/zsh";
    let claudeCmd = CLAUDE_PATH;
    if (opts.initialPrompt) {
      // Escape single quotes in the prompt
      const escaped = opts.initialPrompt.replace(/'/g, "'\\''");
      claudeCmd += ` -p '${escaped}'`;
    }

    // Spawn via login shell so PATH and env are fully set up
    const term = pty.spawn(shell, ["-l", "-c", claudeCmd], {
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
      metrics: {
        tokenEstimate: 0,
        toolCalls: 0,
        duration: 0,
        lastActivity: now,
      },
    };

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
    if (data.includes("⏳") || data.includes("Running") || data.includes("Executing")) {
      managed.info.status = "tool_use";
      managed.info.metrics.toolCalls++;
    } else if (data.includes("Allow") || data.includes("(y/n)") || data.includes("approve")) {
      managed.info.status = "waiting_approval";
    } else if (data.includes("❯") || data.includes(">") || data.includes("$")) {
      // Prompt indicators — likely idle
      managed.info.status = "idle";
    } else if (data.length > 20) {
      // Substantial output = streaming
      managed.info.status = "streaming";
    }

    if (prev !== managed.info.status) {
      this.notifyUpdate(managed.info);
    }
  }

  killSession(id: string): boolean {
    const managed = this.sessions.get(id);
    if (!managed) return false;
    try { managed.pty.kill(); } catch {}
    this.sessions.delete(id);
    for (const cb of this.removeListeners) cb(id);
    return true;
  }

  restartSession(id: string): Session | null {
    const managed = this.sessions.get(id);
    if (!managed) return null;
    const { name, workingDir } = managed.info;
    this.killSession(id);
    return this.createSession({ name, workingDir });
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
