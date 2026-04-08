"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { Session, SessionGroup, SessionColor } from "@claude-hive/shared";
import { COLOR_HEX } from "@claude-hive/shared";

const STATUS_DOT: Record<string, string> = {
  idle: "bg-zinc-400",
  streaming: "bg-blue-400 animate-pulse",
  tool_use: "bg-purple-400 animate-pulse",
  waiting_approval: "bg-amber-400 animate-pulse",
  error: "bg-red-400",
  stopped: "bg-zinc-600",
};

interface GroupsSidebarProps {
  groups: SessionGroup[];
  sessions: Session[];
  selectedId: string | null;
  onSelectSession: (id: string) => void;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddToGroup: (groupId: string, sessionId: string) => void;
  onRemoveFromGroup: (groupId: string, sessionId: string) => void;
  onKillSession: (id: string) => void;
  onRestartSession: (id: string) => void;
  onRenameSession: (id: string, name: string) => void;
  onColorChange: (id: string, color: SessionColor) => void;
}

export function GroupsSidebar({
  groups,
  sessions,
  selectedId,
  onSelectSession,
  onCreateGroup,
  onDeleteGroup,
  onAddToGroup,
  onRemoveFromGroup,
  onKillSession,
  onRestartSession,
}: GroupsSidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [moveDropdown, setMoveDropdown] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const groupedSessionIds = new Set(groups.flatMap((g) => g.sessionIds));
  const ungrouped = sessions.filter((s) => !groupedSessionIds.has(s.id));

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleCreateGroup = useCallback(() => {
    const trimmed = newGroupName.trim();
    if (trimmed) {
      onCreateGroup(trimmed);
      setNewGroupName("");
      setCreating(false);
    }
  }, [newGroupName, onCreateGroup]);

  useEffect(() => {
    if (creating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [creating]);

  // Close move dropdown on outside click
  useEffect(() => {
    if (!moveDropdown) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMoveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moveDropdown]);

  if (groups.length === 0 && !creating) {
    return null;
  }

  return (
    <div className="mb-2">
      {/* Groups header */}
      <div className="flex items-center justify-between px-1 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Groups
        </span>
        <button
          onClick={() => setCreating(true)}
          className="rounded p-0.5 text-[var(--text-muted)] hover:text-amber-400 transition-colors"
          title="Create group"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* New group input */}
      {creating && (
        <div className="mb-1.5 flex gap-1 px-1">
          <input
            ref={createInputRef}
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateGroup();
              if (e.key === "Escape") { setCreating(false); setNewGroupName(""); }
            }}
            onBlur={() => { if (!newGroupName.trim()) setCreating(false); }}
            placeholder="Group name..."
            className="flex-1 min-w-0 rounded bg-[var(--bg-tertiary)] px-2 py-1 text-xs outline-none ring-1 ring-amber-500/30 focus:ring-amber-500/60"
          />
          <button
            onClick={handleCreateGroup}
            className="rounded bg-amber-500/20 px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/30"
          >
            Add
          </button>
        </div>
      )}

      {/* Group list */}
      {groups.map((group) => {
        const isCollapsed = collapsed[group.id];
        const groupSessions = group.sessionIds
          .map((sid) => sessions.find((s) => s.id === sid))
          .filter(Boolean) as Session[];

        return (
          <div key={group.id} className="mb-1">
            {/* Group header */}
            <div className="flex items-center gap-1 px-1 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors">
              <button
                onClick={() => toggleCollapse(group.id)}
                className="text-[var(--text-muted)] shrink-0"
              >
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                  className={`transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
              <span className="text-xs font-medium text-[var(--text-secondary)] flex-1 truncate">
                {group.name}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{groupSessions.length}</span>
              <button
                onClick={() => onDeleteGroup(group.id)}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                title="Delete group"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* Group sessions */}
            {!isCollapsed && (
              <div className="ml-3 space-y-0.5">
                {groupSessions.length === 0 ? (
                  <p className="text-[10px] text-[var(--text-muted)] px-2 py-1 italic">Empty group</p>
                ) : (
                  groupSessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => onSelectSession(s.id)}
                      className={`group/item flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer transition-colors ${
                        s.id === selectedId
                          ? "bg-amber-500/10 text-amber-400"
                          : "hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                      }`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[s.status] || "bg-zinc-400"}`} />
                      {s.color && (
                        <div
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: COLOR_HEX[s.color] }}
                        />
                      )}
                      <span className="text-xs truncate flex-1">{s.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveFromGroup(group.id, s.id);
                        }}
                        className="rounded p-0.5 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover/item:opacity-100"
                        title="Remove from group"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Ungrouped sessions with "move to group" dropdown */}
      {ungrouped.length > 0 && groups.length > 0 && (
        <div className="mt-1 pt-1 border-t border-[var(--border)]">
          <span className="text-[10px] text-[var(--text-muted)] px-1 block mb-1">Ungrouped</span>
          {ungrouped.map((s) => (
            <div
              key={s.id}
              className="relative flex items-center gap-1.5 px-2 py-1 group/ug"
            >
              <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[s.status] || "bg-zinc-400"}`} />
              <span
                className="text-xs truncate flex-1 cursor-pointer hover:text-amber-400"
                onClick={() => onSelectSession(s.id)}
              >
                {s.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMoveDropdown(moveDropdown === s.id ? null : s.id);
                }}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-amber-400 opacity-0 group-hover/ug:opacity-100"
                title="Move to group"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>

              {moveDropdown === s.id && (
                <div
                  ref={dropdownRef}
                  className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg"
                >
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        onAddToGroup(g.id, s.id);
                        setMoveDropdown(null);
                      }}
                      className="w-full text-left px-3 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
