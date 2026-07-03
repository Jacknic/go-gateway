import React, { useState } from "react";
import { Folder, File, RefreshCw, AlertTriangle, CheckCircle, Flame, Eye, Edit3, ArrowRight, Server, Laptop, ChevronRight, ChevronDown } from "lucide-react";
import { FileItem, LogEntry, Workspace } from "../types";

interface FileSyncerProps {
  workspace: Workspace;
  localFiles: FileItem[];
  remoteFiles: FileItem[];
  logs: LogEntry[];
  isSyncing: boolean;
  onTriggerSync: () => void;
  onModifyFile: (path: string) => void;
}

export default function FileSyncer({
  workspace,
  localFiles,
  remoteFiles,
  logs,
  isSyncing,
  onTriggerSync,
  onModifyFile,
}: FileSyncerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "src": true,
    "go-gateway": true,
  });

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const formatSize = (bytes?: number) => {
    if (bytes === undefined) return "";
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Recursively render directory trees
  const renderTree = (items: FileItem[], isLocal: boolean, depth = 0) => {
    return items.map((item) => {
      const hasChildren = item.isDirectory && item.children && item.children.length > 0;
      const isExpanded = expandedNodes[item.path];
      
      return (
        <div key={item.path} style={{ paddingLeft: `${depth * 12}px` }} className="text-xs">
          <div className="flex items-center justify-between py-1 px-2 hover:bg-[#202234] rounded transition-colors group select-none">
            <div className="flex items-center gap-2 overflow-hidden">
              {item.isDirectory ? (
                <button 
                  id={`btn-expand-${isLocal ? 'local' : 'remote'}-${item.path}`}
                  onClick={() => toggleNode(item.path)} 
                  className="p-0.5 text-gray-500 hover:text-gray-300"
                >
                  {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}

              {item.isDirectory ? (
                <Folder size={13} className="text-sky-400 shrink-0" />
              ) : (
                <File size={13} className="text-gray-400 shrink-0" />
              )}

              <span className={`font-mono text-[11px] truncate ${item.isDirectory ? "text-gray-200" : "text-gray-300"}`}>
                {item.name}
              </span>
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px] shrink-0 text-gray-500">
              {!item.isDirectory && <span>{formatSize(item.size)}</span>}
              
              {isLocal && item.status && !item.isDirectory && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${
                    item.status === "synced"
                      ? "text-green-400 bg-green-500/5 border-green-500/10"
                      : item.status === "modified"
                      ? "text-amber-400 bg-amber-500/5 border-amber-500/15"
                      : "text-blue-400 bg-blue-500/5 border-blue-500/10"
                  }`}
                >
                  {item.status === "synced" && "已同步"}
                  {item.status === "modified" && "已修改"}
                  {item.status === "untracked" && "未跟踪"}
                </span>
              )}

              {/* Edit simulation trigger for local files */}
              {isLocal && !item.isDirectory && item.name === "App.tsx" && (
                <button
                  id={`btn-simulate-edit-${item.path}`}
                  onClick={() => onModifyFile(item.path)}
                  className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 bg-[#f97316]/10 text-[#f97316] hover:bg-[#f97316]/20 border border-[#f97316]/20 rounded font-sans transition-all text-[9px]"
                  title="Simulate developer code changes"
                >
                  模拟修改
                </button>
              )}
            </div>
          </div>

          {item.isDirectory && isExpanded && item.children && (
            <div className="border-l border-gray-800 ml-3.5 pl-1.5 my-0.5">
              {renderTree(item.children, isLocal, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const getLogColor = (level: string) => {
    if (level === "success") return "text-green-400";
    if (level === "warn") return "text-amber-400";
    if (level === "error") return "text-red-400";
    return "text-sky-400";
  };

  const getLogSymbol = (level: string) => {
    if (level === "success") return "✔";
    if (level === "warn") return "⚠";
    if (level === "error") return "✘";
    return "ℹ";
  };

  return (
    <div className="space-y-4">
      {/* Sync Control Header */}
      <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#f97316]/15 text-[#f97316] rounded-lg">
            <Flame className="animate-pulse" size={18} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white">低延迟增量文件同步服务 (File Watcher + Delta Sync)</h3>
            <p className="text-[10px] text-gray-400 leading-normal max-w-xl mt-0.5">
              点击下方“模拟修改”按钮编辑本地 <code>App.tsx</code> 代码，即可唤醒 Go 
              <code> fswatch</code> 进程。Go 校验并收集变更文件的 SHA-256 哈希，对比差异，执行高速增量网络传输。
            </p>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button
            id="btn-manual-sync"
            onClick={onTriggerSync}
            disabled={isSyncing || workspace.status !== "connected"}
            className="px-4 py-1.5 bg-[#f97316] hover:bg-[#ea580c] disabled:bg-gray-700 disabled:text-gray-400 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "文件同步中..." : "立即增量同步"}
          </button>
        </div>
      </div>

      {/* Explorer Trees Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Local Drive */}
        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col h-96">
          <div className="flex items-center justify-between border-b border-[#26293a]/60 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <Laptop size={14} className="text-[#818cf8]" />
              <h4 className="text-xs font-semibold text-white">本地开发目录 (Client Local)</h4>
            </div>
            <span className="text-[9px] font-mono text-gray-500 font-semibold truncate max-w-xs">{workspace.localPath}</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {renderTree(localFiles, true)}
          </div>
        </div>

        {/* Remote Server Drive */}
        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col h-96">
          <div className="flex items-center justify-between border-b border-[#26293a]/60 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <Server size={14} className="text-[#f97316]" />
              <h4 className="text-xs font-semibold text-white">远程同步开发机 (Target Remote Server)</h4>
            </div>
            <span className="text-[9px] font-mono text-gray-500 font-semibold truncate max-w-xs">{workspace.remotePath}</span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {workspace.status === "connected" ? (
              remoteFiles.length > 0 ? (
                renderTree(remoteFiles, false)
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                  <AlertTriangle size={20} className="text-amber-500" />
                  <p className="text-[10px] text-center px-6 leading-normal">
                    远程目录为空或尚未完成初次握手签名。点击上方的“立即增量同步”执行首轮全量 delta 镜像。
                  </p>
                </div>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                <AlertTriangle size={20} className="text-gray-600" />
                <p className="text-[10px] text-center px-6 leading-normal">
                  工作空间未连接。请先启动开发节点的 SSH Gateway 隧道。
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sync Execution Logs Console */}
      <div className="bg-[#11131c] border border-[#26293a] rounded-lg p-4">
        <div className="flex items-center justify-between border-b border-[#26293a]/50 pb-2 mb-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
            Go Syncer / fswatch 实时输出终端 (Agent Terminal stdout)
          </span>
          <span className="text-[9px] font-mono text-green-400 flex items-center gap-1">
            <span className="w-1 h-1 bg-green-500 rounded-full animate-ping" />
            LISTEN STATE
          </span>
        </div>

        <div className="h-32 overflow-y-auto font-mono text-[10px] space-y-1.5 p-2 bg-[#090a10] rounded border border-gray-900/60 selection:bg-[#f97316]/20">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 select-text leading-normal">
              <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`font-semibold shrink-0 uppercase select-none text-[8px] px-1 rounded ${
                log.source === "sync" ? "bg-amber-500/10 text-amber-400" :
                log.source === "ssh" ? "bg-green-500/10 text-green-400" :
                log.source === "forward" ? "bg-indigo-500/10 text-indigo-400" :
                "bg-gray-500/10 text-gray-400"
              }`}>
                {log.source}
              </span>
              <span className={`${getLogColor(log.level)} font-bold shrink-0 select-none`}>
                {getLogSymbol(log.level)}
              </span>
              <span className="text-gray-300 break-all">{log.message}</span>
            </div>
          ))}

          {logs.length === 0 && (
            <p className="text-gray-600 italic">等待 Go 进程事件或操作动作触发...</p>
          )}
        </div>
      </div>
    </div>
  );
}
