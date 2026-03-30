"use client";

import { useState, useEffect, useRef } from "react";
import { useHive } from "@/lib/use-hive";
import { SessionCard } from "@/components/session-card";
import { TerminalPanel } from "@/components/terminal-panel";
import { NewSessionDialog } from "@/components/new-session-dialog";

export default function Home() {
  const {
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
  } = useHive();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const prevSessionCount = useRef(sessions.length);

  const selectedSession = sessions.find((s) => s.id === selectedId);

  // Auto-select newly created session
  useEffect(() => {
    if (sessions.length > prevSessionCount.current) {
      // New session added — select it
      const newest = sessions[sessions.length - 1];
      if (newest) setSelectedId(newest.id);
    } else if (!selectedSession && sessions.length > 0) {
      // Selected session gone — select first available
      setSelectedId(sessions[0].id);
    }
    prevSessionCount.current = sessions.length;
  }, [sessions, selectedSession]);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-semibold tracking-tight">
            <span className="text-amber-400">&#x2B21;</span> Claude Hive
          </h1>
          <div className="flex items-center gap-1.5 text-xs">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-green-400" : "bg-red-400 animate-pulse"
              }`}
            />
            <span className="text-[var(--text-muted)]">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Session
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 border-r border-[var(--border)] overflow-y-auto p-3 space-y-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3">&#x2B21;</div>
              <p className="text-sm text-[var(--text-secondary)] mb-1">No active sessions</p>
              <p className="text-xs text-[var(--text-muted)]">
                Click &quot;New Session&quot; to spawn a Claude Code instance
              </p>
            </div>
          ) : (
            sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={session.id === selectedId}
                onClick={() => setSelectedId(session.id)}
                onKill={() => killSession(session.id)}
                onRestart={() => restartSession(session.id)}
              />
            ))
          )}
        </aside>

        {/* Terminal area */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {selectedSession ? (
            <>
              {/* Terminal header */}
              <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{selectedSession.name}</span>
                  <span className="text-xs text-[var(--text-muted)] font-mono truncate">
                    {selectedSession.workingDir}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] shrink-0">
                  <span>PID: {selectedSession.pid || "—"}</span>
                  <span>{selectedSession.metrics.toolCalls} tool calls</span>
                </div>
              </div>
              {/* Terminal */}
              <div className="flex-1 min-h-0">
                <TerminalPanel
                  key={selectedSession.id}
                  session={selectedSession}
                  onTerminalData={onTerminalData}
                  onInput={sendInput}
                  onResize={resize}
                  onRequestBuffer={getBuffer}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4 opacity-20">&#x2B21;</div>
                <p className="text-sm text-[var(--text-muted)]">
                  {sessions.length === 0
                    ? "Create a session to get started"
                    : "Select a session from the sidebar"}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* New session dialog */}
      <NewSessionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createSession}
        homeDir={homeDir}
        browseDirs={browseDirs}
        onBrowse={browsePath}
      />
    </div>
  );
}
