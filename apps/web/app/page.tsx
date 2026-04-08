"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useHive } from "@/lib/use-hive";
import { useTheme } from "@/lib/theme-context";
import { SessionCard } from "@/components/session-card";
import { NewSessionDialog } from "@/components/new-session-dialog";
import { GroupsSidebar } from "@/components/groups-sidebar";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { MultiTerminalView } from "@/components/multi-terminal-view";
import type { LayoutMode } from "@claude-hive/shared";
import { formatTokens, formatCost } from "@claude-hive/shared";

export default function Home() {
  const {
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
    exportLogs,
  } = useHive();

  const { theme, toggleTheme } = useTheme();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutMode>("single");
  const prevSessionCount = useRef(sessions.length);

  // Dedupe sessions by id — memoized to prevent unnecessary re-renders downstream
  const uniqueSessions = useMemo(
    () => Array.from(new Map(sessions.map((s) => [s.id, s])).values()),
    [sessions]
  );

  const selectedSession = uniqueSessions.find((s) => s.id === selectedId);

  // Auto-select newly created session
  useEffect(() => {
    if (uniqueSessions.length > prevSessionCount.current) {
      const newest = uniqueSessions[uniqueSessions.length - 1];
      if (newest) setSelectedId(newest.id);
    } else if (selectedId && !uniqueSessions.find((s) => s.id === selectedId) && uniqueSessions.length > 0) {
      setSelectedId(uniqueSessions[0].id);
    }
    prevSessionCount.current = uniqueSessions.length;
  }, [uniqueSessions, selectedId]);

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
          <LayoutSwitcher mode={layout} onChange={setLayout} />
          <span className="text-xs text-[var(--text-muted)]">
            {uniqueSessions.length} session{uniqueSessions.length !== 1 ? "s" : ""}
          </span>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:border-[var(--border-active)] hover:text-[var(--text-secondary)] transition-colors"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
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
          {/* Groups section */}
          <GroupsSidebar
            groups={groups}
            sessions={uniqueSessions}
            selectedId={selectedId}
            onSelectSession={setSelectedId}
            onCreateGroup={createGroup}
            onDeleteGroup={deleteGroup}
            onAddToGroup={addToGroup}
            onRemoveFromGroup={removeFromGroup}
            onKillSession={killSession}
            onRestartSession={restartSession}
            onRenameSession={renameSession}
            onColorChange={setSessionColor}
          />

          {/* Session list */}
          {uniqueSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="text-3xl mb-3">&#x2B21;</div>
              <p className="text-sm text-[var(--text-secondary)] mb-1">No active sessions</p>
              <p className="text-xs text-[var(--text-muted)]">
                Click &quot;New Session&quot; to spawn a Claude Code instance
              </p>
            </div>
          ) : (
            uniqueSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={session.id === selectedId}
                onClick={() => setSelectedId(session.id)}
                onKill={() => killSession(session.id)}
                onRestart={() => restartSession(session.id)}
                onRename={renameSession}
                onColorChange={setSessionColor}
              />
            ))
          )}
        </aside>

        {/* Terminal area */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Terminal header — only show in single/tabs mode when a session is selected */}
          {selectedSession && (layout === "single" || layout === "tabs") && (
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium truncate">{selectedSession.name}</span>
                <span className="text-xs text-[var(--text-muted)] font-mono truncate">
                  {selectedSession.workingDir}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--text-muted)] shrink-0">
                <span>PID: {selectedSession.pid || "\u2014"}</span>
                <span>{selectedSession.metrics.toolCalls} tool calls</span>
                {selectedSession.metrics.tokenEstimate > 0 && (
                  <span>{formatTokens(selectedSession.metrics.tokenEstimate)} tokens</span>
                )}
                {selectedSession.metrics.costEstimate > 0 && (
                  <span>{formatCost(selectedSession.metrics.costEstimate)}</span>
                )}
                {/* Export logs button */}
                <button
                  onClick={() => exportLogs(selectedSession.id, "text")}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
                  title="Export logs"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Terminal content - uses MultiTerminalView for all layout modes */}
          <div className="flex-1 min-h-0">
            <MultiTerminalView
              sessions={uniqueSessions}
              selectedId={selectedId}
              layout={layout}
              onSelectSession={setSelectedId}
              onTerminalData={onTerminalData}
              onInput={sendInput}
              onResize={resize}
              onRequestBuffer={getBuffer}
            />
          </div>
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
