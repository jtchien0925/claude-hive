"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Session,
  ClientMessage,
  ServerMessage,
} from "@claude-hive/shared";
import { DEFAULT_SERVER_PORT } from "@claude-hive/shared";

export function useHive() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [connected, setConnected] = useState(false);
  const [homeDir, setHomeDir] = useState("");
  const [browseDirs, setBrowseDirs] = useState<{ path: string; dirs: string[] }>({ path: "", dirs: [] });
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
          setSessions(msg.sessions);
          break;

        case "session_created":
          setSessions((prev) => [...prev, msg.session]);
          break;

        case "session_removed":
          setSessions((prev) => prev.filter((s) => s.id !== msg.sessionId));
          break;

        case "session_updated":
          setSessions((prev) =>
            prev.map((s) => (s.id === msg.session.id ? msg.session : s))
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
    (name: string, workingDir: string, initialPrompt?: string) => {
      send({ type: "create_session", name, workingDir, initialPrompt });
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

  return {
    sessions,
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
  };
}
