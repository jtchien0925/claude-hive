"use client";

import { useState, useEffect, useRef } from "react";

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, workingDir: string, initialPrompt?: string) => void;
  homeDir: string;
  browseDirs: { path: string; dirs: string[] };
  onBrowse: (path: string) => void;
}

export function NewSessionDialog({
  open,
  onClose,
  onCreate,
  homeDir,
  browseDirs,
  onBrowse,
}: NewSessionDialogProps) {
  const [name, setName] = useState("");
  const [workingDir, setWorkingDir] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Set home dir as default when it arrives
  useEffect(() => {
    if (homeDir && !workingDir) {
      setWorkingDir(homeDir);
    }
  }, [homeDir, workingDir]);

  // Browse current path when browser opens
  useEffect(() => {
    if (showBrowser && workingDir) {
      onBrowse(workingDir);
    }
  }, [showBrowser, workingDir, onBrowse]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate(name || `Session ${Date.now() % 1000}`, workingDir || homeDir || "~", initialPrompt || undefined);
    setName("");
    setWorkingDir("");
    setInitialPrompt("");
    setShowBrowser(false);
    onClose();
  };

  const navigateTo = (dir: string) => {
    const newPath = workingDir.endsWith("/")
      ? workingDir + dir
      : workingDir + "/" + dir;
    setWorkingDir(newPath);
    onBrowse(newPath);
  };

  const navigateUp = () => {
    const parts = workingDir.split("/").filter(Boolean);
    parts.pop();
    const newPath = "/" + parts.join("/");
    setWorkingDir(newPath);
    onBrowse(newPath);
  };

  const handleDirInputChange = (val: string) => {
    setWorkingDir(val);
    // Auto-browse as user types if it looks like a complete path
    if (val.endsWith("/") || val === "~") {
      onBrowse(val);
      setShowBrowser(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-2xl"
      >
        <h2 className="text-lg font-semibold mb-4">New Claude Session</h2>

        <label className="block mb-3">
          <span className="text-xs text-[var(--text-secondary)] mb-1 block">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Feature work"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-amber-500/50"
          />
        </label>

        <label className="block mb-1">
          <span className="text-xs text-[var(--text-secondary)] mb-1 block">Working Directory</span>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={workingDir}
              onChange={(e) => handleDirInputChange(e.target.value)}
              placeholder={homeDir || "/path/to/project"}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm font-mono outline-none focus:border-amber-500/50"
            />
            <button
              type="button"
              onClick={() => {
                setShowBrowser(!showBrowser);
                if (!showBrowser) onBrowse(workingDir || homeDir);
              }}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm transition-colors ${
                showBrowser
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                  : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--border-active)]"
              }`}
              title="Browse folders"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              </svg>
            </button>
          </div>
        </label>

        {/* Folder browser */}
        {showBrowser && (
          <div className="mb-3 mt-2 max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
            {/* Up button */}
            <button
              type="button"
              onClick={navigateUp}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] border-b border-[var(--border)]"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
              ../ (up)
            </button>
            {browseDirs.dirs.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[var(--text-muted)] text-center">
                No subdirectories
              </div>
            ) : (
              browseDirs.dirs.map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => navigateTo(dir)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-mono text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400/70 shrink-0">
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  {dir}
                </button>
              ))
            )}
          </div>
        )}

        {!showBrowser && (
          <p className="text-xs text-[var(--text-muted)] mb-3 mt-1">
            Tip: paste a path or click the folder icon to browse
          </p>
        )}

        <label className="block mb-4">
          <span className="text-xs text-[var(--text-secondary)] mb-1 block">Initial Prompt (optional)</span>
          <textarea
            value={initialPrompt}
            onChange={(e) => setInitialPrompt(e.target.value)}
            placeholder="e.g. Fix the login bug in auth.ts"
            rows={3}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-amber-500/50 resize-none"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setShowBrowser(false);
              onClose();
            }}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400"
          >
            Create Session
          </button>
        </div>
      </form>
    </div>
  );
}
