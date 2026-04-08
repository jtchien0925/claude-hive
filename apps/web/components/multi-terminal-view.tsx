"use client";

import { memo } from "react";
import type { Session, LayoutMode } from "@claude-hive/shared";
import { TerminalPanel } from "./terminal-panel";

interface MultiTerminalViewProps {
  sessions: Session[];
  selectedId: string | null;
  layout: LayoutMode;
  onSelectSession: (id: string) => void;
  onTerminalData: (sessionId: string, cb: (data: string) => void) => () => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onRequestBuffer: (sessionId: string) => void;
}

function TerminalCell({
  session,
  isSelected,
  onSelect,
  onTerminalData,
  onInput,
  onResize,
  onRequestBuffer,
}: {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
  onTerminalData: MultiTerminalViewProps["onTerminalData"];
  onInput: MultiTerminalViewProps["onInput"];
  onResize: MultiTerminalViewProps["onResize"];
  onRequestBuffer: MultiTerminalViewProps["onRequestBuffer"];
}) {
  return (
    <div
      className={`flex flex-col min-h-0 min-w-0 border rounded-lg overflow-hidden ${
        isSelected ? "border-amber-500/50" : "border-[var(--border)]"
      }`}
    >
      <div
        onClick={onSelect}
        className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer shrink-0 ${
          isSelected
            ? "bg-amber-500/10 text-amber-400"
            : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
        }`}
      >
        <StatusDot status={session.status} />
        <span className="truncate font-medium">{session.name}</span>
        <span className="truncate text-[var(--text-muted)] font-mono ml-auto">
          {session.workingDir}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <TerminalPanel
          key={session.id}
          session={session}
          onTerminalData={onTerminalData}
          onInput={onInput}
          onResize={onResize}
          onRequestBuffer={onRequestBuffer}
        />
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: Session["status"] }) {
  const dotClass: Record<string, string> = {
    idle: "bg-zinc-400",
    streaming: "bg-blue-400 animate-pulse",
    tool_use: "bg-purple-400 animate-pulse",
    waiting_approval: "bg-amber-400 animate-pulse",
    error: "bg-red-400",
    stopped: "bg-zinc-600",
  };
  return <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotClass[status] || "bg-zinc-400"}`} />;
}

export const MultiTerminalView = memo(function MultiTerminalView({
  sessions,
  selectedId,
  layout,
  onSelectSession,
  onTerminalData,
  onInput,
  onResize,
  onRequestBuffer,
}: MultiTerminalViewProps) {
  const selected = sessions.find((s) => s.id === selectedId);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center h-full">
        <div className="text-center">
          <div className="text-5xl mb-4 opacity-20">&#x2B21;</div>
          <p className="text-sm text-[var(--text-muted)]">Create a session to get started</p>
        </div>
      </div>
    );
  }

  // Single mode — just show the selected terminal
  if (layout === "single") {
    if (!selected) {
      return (
        <div className="flex flex-1 items-center justify-center h-full">
          <p className="text-sm text-[var(--text-muted)]">Select a session from the sidebar</p>
        </div>
      );
    }
    return (
      <div className="flex-1 min-h-0">
        <TerminalPanel
          key={selected.id}
          session={selected}
          onTerminalData={onTerminalData}
          onInput={onInput}
          onResize={onResize}
          onRequestBuffer={onRequestBuffer}
        />
      </div>
    );
  }

  // Tabs mode — tab buttons at top, one terminal below
  if (layout === "tabs") {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1 shrink-0">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs whitespace-nowrap transition-colors ${
                s.id === selectedId
                  ? "bg-amber-500/15 text-amber-400"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
              }`}
            >
              <StatusDot status={s.status} />
              <span className="truncate max-w-[120px]">{s.name}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 min-h-0">
          {selected ? (
            <TerminalPanel
              key={selected.id}
              session={selected}
              onTerminalData={onTerminalData}
              onInput={onInput}
              onResize={onResize}
              onRequestBuffer={onRequestBuffer}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-[var(--text-muted)]">Select a tab</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid mode — up to 4 sessions in 2x2
  if (layout === "grid") {
    const visible = sessions.slice(0, 4);
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-1 h-full min-h-0 p-1">
        {visible.map((s) => (
          <TerminalCell
            key={s.id}
            session={s}
            isSelected={s.id === selectedId}
            onSelect={() => onSelectSession(s.id)}
            onTerminalData={onTerminalData}
            onInput={onInput}
            onResize={onResize}
            onRequestBuffer={onRequestBuffer}
          />
        ))}
      </div>
    );
  }

  // Split-h — two terminals side by side
  if (layout === "split-h") {
    const pair = getSplitPair(sessions, selectedId);
    return (
      <div className="flex gap-1 h-full min-h-0 p-1">
        {pair.map((s) => (
          <div key={s.id} className="flex-1 min-w-0 min-h-0">
            <TerminalCell
              session={s}
              isSelected={s.id === selectedId}
              onSelect={() => onSelectSession(s.id)}
              onTerminalData={onTerminalData}
              onInput={onInput}
              onResize={onResize}
              onRequestBuffer={onRequestBuffer}
            />
          </div>
        ))}
      </div>
    );
  }

  // Split-v — two terminals stacked
  if (layout === "split-v") {
    const pair = getSplitPair(sessions, selectedId);
    return (
      <div className="flex flex-col gap-1 h-full min-h-0 p-1">
        {pair.map((s) => (
          <div key={s.id} className="flex-1 min-w-0 min-h-0">
            <TerminalCell
              session={s}
              isSelected={s.id === selectedId}
              onSelect={() => onSelectSession(s.id)}
              onTerminalData={onTerminalData}
              onInput={onInput}
              onResize={onResize}
              onRequestBuffer={onRequestBuffer}
            />
          </div>
        ))}
      </div>
    );
  }

  return null;
});

function getSplitPair(sessions: Session[], selectedId: string | null): Session[] {
  const idx = sessions.findIndex((s) => s.id === selectedId);
  if (idx >= 0 && sessions.length > 1) {
    const nextIdx = (idx + 1) % sessions.length;
    return [sessions[idx], sessions[nextIdx]];
  }
  return sessions.slice(0, 2);
}
