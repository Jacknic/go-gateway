import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Terminal as TerminalIcon, RefreshCw, AlertTriangle } from "lucide-react";
import { Workspace } from "../types";
import "xterm/css/xterm.css";

interface TerminalTabProps {
  workspace: Workspace;
}

export default function TerminalTab({ workspace }: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");

  const connectTerminal = () => {
    if (!terminalRef.current) return;
    setStatus("connecting");

    // Close existing socket if any
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Initialize xterm if not already initialized
    if (!terminalInstance.current) {
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Fira Code, Courier New, monospace",
        fontSize: 13,
        theme: {
          background: "#0d0e15",
          foreground: "#b5e8e0",
          cursor: "#f97316",
          black: "#1e1e24",
          red: "#f43f5e",
          green: "#10b981",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#d946ef",
          cyan: "#06b6d4",
          white: "#f3f4f6",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      term.open(terminalRef.current);
      fitAddon.fit();

      terminalInstance.current = term;
      fitAddonInstance.current = fitAddon;
    } else {
      terminalInstance.current.clear();
    }

    const term = terminalInstance.current;

    // Set up Websocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const socketUrl = `${protocol}//${host}/api/terminal?workspaceId=${workspace.id}`;

    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus("connected");
      // Send resize details initially
      const cols = term.cols;
      const rows = term.rows;
      socket.send(JSON.stringify({ type: "resize", cols, rows }));
    };

    socket.onmessage = (event) => {
      term.write(event.data);
    };

    socket.onclose = () => {
      setStatus("disconnected");
    };

    socket.onerror = (err) => {
      console.error("WebSocket Terminal error:", err);
      setStatus("error");
    };

    // Terminal keystrokes to WebSocket
    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });
  };

  useEffect(() => {
    connectTerminal();

    const handleResize = () => {
      if (fitAddonInstance.current && terminalInstance.current) {
        fitAddonInstance.current.fit();
        const term = terminalInstance.current;
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (terminalInstance.current) {
        terminalInstance.current.dispose();
        terminalInstance.current = null;
      }
    };
  }, [workspace.id]);

  const handleReconnect = () => {
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }
    connectTerminal();
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] w-full bg-[#0d0e15] border border-[#26293a] rounded-lg overflow-hidden">
      {/* Terminal Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141622] border-b border-[#26293a]">
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-[#f97316]" />
          <span className="text-xs font-semibold text-white tracking-wide">
            Secure Terminal - {workspace.name}
          </span>
          <span
            className={`w-2 h-2 rounded-full ml-2 ${
              status === "connected"
                ? "bg-green-500 animate-pulse"
                : status === "connecting"
                ? "bg-amber-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className="text-[10px] text-gray-500 font-mono">
            {status === "connected" && "CONNECTED"}
            {status === "connecting" && "CONNECTING..."}
            {status === "disconnected" && "DISCONNECTED"}
            {status === "error" && "CONNECTION ERROR"}
          </span>
        </div>

        <button
          onClick={handleReconnect}
          className="p-1 rounded bg-[#222436] hover:bg-[#2c2f4a] text-gray-400 hover:text-white transition duration-150 flex items-center gap-1 text-[11px]"
          title="Restart Terminal Session"
        >
          <RefreshCw size={12} className={status === "connecting" ? "animate-spin" : ""} />
          <span>重连终端</span>
        </button>
      </div>

      {/* Terminal Body */}
      <div className="flex-1 p-3 bg-[#0d0e15] relative overflow-hidden">
        {status === "error" && (
          <div className="absolute inset-0 bg-[#0d0e15]/90 flex flex-col items-center justify-center text-center p-6 z-10">
            <AlertTriangle className="text-red-500 w-10 h-10 mb-2 animate-bounce" />
            <h4 className="text-sm font-bold text-white">连接终端失败</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              无法与服务端建立安全终端连接。请确认后台网关程序正在运行并支持 WebSockets。
            </p>
            <button
              onClick={handleReconnect}
              className="mt-4 px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow transition"
            >
              重试连接
            </button>
          </div>
        )}

        {status === "disconnected" && (
          <div className="absolute inset-0 bg-[#0d0e15]/90 flex flex-col items-center justify-center text-center p-6 z-10">
            <TerminalIcon className="text-gray-500 w-10 h-10 mb-2" />
            <h4 className="text-sm font-bold text-gray-400">终端会话已断开</h4>
            <p className="text-xs text-gray-500 mt-1">
              安全 Shell 会话已退出或被服务端主动关闭。
            </p>
            <button
              onClick={handleReconnect}
              className="mt-4 px-3 py-1.5 rounded-md bg-[#222436] hover:bg-[#2c2f4a] text-white text-xs font-semibold border border-[#2b2d42] transition"
            >
              重新连接
            </button>
          </div>
        )}

        {/* This element will be populated by Xterm.js */}
        <div ref={terminalRef} className="w-full h-full text-left" id="terminal-emulator-container" />
      </div>
    </div>
  );
}
