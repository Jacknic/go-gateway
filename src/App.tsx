import React, { useState, useEffect } from "react";
import { Code, Terminal, Layers, RefreshCw, MessageSquare, Server, Cpu, Activity, Play, Wifi, ArrowRight } from "lucide-react";
import WorkspaceSelector from "./components/WorkspaceSelector";
import CodeViewer from "./components/CodeViewer";
import PortForwarder from "./components/PortForwarder";
import FileSyncer from "./components/FileSyncer";
import AIAssistant from "./components/AIAssistant";
import { Workspace, PortMapping, FileItem, LogEntry, GoSourceFile } from "./types";

export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [portMappings, setPortMappings] = useState<PortMapping[]>([]);
  const [localFiles, setLocalFiles] = useState<FileItem[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>([]);
  const [syncLogs, setSyncLogs] = useState<LogEntry[]>([]);
  const [goFiles, setGoFiles] = useState<GoSourceFile[]>([]);
  const [activeTab, setActiveTab] = useState<"code" | "forward" | "sync" | "ai">("code");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Load initial workspaces and Go source files
  useEffect(() => {
    fetchWorkspaces();
    fetchGoSourceFiles();
  }, []);

  // Poll for port mapping bandwidth telemetry if selected workspace is connected
  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.status !== "connected") return;

    // Fast interval polling to update the bandwidth transfer speed numbers in real time
    const interval = setInterval(() => {
      fetchPortMappings(activeWorkspace.id);
    }, 2500);

    return () => clearInterval(interval);
  }, [activeWorkspace?.id, activeWorkspace?.status]);

  // Load workspace-specific resources upon switching
  useEffect(() => {
    if (activeWorkspace) {
      fetchPortMappings(activeWorkspace.id);
      fetchSyncData(activeWorkspace.id);
    } else {
      setPortMappings([]);
      setLocalFiles([]);
      setRemoteFiles([]);
      setSyncLogs([]);
    }
  }, [activeWorkspace?.id]);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/workspaces");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setWorkspaces(data);
      if (data.length > 0 && !activeWorkspace) {
        setActiveWorkspace(data[0]);
      }
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      console.warn("Failed to load workspaces (Gateway server might be restarting/offline):", err);
    }
  };

  const fetchGoSourceFiles = async () => {
    try {
      const res = await fetch("/api/go-files");
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setGoFiles(data);
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      console.warn("Failed to load Go files (Gateway server might be restarting/offline):", err);
    }
  };

  const fetchPortMappings = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ports`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setPortMappings(data);
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      console.warn("Failed to fetch ports (Gateway server might be restarting/offline):", err);
    }
  };

  const fetchSyncData = async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/sync`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setLocalFiles(data.local);
      setRemoteFiles(data.remote);
      setSyncLogs(data.logs);
      setIsOffline(false);
    } catch (err) {
      setIsOffline(true);
      console.warn("Failed to fetch sync resources (Gateway server might be restarting/offline):", err);
    }
  };

  const handleAddWorkspace = async (workspacePayload: any) => {
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspacePayload),
      });
      const newWs = await res.json();
      setWorkspaces(prev => [...prev, newWs]);
      setActiveWorkspace(newWs);
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to add workspace:", err);
    }
  };

  const handleToggleConnect = async (id: string) => {
    // Optimistic UI state transition
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, status: w.status === "connected" ? "disconnected" : "connecting" } : w))
    );
    if (activeWorkspace?.id === id) {
      setActiveWorkspace((prev) =>
        prev ? { ...prev, status: prev.status === "connected" ? "disconnected" : "connecting" } : null
      );
    }

    try {
      const res = await fetch(`/api/workspaces/${id}/toggle-connect`, { method: "POST" });
      const updated = await res.json();
      
      // Wait slightly if connecting to show a fluid handshake transition
      const delay = updated.status === "connected" ? 1500 : 0;
      setTimeout(() => {
        setWorkspaces((prev) => prev.map((w) => (w.id === id ? updated : w)));
        if (activeWorkspace?.id === id) {
          setActiveWorkspace(updated);
        }
      }, delay);
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to toggle workspace connection:", err);
      fetchWorkspaces();
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    try {
      await fetch(`/api/workspaces/${id}`, { method: "DELETE" });
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      if (activeWorkspace?.id === id) {
        setActiveWorkspace(null);
      }
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to delete workspace:", err);
    }
  };

  const handleAddPortMapping = async (name: string, localPort: number, remotePort: number, reverse?: boolean) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/ports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, localPort, remotePort, reverse }),
      });
      const newMapping = await res.json();
      setPortMappings((prev) => [...prev, newMapping]);
      fetchSyncData(activeWorkspace.id); // Load map creation logs
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to create port mapping:", err);
    }
  };

  const handleTogglePortMapping = async (id: string) => {
    try {
      const res = await fetch(`/api/ports/${id}/toggle`, { method: "POST" });
      const updated = await res.json();
      setPortMappings((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (activeWorkspace) {
        fetchSyncData(activeWorkspace.id); // Reload console logs
      }
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to toggle port mapping:", err);
    }
  };

  const handleTriggerSync = async () => {
    if (!activeWorkspace) return;
    setIsSyncing(true);

    try {
      await fetch(`/api/workspaces/${activeWorkspace.id}/sync`, { method: "POST" });
      
      // Multi-step polling effect to render simulated step changes cleanly
      setTimeout(() => {
        fetchSyncData(activeWorkspace.id);
        setIsSyncing(false);
      }, 1800);
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to run sync routine:", err);
      setIsSyncing(false);
    }
  };

  const handleModifyLocalFile = async (filePath: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/files/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalFiles(data.files);
        fetchSyncData(activeWorkspace.id); // Update logs
      }
      setIsOffline(false);
    } catch (err) {
      console.warn("Failed to simulate edit:", err);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f111a] font-sans text-gray-300">
      {/* Sidebar: Workspaces */}
      <WorkspaceSelector
        workspaces={workspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        onToggleConnect={handleToggleConnect}
        onAddWorkspace={handleAddWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
      />

      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0a0c14]">
        {/* Workspace Connection Header */}
        {activeWorkspace ? (
          <div className="px-6 py-4 bg-[#141622] border-b border-[#26293a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white tracking-tight">
                  {activeWorkspace.name}
                </h2>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    activeWorkspace.status === "connected"
                      ? "bg-green-500/10 text-green-400 border border-green-500/20"
                      : activeWorkspace.status === "connecting"
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                      : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                  }`}
                >
                  {activeWorkspace.status === "connected" && "已连接"}
                  {activeWorkspace.status === "connecting" && "正在握手..."}
                  {activeWorkspace.status === "disconnected" && "已断开"}
                </span>
                {isOffline && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                    <span>服务重启/重连中...</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400 font-mono mt-1">
                主机隧道: {activeWorkspace.user}@{activeWorkspace.host} • 挂载:{" "}
                <span className="text-[#f97316]">{activeWorkspace.remotePath}</span>
              </p>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center bg-[#1e2030] border border-[#2b2d42] p-0.5 rounded-lg text-xs font-medium">
              <button
                id="tab-code"
                onClick={() => setActiveTab("code")}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  activeTab === "code"
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Code size={13} />
                <span>Go 源码浏览器</span>
              </button>
              <button
                id="tab-forward"
                onClick={() => setActiveTab("forward")}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  activeTab === "forward"
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <Layers size={13} />
                <span>本地端口映射</span>
              </button>
              <button
                id="tab-sync"
                onClick={() => setActiveTab("sync")}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  activeTab === "sync"
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <RefreshCw size={13} />
                <span>文件同步视觉</span>
              </button>
              <button
                id="tab-ai"
                onClick={() => setActiveTab("ai")}
                className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                  activeTab === "ai"
                    ? "bg-[#f97316] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <MessageSquare size={13} />
                <span>架构优化 AI</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 bg-[#141622] border-b border-[#26293a] flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-gray-400">请选择或添加开发工作空间</h2>
          </div>
        )}

        {/* Tab Panel Render */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0a0c14]">
          {activeWorkspace ? (
            <>
              {activeTab === "code" && <CodeViewer goFiles={goFiles} />}

              {activeTab === "forward" && (
                <PortForwarder
                  workspace={activeWorkspace}
                  portMappings={portMappings}
                  onAddPortMapping={handleAddPortMapping}
                  onTogglePortMapping={handleTogglePortMapping}
                />
              )}

              {activeTab === "sync" && (
                <FileSyncer
                  workspace={activeWorkspace}
                  localFiles={localFiles}
                  remoteFiles={remoteFiles}
                  logs={syncLogs}
                  isSyncing={isSyncing}
                  onTriggerSync={handleTriggerSync}
                  onModifyFile={handleModifyLocalFile}
                />
              )}

              {activeTab === "ai" && <AIAssistant selectedFile="" />}
            </>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center select-none">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#f97316] to-[#a855f7] flex items-center justify-center text-white text-3xl font-extrabold mb-4 shadow-xl">
                G
              </div>
              <h3 className="text-lg font-bold text-white">欢迎使用 Go Remote Dev Gateway</h3>
              <p className="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed">
                这是一个类 JetBrains Gateway 的极低延迟开发辅助系统。您可以在左侧栏“配置新服务器”
                或是启动内置的演示集群，体验 Go 代理强大的 TCP 端口包复制与 SHA-256 增量 delta 文件镜像！
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                <span>通过左侧</span>
                <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-semibold text-[11px]">启动 Gateway</span>
                <span>键开启一键开发通道</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
