"use client";

import { memo, useEffect, useRef } from "react";
import type { Session } from "@claude-hive/shared";

interface TerminalPanelProps {
  session: Session;
  onTerminalData: (sessionId: string, cb: (data: string) => void) => () => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onRequestBuffer: (sessionId: string) => void;
}

// Module-level mutex to prevent concurrent init for the same container
const initLocks = new WeakSet<HTMLDivElement>();

export const TerminalPanel = memo(function TerminalPanel({
  session,
  onTerminalData,
  onInput,
  onResize,
  onRequestBuffer,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Store callbacks in refs so the effect doesn't re-run when they change
  const onTerminalDataRef = useRef(onTerminalData);
  const onInputRef = useRef(onInput);
  const onResizeRef = useRef(onResize);
  const onRequestBufferRef = useRef(onRequestBuffer);
  onTerminalDataRef.current = onTerminalData;
  onInputRef.current = onInput;
  onResizeRef.current = onResize;
  onRequestBufferRef.current = onRequestBuffer;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Tear down any previous terminal
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    termRef.current = null;
    container.innerHTML = "";

    // Use a cancelled flag scoped to THIS effect invocation
    let cancelled = false;
    const initId = session.id;
    // Capture non-null container for use inside async init
    const el = container;

    async function init() {
      // Acquire lock — if another init is already in progress for this
      // container (React strict mode double-mount), bail immediately
      if (initLocks.has(el)) return;
      initLocks.add(el);

      try {
        const { Terminal } = await import("@xterm/xterm");
        const { FitAddon } = await import("@xterm/addon-fit");
        const { WebLinksAddon } = await import("@xterm/addon-web-links");

        // If this effect was cleaned up while we were awaiting imports, bail
        if (cancelled) return;

        const term = new Terminal({
          theme: {
            background: "#0a0a0a",
            foreground: "#e5e5e5",
            cursor: "#f59e0b",
            cursorAccent: "#0a0a0a",
            selectionBackground: "#f59e0b33",
            black: "#0a0a0a",
            red: "#ef4444",
            green: "#22c55e",
            yellow: "#f59e0b",
            blue: "#3b82f6",
            magenta: "#a855f7",
            cyan: "#06b6d4",
            white: "#e5e5e5",
            brightBlack: "#666666",
            brightRed: "#f87171",
            brightGreen: "#4ade80",
            brightYellow: "#fbbf24",
            brightBlue: "#60a5fa",
            brightMagenta: "#c084fc",
            brightCyan: "#22d3ee",
            brightWhite: "#ffffff",
          },
          fontSize: 13,
          fontFamily: "'Geist Mono', 'SF Mono', Monaco, monospace",
          cursorBlink: true,
          scrollback: 10000,
          allowProposedApi: true,
        });

        // Double-check cancelled after creating terminal (before mounting to DOM)
        if (cancelled) {
          term.dispose();
          return;
        }

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());

        el.innerHTML = "";
        term.open(el);
        fitAddon.fit();

        termRef.current = term;

        // Forward input to server
        term.onData((data) => {
          onInputRef.current(initId, data);
        });

        // Report size
        onResizeRef.current(initId, term.cols, term.rows);
        term.onResize(({ cols, rows }) => {
          onResizeRef.current(initId, cols, rows);
        });

        // Listen for live output
        const unsubscribe = onTerminalDataRef.current(initId, (data) => {
          term.write(data);
        });

        // Request buffered history so we see past output
        onRequestBufferRef.current(initId);

        // Handle container resize
        const observer = new ResizeObserver(() => {
          fitAddon.fit();
        });
        observer.observe(el);

        cleanupRef.current = () => {
          unsubscribe();
          observer.disconnect();
          term.dispose();
          termRef.current = null;
        };
      } finally {
        initLocks.delete(el);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      termRef.current = null;
    };
  }, [session.id]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0"
      style={{ background: "#0a0a0a" }}
    />
  );
});
