"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Session,
  ClientMessage,
  ServerMessage,
  SessionGroup,
  SessionColor,
  SSHConfig,
} from "@claude-hive/shared";
import { DEFAULT_SERVER_PORT } from "@claude-hive/shared";

export function useHive() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connected, setConnected] = useState(false);
  const [homeDir, setHomeDir] = useState("");
  const [browseDirs, setBrowseDirs] = useState<{ path: string; dirs: string[] }>({ path: "", dirs: [] });
  const [groups, setGroups] = useState<SessionGroup[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const terminalDataListeners = useRef<Map<string, Set<(data: string) => void>>>(new Map());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const connect = useCallback(() => {
    const port = DEFAULT_SERVER_PORT;
    const ws = new WebSocket(`ws://localhost:${port}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Request home directory on connect
      ws.send(JSON.stringify({ type: "get_home" }));
    };

    ws.onmessage = (event) => {
      const msg: ServerMessage = JSON.parse(event.data);

      switch (msg.type) {
        case "session_list":
          // Full replacement — dedupe by id just in case
          setSessions(
            Array.from(new Map(msg.sessions.map((s: Session) => [s.id, s])).values())
          );
          break;

        case "session_created":
          setSessions((prev) => {
            // Dedupe — don't add if a session with the same id already exists
            if (prev.some((s) => s.id === msg.session.id)) {
              return prev.map((s) => (s.id === msg.session.id ? msg.session : s));
            }
            return [...prev, msg.session];
          });
          break;

        case "session_removed":
          setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
          break;

        case "session_updated":
          setSessions((prev) =>
            prev.map((s) => {
              if (s.id !== msg.session.id) return s;
              // Only create a new object if something visible changed —
              // skip pure metrics updates to avoid re-render cascades
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

        case "terminal_output": {
          const listeners = terminalDataListeners.current.get(msg.sessionId);
          if (listeners) {
            for (const cb of listeners) cb(msg.data);
          }
          break;
        }

        case "home_dir":
          setHomeDir(msg.path);
          break;

        case "browse_result":
          setBrowseDirs({ path: msg.path, dirs: msg.dirs });
          break;

        case "error":
          console.error("[hive]", msg.message);
          break;

        case "group_list":
          setGroups(msg.groups);
          break;

        case "group_created":
          setGroups((prev) => [...prev, msg.group]);
          break;

        case "group_updated":
          setGroups((prev) => prev.map((g) => (g.id === msg.group.id ? msg.group : g)));
          break;

        case "group_deleted":
          setGroups((prev) => prev.filter((g) => g.id !== msg.groupId));
          break;

        case "export_data": {
          // Trigger download in browser
          const blob = new Blob([msg.data], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = msg.filename;
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const createSession = useCallback(
    (name: string, workingDir: string, initialPrompt?: string, color?: SessionColor, ssh?: SSHConfig) => {
      send({ type: "create_session", name, workingDir, initialPrompt, color, ssh });
    },
    [send]
  );

  const killSession = useCallback(
    (sessionId: string) => { send({ type: "kill_session", sessionId }); },
    [send]
  );

  const restartSession = useCallback(
    (sessionId: string) => { send({ type: "restart_session", sessionId }); },
    [send]
  );

  const sendInput = useCallback(
    (sessionId: string, data: string) => { send({ type: "send_input", sessionId, data }); },
    [send]
  );

  const resize = useCallback(
    (sessionId: string, cols: number, rows: number) => { send({ type: "resize", sessionId, cols, rows }); },
    [send]
  );

  const getBuffer = useCallback(
    (sessionId: string) => { send({ type: "get_buffer", sessionId }); },
    [send]
  );

  const browsePath = useCallback(
    (path: string) => { send({ type: "browse_dirs", path }); },
    [send]
  );

  const onTerminalData = useCallback(
    (sessionId: string, cb: (data: string) => void) => {
      if (!terminalDataListeners.current.has(sessionId)) {
        terminalDataListeners.current.set(sessionId, new Set());
      }
      terminalDataListeners.current.get(sessionId)!.add(cb);
      return () => {
        terminalDataListeners.current.get(sessionId)?.delete(cb);
      };
    },
    []
  );

  const setSessionColor = useCallback(
    (sessionId: string, color: SessionColor) => {
      send({ type: "set_session_color", sessionId, color });
    },
    [send]
  );

  const renameSession = useCallback(
    (sessionId: string, name: string) => {
      send({ type: "rename_session", sessionId, name });
    },
    [send]
  );

  const createGroup = useCallback(
    (name: string) => { send({ type: "create_group", name }); },
    [send]
  );

  const deleteGroup = useCallback(
    (groupId: string) => { send({ type: "delete_group", groupId }); },
    [send]
  );

  const addToGroup = useCallback(
    (groupId: string, sessionId: string) => { send({ type: "add_to_group", groupId, sessionId }); },
    [send]
  );

  const removeFromGroup = useCallback(
    (groupId: string, sessionId: string) => { send({ type: "remove_from_group", groupId, sessionId }); },
    [send]
  );

  const listGroups = useCallback(
    () => { send({ type: "list_groups" }); },
    [send]
  );

  const exportLogs = useCallback(
    (sessionId: string, format: 'text' | 'json' | 'ansi') => {
      send({ type: "export_logs", sessionId, format });
    },
    [send]
  );

  return {
    sessions,
    groups,
    connected,
    homeDir,
    browseDirs,
    createSession,
    killSession,
    restartSession,
    sendInput,
    resize,
    getBuffer,
    browsePath,
    onTerminalData,
    setSessionColor,
    renameSession,
    createGroup,
    deleteGroup,
    addToGroup,
    removeFromGroup,
    listGroups,
    exportLogs,
  };
}
