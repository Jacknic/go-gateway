import React, { useState, useEffect } from "react";
import { Play, Square, Plus, RefreshCw, Layers, ArrowRight, Activity, Globe, Wifi } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PortMapping, Workspace } from "../types";

interface PortForwarderProps {
  workspace: Workspace;
  portMappings: PortMapping[];
  onAddPortMapping: (name: string, local: number, remote: number) => void;
  onTogglePortMapping: (id: string) => void;
}

// Generate starting data for our real-time throughput chart
const generateChartData = () => {
  const data = [];
  for (let i = 12; i >= 0; i--) {
    data.push({
      time: `${i * 2}s ago`,
      download: Math.floor(Math.random() * 40) + 10,
      upload: Math.floor(Math.random() * 15) + 2,
    });
  }
  return data;
};

export default function PortForwarder({
  workspace,
  portMappings,
  onAddPortMapping,
  onTogglePortMapping,
}: PortForwarderProps) {
  const [name, setName] = useState("");
  const [localPort, setLocalPort] = useState<number | "">("");
  const [remotePort, setRemotePort] = useState<number | "">("");
  const [chartData, setChartData] = useState(generateChartData());

  const activeMappings = portMappings.filter(pm => pm.active);

  // Keep throughput chart rolling with simulated data fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setChartData((prev) => {
        const next = [...prev.slice(1)];
        // Calculate speed based on number of active port mappings
        const baseDownload = activeMappings.length * 20;
        const downloadSpeed = baseDownload > 0 ? Math.floor(Math.random() * 30) + baseDownload : 0;
        const uploadSpeed = baseDownload > 0 ? Math.floor(Math.random() * 10) + Math.floor(baseDownload / 4) : 0;

        next.push({
          time: "0s",
          download: downloadSpeed,
          upload: uploadSpeed,
        });

        // Re-align timeline labels
        return next.map((item, idx) => ({
          ...item,
          time: idx === next.length - 1 ? "now" : `${(next.length - 1 - idx) * 2}s ago`,
        }));
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [activeMappings.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localPort || !remotePort) return;
    onAddPortMapping(
      name || `端口 ${localPort} 映射`,
      Number(localPort),
      Number(remotePort)
    );
    setName("");
    setLocalPort("");
    setRemotePort("");
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const totalSent = portMappings.reduce((acc, p) => acc + p.metrics.bytesSent, 0);
  const totalReceived = portMappings.reduce((acc, p) => acc + p.metrics.bytesReceived, 0);

  return (
    <div className="space-y-4">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider block">
            活动端口隧道
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-white font-mono">
              {activeMappings.length}
            </span>
            <span className="text-xs text-gray-400">/ {portMappings.length} 已配置</span>
          </div>
          <span className="text-[10px] text-green-400 font-mono mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            转发服务就绪
          </span>
        </div>

        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider block">
            TCP 双向总发送 (Upload)
          </span>
          <span className="text-xl font-bold text-white font-mono mt-2 truncate">
            {formatBytes(totalSent)}
          </span>
          <span className="text-[10px] text-gray-400 font-mono mt-1">本地 ➔ 远程开发机</span>
        </div>

        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider block">
            TCP 双向总接收 (Download)
          </span>
          <span className="text-xl font-bold text-[#f97316] font-mono mt-2 truncate">
            {formatBytes(totalReceived)}
          </span>
          <span className="text-[10px] text-gray-400 font-mono mt-1">远程开发机 ➔ 本地</span>
        </div>

        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider block">
            工作空间平均延迟
          </span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-green-400 font-mono">
              {workspace.status === "connected" ? `${workspace.latencyMs} ms` : "---"}
            </span>
          </div>
          <span className="text-[10px] text-gray-400 font-mono mt-1">
            {workspace.status === "connected" ? "网络品质：优秀 (低延迟)" : "工作空间离线"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Add Port Mapping & Active Ports Panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Configure new map */}
          <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4">
            <h3 className="text-xs font-semibold text-white mb-3 flex items-center gap-1.5">
              <Globe size={14} className="text-[#f97316]" />
              映射本地端口到远程服务器 (SSH 隧道端口转发)
            </h3>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">服务/映射名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Spring/Vite Dev"
                  className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316] placeholder-gray-600"
                />
              </div>
              <div>
                <label className="block text-[10px] text-gray-400 mb-1">本地监听端口 (Local)</label>
                <input
                  type="number"
                  value={localPort}
                  onChange={(e) => setLocalPort(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 8080"
                  className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316]"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 mb-1">远程目标端口 (Remote)</label>
                  <input
                    type="number"
                    value={remotePort}
                    onChange={(e) => setRemotePort(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 8080"
                    className="w-full bg-[#1e2030] border border-[#2c2f44] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>
              </div>
              <div>
                <button
                  type="submit"
                  disabled={workspace.status !== "connected"}
                  className="w-full px-3 py-1.5 bg-[#f97316] hover:bg-[#ea580c] disabled:bg-gray-700 disabled:text-gray-400 text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1 h-[34px]"
                >
                  <Plus size={14} />
                  配置映射通道
                </button>
              </div>
            </form>
            {workspace.status !== "connected" && (
              <p className="text-[10px] text-red-400/80 mt-2">
                ⚠️ 注意：远程 Gateway 当前处于断开状态。请在左侧栏中“启动连接”以激活端口转发。
              </p>
            )}
          </div>

          {/* Mappings List */}
          <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4">
            <h3 className="text-xs font-semibold text-white mb-3">活动监听端口状态</h3>
            <div className="space-y-2.5">
              {portMappings.map((pm) => (
                <div
                  id={`port-card-${pm.id}`}
                  key={pm.id}
                  className={`p-3 rounded border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                    pm.active
                      ? "bg-[#1e2235]/40 border-[#f97316]/20"
                      : "bg-[#131522] border-[#222435] opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        pm.active ? "bg-[#f97316]/10 text-[#f97316]" : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      <Layers size={15} />
                    </div>
                    <div>
                      <h4 className="font-medium text-xs text-white">{pm.name}</h4>
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono mt-0.5">
                        <span className="text-amber-400">127.0.0.1:{pm.localPort}</span>
                        <ArrowRight size={10} className="text-gray-500" />
                        <span className="text-indigo-400">remote:{pm.remotePort}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right font-mono text-[10px] text-gray-400">
                    <div>
                      <span className="text-gray-500 block text-[9px] uppercase">连接数</span>
                      <span className="text-white font-semibold">{pm.metrics.connectionsCount} Active</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[9px] uppercase">流量 (S/R)</span>
                      <span>
                        {formatBytes(pm.metrics.bytesSent)} / {formatBytes(pm.metrics.bytesReceived)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[9px] uppercase">当前延迟</span>
                      <span className={pm.active ? "text-green-400" : ""}>
                        {pm.active ? `${pm.metrics.latencyMs}ms` : "---"}
                      </span>
                    </div>

                    <div className="pl-2 border-l border-[#26293a]">
                      <button
                        id={`btn-toggle-port-${pm.id}`}
                        onClick={() => onTogglePortMapping(pm.id)}
                        disabled={workspace.status !== "connected"}
                        className={`p-1.5 rounded transition-colors ${
                          pm.active
                            ? "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                            : "text-green-400 bg-green-500/10 hover:bg-green-500/20"
                        } disabled:opacity-50`}
                        title={pm.active ? "停止隧道" : "启动隧道"}
                      >
                        {pm.active ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {portMappings.length === 0 && (
                <div className="text-center py-6 text-gray-500 text-xs">
                  暂未配置任何 TCP 端口映射关系
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Traffic Chart Panel */}
        <div className="bg-[#181a28] border border-[#26293a] rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Activity size={14} className="text-[#f97316]" />
                数据流速监控 (Throughput)
              </h3>
              <span className="text-[9px] font-mono bg-[#11131c] px-2 py-0.5 text-gray-400 rounded border border-[#26293a]">
                Live 2s Interval
              </span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed mb-4">
              显示通过本地 Go <code>forward.go</code> 引擎代理的数据流速状态。Go 的高性能 <code>io.Copy</code> 会自动执行内核缓冲映射，实现零内存拷贝，大幅消除往返包重传带来的额外开销。
            </p>
          </div>

          <div className="h-44 w-full text-[10px]">
            {activeMappings.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                  <XAxis dataKey="time" stroke="#4a5568" fontSize={9} />
                  <YAxis stroke="#4a5568" fontSize={9} unit="M" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#141622", borderColor: "#2d3748" }}
                    labelStyle={{ color: "#a0aec0", fontFamily: "monospace" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="download"
                    stroke="#f97316"
                    fillOpacity={0.15}
                    fill="url(#colorDownload)"
                    name="Download (MB/s)"
                  />
                  <Area
                    type="monotone"
                    dataKey="upload"
                    stroke="#818cf8"
                    fillOpacity={0.1}
                    fill="url(#colorUpload)"
                    name="Upload (MB/s)"
                  />
                  <defs>
                    <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-[#26293a] rounded-lg text-gray-500 gap-2">
                <Wifi size={24} className="text-gray-600 animate-pulse" />
                <p className="text-[10px] text-center px-4 leading-normal">
                  暂无活动的端口转发信道。请开启上方的端口监听，图表将自动渲染流经 Go 代理的网络包。
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#26293a]/50 text-[10px] text-gray-500 font-mono space-y-1">
            <div className="flex justify-between">
              <span>Go Socket Allocations:</span>
              <span className="text-white">Low Memory footprint</span>
            </div>
            <div className="flex justify-between">
              <span>TCP Window Scaling:</span>
              <span className="text-green-400">RFC 1323 Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
