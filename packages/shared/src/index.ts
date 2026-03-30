// Session status
export type SessionStatus =
  | "idle"
  | "streaming"
  | "tool_use"
  | "waiting_approval"
  | "error"
  | "stopped";

// Session info sent to clients
export interface Session {
  id: string;
  name: string;
  workingDir: string;
  status: SessionStatus;
  createdAt: number;
  pid?: number;
  metrics: SessionMetrics;
}

export interface SessionMetrics {
  tokenEstimate: number;
  toolCalls: number;
  duration: number; // ms since created
  lastActivity: number; // timestamp
}

// WebSocket message protocol
// Client → Server
export type ClientMessage =
  | { type: "create_session"; name: string; workingDir: string; initialPrompt?: string }
  | { type: "kill_session"; sessionId: string }
  | { type: "restart_session"; sessionId: string }
  | { type: "send_input"; sessionId: string; data: string }
  | { type: "resize"; sessionId: string; cols: number; rows: number }
  | { type: "get_buffer"; sessionId: string }
  | { type: "browse_dirs"; path: string }
  | { type: "get_home" }
  | { type: "list_sessions" };

// Server → Client
export type ServerMessage =
  | { type: "session_list"; sessions: Session[] }
  | { type: "session_created"; session: Session }
  | { type: "session_removed"; sessionId: string }
  | { type: "session_updated"; session: Session }
  | { type: "terminal_output"; sessionId: string; data: string }
  | { type: "browse_result"; path: string; dirs: string[] }
  | { type: "home_dir"; path: string }
  | { type: "error"; message: string; sessionId?: string };

// Default config
export const DEFAULT_SERVER_PORT = 9900;
export const DEFAULT_WEB_PORT = 3000;
export const HEARTBEAT_INTERVAL = 5000;
