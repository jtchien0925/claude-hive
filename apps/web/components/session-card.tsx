"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionStatus, SessionColor } from "@claude-hive/shared";
import { COLOR_HEX, SESSION_COLORS, formatTokens, formatCost } from "@claude-hive/shared";

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
  onRename: (id: string, name: string) => void;
  onColorChange: (id: string, color: SessionColor) => void;
}

export function SessionCard({
  session,
  isSelected,
  onClick,
  onKill,
  onRestart,
  onRename,
  onColorChange,
}: SessionCardProps) {
  const status = STATUS_CONFIG[session.status];
  const duration = formatDuration(Date.now() - session.createdAt);

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Color accent is rendered as an absolute-positioned bar inside the card

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.name) {
      onRename(session.id, trimmed);
    } else {
      setRenameValue(session.name);
    }
    setIsRenaming(false);
  }, [renameValue, session.name, session.id, onRename]);

  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(session.name);
    setIsRenaming(true);
  }, [session.name]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      commitRename();
    } else if (e.key === "Escape") {
      setRenameValue(session.name);
      setIsRenaming(false);
    }
  }, [commitRename, session.name]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowColorPicker((prev) => !prev);
  }, []);

  // Focus input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return;
    function handleClick(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColorPicker]);

  return (
    <div
      onClick={onClick}
      onContextMenu={handleContextMenu}
      className={`
        group relative cursor-pointer rounded-lg border p-3 transition-all overflow-hidden
        ${isSelected
          ? "border-amber-500/50 bg-amber-500/5"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--border-active)]"
        }
      `}
    >
      {/* Color accent bar */}
      {session.color && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
          style={{ backgroundColor: COLOR_HEX[session.color] }}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full shrink-0 ${status.dot}`} />
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 truncate rounded bg-[var(--bg-tertiary)] px-1 py-0 text-sm font-medium outline-none ring-1 ring-amber-500/50"
                maxLength={60}
              />
            ) : (
              <h3
                className="truncate text-sm font-medium"
                onDoubleClick={handleNameDoubleClick}
                title="Double-click to rename"
              >
                {session.name}
              </h3>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
            {session.workingDir}
          </p>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowColorPicker((prev) => !prev);
            }}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
            title="Change color"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" fill={session.color ? COLOR_HEX[session.color] : "currentColor"} opacity="0.6" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </button>
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

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
        <span className={status.color}>{status.label}</span>
        <span>{duration}</span>
        <span>{session.metrics.toolCalls} tools</span>
        {session.metrics.tokenEstimate > 0 && (
          <span title="Token estimate">{formatTokens(session.metrics.tokenEstimate)} tok</span>
        )}
        {session.metrics.costEstimate > 0 && (
          <span title="Cost estimate">{formatCost(session.metrics.costEstimate)}</span>
        )}
      </div>

      {/* Color picker popover */}
      {showColorPicker && (
        <div
          ref={colorPickerRef}
          className="absolute left-2 top-full z-50 mt-1 flex gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          {SESSION_COLORS.map((c) => (
            <button
              key={c}
              onClick={(e) => {
                e.stopPropagation();
                onColorChange(session.id, c);
                setShowColorPicker(false);
              }}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-125 ${
                session.color === c ? "border-white" : "border-transparent"
              }`}
              style={{ backgroundColor: COLOR_HEX[c] }}
              title={c}
            />
          ))}
        </div>
      )}
    </div>
  );
}
