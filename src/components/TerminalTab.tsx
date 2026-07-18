import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { Terminal as TerminalIcon, RefreshCw, AlertTriangle } from "lucide-react";
import { Workspace } from "../types";
import "xterm/css/xterm.css";

interface ThemeDefinition {
  id: string;
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

const TERMINAL_THEMES: ThemeDefinition[] = [
  {
    id: "cosmic",
    name: "Cosmic Dark",
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
  {
    id: "dracula",
    name: "Dracula",
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#ff79c6",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
  },
  {
    id: "solarized",
    name: "Solarized Dark",
    background: "#002b36",
    foreground: "#839496",
    cursor: "#93a1a1",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
  },
  {
    id: "gruvbox",
    name: "Gruvbox Dark",
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#fe8019",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
  },
  {
    id: "nord",
    name: "Nord",
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#88c0d0",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
  },
  {
    id: "monokai",
    name: "Monokai",
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f92672",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
  },
];

interface TerminalTabProps {
  workspace: Workspace;
}

export default function TerminalTab({ workspace }: TerminalTabProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected" | "error">("connecting");
  const [selectedThemeId, setSelectedThemeId] = useState<string>(() => {
    return localStorage.getItem("terminal_theme_id") || "cosmic";
  });

  const currentTheme = TERMINAL_THEMES.find(t => t.id === selectedThemeId) || TERMINAL_THEMES[0];

  const connectTerminal = () => {
    if (!terminalRef.current) return;
    setStatus("connecting");

    // Close existing socket if any
    if (socketRef.current) {
      socketRef.current.close();
    }

    // Initialize xterm if not already initialized
    if (!terminalInstance.current) {
      const activeTheme = TERMINAL_THEMES.find(t => t.id === selectedThemeId) || TERMINAL_THEMES[0];
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Fira Code, Courier New, monospace",
        fontSize: 13,
        theme: {
          background: activeTheme.background,
          foreground: activeTheme.foreground,
          cursor: activeTheme.cursor,
          black: activeTheme.black,
          red: activeTheme.red,
          green: activeTheme.green,
          yellow: activeTheme.yellow,
          blue: activeTheme.blue,
          magenta: activeTheme.magenta,
          cyan: activeTheme.cyan,
          white: activeTheme.white,
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

  useEffect(() => {
    if (terminalInstance.current) {
      terminalInstance.current.options.theme = {
        background: currentTheme.background,
        foreground: currentTheme.foreground,
        cursor: currentTheme.cursor,
        black: currentTheme.black,
        red: currentTheme.red,
        green: currentTheme.green,
        yellow: currentTheme.yellow,
        blue: currentTheme.blue,
        magenta: currentTheme.magenta,
        cyan: currentTheme.cyan,
        white: currentTheme.white,
      };
    }
    localStorage.setItem("terminal_theme_id", selectedThemeId);
  }, [selectedThemeId]);

  const handleReconnect = () => {
    if (terminalInstance.current) {
      terminalInstance.current.dispose();
      terminalInstance.current = null;
    }
    connectTerminal();
  };

  return (
    <div 
      className="flex flex-col h-[calc(100vh-180px)] w-full border border-[#26293a] rounded-lg overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: currentTheme.background }}
    >
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

        <div className="flex items-center gap-3">
          {/* Theme Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">主题:</span>
            <select
              value={selectedThemeId}
              onChange={(e) => setSelectedThemeId(e.target.value)}
              className="bg-[#222436] border border-[#2b2d42] text-xs text-gray-200 rounded px-2 py-0.5 outline-none cursor-pointer focus:border-orange-500 transition-colors"
            >
              {TERMINAL_THEMES.map((theme) => (
                <option key={theme.id} value={theme.id} className="bg-[#141622]">
                  {theme.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleReconnect}
            className="p-1 px-2 rounded bg-[#222436] hover:bg-[#2c2f4a] text-gray-400 hover:text-white transition duration-150 flex items-center gap-1 text-[11px]"
            title="Restart Terminal Session"
          >
            <RefreshCw size={12} className={status === "connecting" ? "animate-spin" : ""} />
            <span>重连终端</span>
          </button>
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        className="flex-1 p-3 relative overflow-hidden transition-colors duration-300"
        style={{ backgroundColor: currentTheme.background }}
      >
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
