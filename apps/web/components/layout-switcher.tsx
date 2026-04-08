"use client";

import type { LayoutMode } from "@claude-hive/shared";

interface LayoutSwitcherProps {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

const MODES: { mode: LayoutMode; label: string; icon: React.ReactNode }[] = [
  {
    mode: "single",
    label: "Single",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
    ),
  },
  {
    mode: "grid",
    label: "Grid",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="8" height="8" rx="1" />
        <rect x="13" y="3" width="8" height="8" rx="1" />
        <rect x="3" y="13" width="8" height="8" rx="1" />
        <rect x="13" y="13" width="8" height="8" rx="1" />
      </svg>
    ),
  },
  {
    mode: "split-h",
    label: "Split Horizontal",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="8" height="18" rx="1" />
        <rect x="13" y="3" width="8" height="18" rx="1" />
      </svg>
    ),
  },
  {
    mode: "split-v",
    label: "Split Vertical",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="8" rx="1" />
        <rect x="3" y="13" width="18" height="8" rx="1" />
      </svg>
    ),
  },
  {
    mode: "tabs",
    label: "Tabs",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="7" width="18" height="14" rx="1" />
        <path d="M3 7h6V4h6v3" />
      </svg>
    ),
  },
];

export function LayoutSwitcher({ mode, onChange }: LayoutSwitcherProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5">
      {MODES.map(({ mode: m, label, icon }) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`rounded-md p-1.5 transition-colors ${
            mode === m
              ? "bg-amber-500/15 text-amber-400"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          }`}
          title={label}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
