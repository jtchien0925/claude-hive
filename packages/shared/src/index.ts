// ── Session Colors ──────────────────────────────────────────
export type SessionColor = 'red' | 'orange' | 'amber' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';
export const SESSION_COLORS: SessionColor[] = ['red', 'orange', 'amber', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray'];

export const COLOR_HEX: Record<SessionColor, string> = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  gray: '#6b7280',
};

// ── Layout Modes ────────────────────────────────────────────
export type LayoutMode = 'single' | 'grid' | 'split-h' | 'split-v' | 'tabs';

// ── Session Groups ──────────────────────────────────────────
export interface SessionGroup {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
}

// ── SSH Config ──────────────────────────────────────────────
export interface SSHConfig {
  host: string;
  port?: number;
  user: string;
  identityFile?: string;
  remoteWorkingDir: string;
}

// ── Session Status ──────────────────────────────────────────
export type SessionStatus =
  | "idle"
  | "streaming"
  | "tool_use"
  | "waiting_approval"
  | "error"
  | "stopped";

// ── Session Metrics ─────────────────────────────────────────
export interface SessionMetrics {
  tokenEstimate: number;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
  toolCalls: number;
  duration: number;
  lastActivity: number;
}

export const DEFAULT_METRICS: SessionMetrics = {
  tokenEstimate: 0,
  inputTokens: 0,
  outputTokens: 0,
  costEstimate: 0,
  toolCalls: 0,
  duration: 0,
  lastActivity: 0,
};

// ── Session ─────────────────────────────────────────────────
export interface Session {
  id: string;
  name: string;
  workingDir: string;
  status: SessionStatus;
  createdAt: number;
  pid?: number;
  metrics: SessionMetrics;
  color?: SessionColor;
  group?: string;
  ssh?: SSHConfig;
}

// ── Helpers ─────────────────────────────────────────────────
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

// ── WebSocket Protocol ──────────────────────────────────────

// Client -> Server
export type ClientMessage =
  | { type: "create_session"; name: string; workingDir: string; initialPrompt?: string; color?: SessionColor; ssh?: SSHConfig }
  | { type: "kill_session"; sessionId: string }
  | { type: "restart_session"; sessionId: string }
  | { type: "send_input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "get_buffer"; sessionId: string }
  | { type: "browse_dirs"; path: string }
  | { type: "get_home" }
  | { type: "list_sessions" }
  // Color tags
  | { type: "set_session_color"; sessionId: string; color: SessionColor }
  // Rename
  | { type: "rename_session"; sessionId: string; name: string }
  // Session groups
  | { type: "create_group"; name: string }
  | { type: "delete_group"; groupId: string }
  | { type: "add_to_group"; groupId: string; sessionId: string }
  | { type: "remove_from_group"; groupId: string; sessionId: string }
  | { type: "list_groups" }
  // Log export
  | { type: "export_logs"; sessionId: string; format: 'text' | 'json' | 'ansi' };

// Server -> Client
export type ServerMessage =
  | { type: "session_list"; sessions: Session[] }
  | { type: "session_created"; session: Session }
  | { type: "session_removed"; sessionId: string }
  | { type: "session_updated"; session: Session }
  | { type: "terminal_output"; sessionId: string; data: string }
  | { type: "browse_result"; path: string; dirs: string[] }
  | { type: "home_dir"; path: string }
  | { type: "error"; message: string; sessionId?: string }
  // Session groups
  | { type: "group_list"; groups: SessionGroup[] }
  | { type: "group_created"; group: SessionGroup }
  | { type: "group_updated"; group: SessionGroup }
  | { type: "group_deleted"; groupId: string }
  // Log export
  | { type: "export_data"; sessionId: string; format: string; data: string; filename: string };

// ── Config ──────────────────────────────────────────────────
export const DEFAULT_SERVER_PORT = 9900;
export const DEFAULT_WEB_PORT = 3000;
export const HEARTBEAT_INTERVAL = 5000;
