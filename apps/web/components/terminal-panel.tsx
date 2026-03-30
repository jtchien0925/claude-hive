"use client";

import { useEffect, useRef } from "react";
import type { Session } from "@claude-hive/shared";

interface TerminalPanelProps {
  session: Session;
  onTerminalData: (sessionId: string, cb: (data: string) => void) => () => void;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onRequestBuffer: (sessionId: string) => void;
}

export function TerminalPanel({
  session,
  onTerminalData,
  onInput,
  onResize,
  onRequestBuffer,
}: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cleanup: (() => void) | undefined;

    async function init() {
      // Wait for container to be in the DOM
      if (!containerRef.current) return;

      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      // Check again after async imports
      if (!containerRef.current) return;

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

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      const container = containerRef.current;
      if (!container) {
        term.dispose();
        return;
      }

      term.open(container);
      fitAddon.fit();

      termRef.current = term;
      fitRef.current = fitAddon;

      // Forward input to server
      term.onData((data) => {
        onInput(session.id, data);
      });

      // Report size
      onResize(session.id, term.cols, term.rows);
      term.onResize(({ cols, rows }) => {
        onResize(session.id, cols, rows);
      });

      // Listen for live output
      const unsubscribe = onTerminalData(session.id, (data) => {
        term.write(data);
      });

      // Request buffered history so we see past output
      onRequestBuffer(session.id);

      // Handle container resize
      const observer = new ResizeObserver(() => {
        fitAddon.fit();
      });
      observer.observe(container);

      cleanup = () => {
        unsubscribe();
        observer.disconnect();
        term.dispose();
      };
    }

    init();

    return () => {
      cleanup?.();
    };
  }, [session.id, onTerminalData, onInput, onResize, onRequestBuffer]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0"
      style={{ background: "#0a0a0a" }}
    />
  );
}
