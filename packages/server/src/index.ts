import { WebSocketServer, WebSocket } from "ws";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { SessionManager } from "./session-manager.js";
import {
  DEFAULT_SERVER_PORT,
  HEARTBEAT_INTERVAL,
  type ClientMessage,
  type ServerMessage,
} from "@claude-hive/shared";

const PORT = parseInt(process.env.HIVE_PORT || String(DEFAULT_SERVER_PORT));

const manager = new SessionManager();
const wss = new WebSocketServer({ port: PORT });

function broadcast(msg: ServerMessage) {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// Stream terminal output to all connected clients
manager.onTerminalData((sessionId, data) => {
  broadcast({ type: "terminal_output", sessionId, data });
});

manager.onSessionUpdate((session) => {
  broadcast({ type: "session_updated", session });
});

manager.onSessionRemove((sessionId) => {
  broadcast({ type: "session_removed", sessionId });
});

wss.on("connection", (ws) => {
  console.log(`[hive] Client connected (total: ${wss.clients.size})`);

  // Send current session list on connect
  send(ws, { type: "session_list", sessions: manager.listSessions() });

  // NOTE: Don't send buffered output here — each TerminalPanel requests
  // its own buffer via "get_buffer" when it mounts. Sending it here too
  // causes double-rendered lines in the terminal.

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    switch (msg.type) {
      case "create_session": {
        try {
          const session = manager.createSession({
            name: msg.name,
            workingDir: msg.workingDir,
            initialPrompt: msg.initialPrompt,
            color: msg.color,
            ssh: msg.ssh,
          });
          broadcast({ type: "session_created", session });
          console.log(`[hive] Session created: ${session.name} (${session.id})`);
        } catch (err: any) {
          const errMsg = err?.message || "Failed to create session";
          send(ws, { type: "error", message: errMsg });
          console.error(`[hive] Create session failed: ${errMsg}`);
        }
        break;
      }

      case "kill_session": {
        const ok = manager.killSession(msg.sessionId);
        if (!ok) send(ws, { type: "error", message: "Session not found", sessionId: msg.sessionId });
        else console.log(`[hive] Session killed: ${msg.sessionId}`);
        break;
      }

      case "restart_session": {
        // Kill the old session first and broadcast its removal
        const oldKilled = manager.killSession(msg.sessionId);
        if (!oldKilled) {
          send(ws, { type: "error", message: "Session not found", sessionId: msg.sessionId });
        } else {
          // Get the old session info before it was killed for name/dir
          const oldInfo = manager.getLastKilled();
          if (oldInfo) {
            const session = manager.createSession({
              name: oldInfo.name,
              workingDir: oldInfo.workingDir,
            });
            broadcast({ type: "session_created", session });
            console.log(`[hive] Session restarted: ${session.name}`);
          }
        }
        break;
      }

      case "send_input": {
        const ok = manager.sendInput(msg.sessionId, msg.data);
        if (!ok) send(ws, { type: "error", message: "Session not found", sessionId: msg.sessionId });
        break;
      }

      case "resize": {
        manager.resize(msg.sessionId, msg.cols, msg.rows);
        break;
      }

      case "get_buffer": {
        const buffer = manager.getSessionBuffer(msg.sessionId);
        if (buffer) {
          send(ws, { type: "terminal_output", sessionId: msg.sessionId, data: buffer });
        }
        break;
      }

      case "list_sessions": {
        send(ws, { type: "session_list", sessions: manager.listSessions() });
        break;
      }

      case "get_home": {
        send(ws, { type: "home_dir", path: homedir() });
        break;
      }

      case "browse_dirs": {
        try {
          const basePath = resolve(msg.path.replace(/^~/, homedir()));
          const entries = readdirSync(basePath, { withFileTypes: true });
          const dirs = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith("."))
            .map((e) => e.name)
            .sort();
          send(ws, { type: "browse_result", path: msg.path, dirs });
        } catch {
          send(ws, { type: "browse_result", path: msg.path, dirs: [] });
        }
        break;
      }

      case "set_session_color": {
        const ok = manager.setSessionColor(msg.sessionId, msg.color);
        if (ok) {
          const sessions = manager.listSessions();
          const session = sessions.find((s) => s.id === msg.sessionId);
          if (session) broadcast({ type: "session_updated", session });
        } else {
          send(ws, { type: "error", message: "Session not found", sessionId: msg.sessionId });
        }
        break;
      }

      case "rename_session": {
        const ok = manager.renameSession(msg.sessionId, msg.name);
        if (ok) {
          const sessions = manager.listSessions();
          const session = sessions.find((s) => s.id === msg.sessionId);
          if (session) broadcast({ type: "session_updated", session });
        } else {
          send(ws, { type: "error", message: "Session not found", sessionId: msg.sessionId });
        }
        break;
      }

      case "create_group": {
        const group = manager.createGroup(msg.name);
        broadcast({ type: "group_created", group });
        break;
      }

      case "delete_group": {
        const ok = manager.deleteGroup(msg.groupId);
        if (ok) broadcast({ type: "group_deleted", groupId: msg.groupId });
        break;
      }

      case "add_to_group": {
        const group = manager.addToGroup(msg.groupId, msg.sessionId);
        if (group) broadcast({ type: "group_updated", group });
        break;
      }

      case "remove_from_group": {
        const group = manager.removeFromGroup(msg.groupId, msg.sessionId);
        if (group) broadcast({ type: "group_updated", group });
        break;
      }

      case "list_groups": {
        send(ws, { type: "group_list", groups: manager.listGroups() });
        break;
      }

      case "export_logs": {
        const result = manager.exportLogs(msg.sessionId, msg.format);
        if (result) {
          send(ws, { type: "export_data", sessionId: msg.sessionId, format: msg.format, data: result.data, filename: result.filename });
        } else {
          send(ws, { type: "error", message: "Session not found or export failed", sessionId: msg.sessionId });
        }
        break;
      }

      default:
        send(ws, { type: "error", message: `Unknown message type` });
    }
  });

  ws.on("close", () => {
    console.log(`[hive] Client disconnected (total: ${wss.clients.size})`);
  });

  // Heartbeat
  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  ws.on("close", () => clearInterval(interval));
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[hive] Shutting down...");
  manager.destroy();
  wss.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  manager.destroy();
  wss.close();
  process.exit(0);
});

console.log(`[hive] Server running on ws://localhost:${PORT}`);
console.log(`[hive] Waiting for connections...`);
