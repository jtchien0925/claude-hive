"use client";

import type { Session, SessionStatus } from "@claude-hive/shared";

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; dot: string }> = {
  idle: { label: "Idle", color: "text-zinc-400", dot: "bg-zinc-400" },
  streaming: { label: "Streaming", color: "text-blue-400", dot: "bg-blue-400 animate-pulse" },
  tool_use: { label: "Tool Use", color: "text-purple-400", dot: "bg-purple-400 animate-pulse" },
  waiting_approval: { label: "Waiting", color: "text-amber-400", dot: "bg-amber-400 animate-pulse" },
  error: { label: "Error", color: "text-red-400", dot: "bg-red-400" },
  stopped: { label: "Stopped", color: "text-zinc-600", dot: "bg-zinc-600" },
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
  onKill: () => void;
  onRestart: () => void;
}

export function SessionCard({ session, isSelected, onClick, onKill, onRestart }: SessionCardProps) {
  const status = STATUS_CONFIG[session.status];
  const duration = formatDuration(Date.now() - session.createdAt);

  return (
    <div
      onClick={onClick}
      className={`
        group cursor-pointer rounded-lg border p-3 transition-all
        ${isSelected
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--border-active)]"
        }
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full shrink-0 ${status.dot}`} />
            <h3 className="truncate text-sm font-medium">{session.name}</h3>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
            {session.workingDir}
          </p>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onRestart(); }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            title="Restart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onKill(); }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
            title="Kill"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
        <span className={status.color}>{status.label}</span>
        <span>{duration}</span>
        <span>{session.metrics.toolCalls} tools</span>
      </div>
    </div>
  );
}
