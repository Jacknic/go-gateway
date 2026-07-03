import React, { useState } from "react";
import { Plus, Server, Terminal, Key, ShieldAlert, Trash2, Wifi, WifiOff, Globe, Loader2 } from "lucide-react";
import { Workspace } from "../types";

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  onSelectWorkspace: (w: Workspace) => void;
  onToggleConnect: (id: string) => void;
  onAddWorkspace: (w: any) => void;
  onDeleteWorkspace: (id: string) => void;
}

export default function WorkspaceSelector({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
  onToggleConnect,
  onAddWorkspace,
  onDeleteWorkspace,
}: WorkspaceSelectorProps) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("ubuntu");
  const [port, setPort] = useState(22);
  const [authMethod, setAuthMethod] = useState<'password' | 'ssh_key'>("ssh_key");
  const [remotePath, setRemotePath] = useState("/home/ubuntu/project-api");
  const [localPath, setLocalPath] = useState("/Users/jack/workspace/project-api");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !host || !user) return;
    onAddWorkspace({
      name,
      host,
      user,
      port,
      authMethod,
      remotePath,
      localPath,
    });
    setName("");
    setHost("");
    setUser("ubuntu");
    setPort(22);
    setAuthMethod("ssh_key");
    setShowModal(false);
  };

  return (
    <div id="workspace-sidebar" className="w-80 bg-[#141622] border-r border-[#26293a] flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-[#26293a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-gradient-to-tr from-[#f97316] to-[#a855f7] flex items-center justify-center font-bold text-white text-sm shadow-md">
            JB
          </div>
          <div>
            <h1 className="font-semibold text-white tracking-tight text-sm">JetBrains Gateway</h1>
            <p className="text-[10px] text-gray-400 font-mono">Go Low-Latency Agent</p>
          </div>
        </div>
        <button
          id="btn-add-workspace"
          onClick={() => setShowModal(true)}
          className="p-1.5 rounded bg-[#26293a] text-gray-300 hover:text-white hover:bg-[#343850] transition-colors"
          title="Add Workspace"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Workspace List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-2 block mb-1">
          Remote Workspaces ({workspaces.length})
        </span>

        {workspaces.map((ws) => {
          const isActive = activeWorkspace?.id === ws.id;
          return (
            <div
              id={`workspace-card-${ws.id}`}
              key={ws.id}
              onClick={() => onSelectWorkspace(ws)}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer group ${
                isActive
                  ? "bg-[#1e2235] border-[#f97316]/50 text-white shadow-sm"
                  : "bg-[#181a28] border-[#202334] text-gray-300 hover:bg-[#1c1e2e]"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded ${
                      ws.status === "connected"
                        ? "bg-green-500/10 text-green-400"
                        : ws.status === "connecting"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-gray-500/10 text-gray-400"
                    }`}
                  >
                    <Server size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium text-xs text-white group-hover:text-[#f97316] transition-colors">
                      {ws.name}
                    </h3>
                    <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                      {ws.user}@{ws.host.split(":")[0]}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ws.status === "connected"
                        ? "bg-green-500 animate-pulse"
                        : ws.status === "connecting"
                        ? "bg-amber-500 animate-spin"
                        : "bg-gray-600"
                    }`}
                  />
                </div>
              </div>

              {/* Specs block */}
              <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-gray-400 border-t border-[#26293a]/40 pt-2.5">
                <div className="flex items-center gap-1">
                  <Globe size={10} className="text-gray-500" />
                  <span className="truncate">Port: {ws.port}</span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {ws.status === "connected" ? (
                    <>
                      <Wifi size={10} className="text-green-400" />
                      <span className="text-green-400 font-mono">{ws.latencyMs}ms</span>
                    </>
                  ) : (
                    <>
                      <WifiOff size={10} className="text-gray-500" />
                      <span className="font-mono">Offline</span>
                    </>
                  )}
                </div>
              </div>

              {/* Action buttons inside card */}
              <div className="mt-2.5 flex items-center justify-between border-t border-[#26293a]/30 pt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button
                  id={`btn-connect-${ws.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleConnect(ws.id);
                  }}
                  disabled={ws.status === "connecting"}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ${
                    ws.status === "connected"
                      ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      : ws.status === "connecting"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-[#f97316]/10 text-[#f97316] hover:bg-[#f97316]/20"
                  }`}
                >
                  {ws.status === "connecting" ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      连接中...
                    </>
                  ) : ws.status === "connected" ? (
                    "断开连接"
                  ) : (
                    "启动 Gateway"
                  )}
                </button>
                <button
                  id={`btn-delete-${ws.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("确定要删除该开发工作空间吗？")) {
                      onDeleteWorkspace(ws.id);
                    }
                  }}
                  className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove Connection"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}

        {workspaces.length === 0 && (
          <div className="text-center py-8 px-4 border border-dashed border-[#26293a] rounded-lg mt-4">
            <Server size={24} className="mx-auto text-gray-600 mb-2" />
            <p className="text-xs text-gray-400 font-medium">无工作空间</p>
            <p className="text-[10px] text-gray-500 mt-1">添加您的远程服务器来部署 Go 代理</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-3 px-3 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white text-xs font-medium rounded transition-colors"
            >
              配置新服务器
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-[#0f111a] border-t border-[#26293a] text-[10px] text-gray-500 font-mono">
        <div className="flex items-center justify-between">
          <span>Client: Go-Gateway v1.2</span>
          <span className="text-green-500 flex items-center gap-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            TCP Loopback OK
          </span>
        </div>
      </div>

      {/* Add Workspace Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#141622] border border-[#26293a] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-[#26293a] flex items-center justify-between bg-[#11131c]">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-[#f97316]" />
                <h2 className="text-sm font-semibold text-white">配置远程开发工作空间</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  工作空间名称
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. AWS新加坡开发节点"
                  className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316] placeholder-gray-500"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    SSH 主机地址 (IP/Domain)
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="13.212.45.101"
                    className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316] placeholder-gray-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    SSH 端口
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    SSH 用户名
                  </label>
                  <input
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-400 mb-1">
                    身份认证方式
                  </label>
                  <select
                    value={authMethod}
                    onChange={(e) => setAuthMethod(e.target.value as any)}
                    className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316]"
                  >
                    <option value="ssh_key">SSH 密钥对 (id_rsa)</option>
                    <option value="password">账户密码 (SSH Password)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  本地目录路径 (Local Root Path)
                </label>
                <input
                  type="text"
                  value={localPath}
                  onChange={(e) => setLocalPath(e.target.value)}
                  className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316] font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">
                  远程目录路径 (Remote Server Root Path)
                </label>
                <input
                  type="text"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316] font-mono"
                  required
                />
              </div>

              <div className="bg-[#f97316]/5 border border-[#f97316]/10 rounded-lg p-2.5 flex gap-2">
                <Key size={14} className="text-[#f97316] shrink-0 mt-0.5" />
                <p className="text-[10px] text-gray-400 leading-normal">
                  Go 代理将自动挂载在远程目录中。当启动 Gateway 连接时，将启用 **fswatch** 自动检测本地改动，并利用 Go SHA256 校验执行增量合并传输，减少 95% 冗余 IO。
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#26293a]/50">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 bg-[#26293a] text-gray-300 hover:text-white hover:bg-[#343850] rounded text-xs transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#f97316] hover:bg-[#ea580c] text-white rounded text-xs font-medium transition-colors"
                >
                  保存工作空间
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
