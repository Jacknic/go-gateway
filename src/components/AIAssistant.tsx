import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, Sparkles, Loader2, ArrowRight, HelpCircle, Terminal, RefreshCw } from "lucide-react";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
}

interface AIAssistantProps {
  selectedFile: string;
}

const QUICK_PROMPTS = [
  {
    title: "解析 sync.go 的增量同步算法",
    prompt: "请详细解析 sync.go 中的文件签名（FileSignature）和增量差异对比（Sync() 方法）的底层逻辑。它是如何检测文件变化，并避免全量文件传输的？"
  },
  {
    title: "如何优化 TCP 转发吞吐量？",
    prompt: "在 forward.go 的 handleConnection() 中，我们使用的是默认的 io.Copy。如果面对高并发或大吞吐量开发场景，我们可以如何在 Go 层面做 TCP 窗口优化或缓冲池 (Byte Pool) 扩展来进一步减小包延迟？"
  },
  {
    title: "Go SSH 如何加载私钥对认证？",
    prompt: "请基于 Go 标准库和 golang.org/x/crypto/ssh 包，给出一个加载加密 ~/.ssh/id_rsa 私钥并用其代替密码进行 SSH 握手验证的完整代码示例。"
  },
  {
    title: "基于 fsnotify 实现真正的 watcher",
    prompt: "在 sync.go 中，StartWatching 方法目前是空循环。请写一个基于 github.com/fsnotify/fsnotify 包实现文件变更监听、去抖过滤（Debounce）并触发增量 Sync 的 Go 代码扩展。"
  }
];

export default function AIAssistant({ selectedFile }: AIAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "init",
      sender: "ai",
      text: "你好！我是您的 **Go 开发网关 AI 架构优化师**。我精通 Go 高效网络编程和文件同步算法，已通读当前 `/go-gateway` 目录下的所有核心源码。\n\n我可以帮您分析多线程 TCP 并发转发、SHA-256 签名差异合并，或提供如何利用 Gzip 压缩、Brotli 算法、或 Golang Byte Pool 优化远程开发延迟的实战代码。请问有什么我可以帮您的？"
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMsgId = "msg-" + Date.now();
    const newUserMessage: Message = {
      id: userMsgId,
      sender: "user",
      text: textToSend
    };

    setMessages(prev => [...prev, newUserMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          chatHistory: messages.slice(1).map(m => ({ sender: m.sender, text: m.text })),
          selectedFile: selectedFile
        })
      });

      const data = await response.json();
      
      setMessages(prev => [
        ...prev,
        {
          id: "ai-" + Date.now(),
          sender: "ai",
          text: data.reply || data.error || "收到消息但没有返回回复，请检查 API 配置。"
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: "err-" + Date.now(),
          sender: "ai",
          text: "❌ 无法连接到 Express 服务代理。请确认后端服务器正常，且 `GEMINI_API_KEY` 已在 Secrets 面板设置。"
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Quick formatter to show inline markdown-style code blocks simply
  const renderMessageText = (text: string) => {
    const lines = text.split("\n");
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          // Close block
          elements.push(
            <div key={`code-${index}`} className="my-2 p-3 bg-[#0c0d15] rounded border border-[#2b2d42] font-mono text-xs overflow-x-auto text-[#a9b7c6] select-text">
              <pre><code>{codeBuffer.join("\n")}</code></pre>
            </div>
          );
          codeBuffer = [];
          inCodeBlock = false;
        } else {
          // Open block
          inCodeBlock = true;
        }
      } else if (inCodeBlock) {
        codeBuffer.push(line);
      } else {
        // Simple bold and inline code styling
        let formattedLine: React.ReactNode = line;
        
        // Match `code`
        const inlineCodeRegex = /`([^`]+)`/g;
        // Match **bold**
        const boldRegex = /\*\*([^*]+)\*\*/g;

        // Process line text mapping to highlight bold and inline code
        if (line.includes("**") || line.includes("`")) {
          const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
          formattedLine = parts.map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith("`") && part.endsWith("`")) {
              return <code key={i} className="bg-[#1a1c2a] text-amber-300 font-mono px-1 py-0.5 rounded text-[11px] border border-[#26283b]">{part.slice(1, -1)}</code>;
            }
            return part;
          });
        }

        elements.push(
          <p key={`p-${index}`} className="text-xs text-gray-300 leading-relaxed mb-1.5 break-words">
            {formattedLine}
          </p>
        );
      }
    });

    return <div className="space-y-1">{elements}</div>;
  };

  return (
    <div className="bg-[#181a28] border border-[#26293a] rounded-xl flex flex-col h-[calc(100vh-140px)] overflow-hidden">
      {/* AI Header */}
      <div className="p-4 border-b border-[#26293a] bg-[#12141e] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#f97316]/10 text-[#f97316] flex items-center justify-center">
            <Sparkles size={14} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-white">Go Gateway 源码优化助手</h3>
            <p className="text-[9px] text-gray-400 font-mono">Gemini 3.5 Pro Engine • Full Context</p>
          </div>
        </div>

        <span className="text-[9px] font-mono bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20">
          Agent Copilot Active
        </span>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg p-3.5 ${
                m.sender === "user"
                  ? "bg-[#f97316] text-white"
                  : "bg-[#141622] border border-[#26293a] text-gray-300 shadow-inner"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5 text-[9px] text-gray-400 font-mono uppercase tracking-wider select-none">
                <Terminal size={9} />
                <span>{m.sender === "user" ? "Developer Prompt" : "Gateway Architect AI"}</span>
              </div>
              {renderMessageText(m.text)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#141622] border border-[#26293a] rounded-lg p-4 max-w-[85%] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[#f97316]" />
              <span className="text-xs text-gray-400 font-mono">
                分析 Go 源码依赖、优化底层网络套接字中...
              </span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      {messages.length === 1 && !loading && (
        <div className="px-4 pb-3 border-t border-[#26293a]/30 pt-3 bg-[#11131c]">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-2 flex items-center gap-1">
            <HelpCircle size={10} />
            推荐优化探究主题:
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                id={`btn-quick-prompt-${i}`}
                key={i}
                onClick={() => handleSend(qp.prompt)}
                className="text-left p-2 rounded bg-[#1e2030] hover:bg-[#282b3d] text-gray-300 hover:text-white border border-[#2c2f44] text-[11px] leading-snug transition-all flex items-start gap-1.5 group"
              >
                <ArrowRight size={10} className="text-[#f97316] shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-transform" />
                <span>{qp.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chat Input */}
      <div className="p-3 bg-[#11131c] border-t border-[#26293a]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend(input)}
            disabled={loading}
            placeholder={
              selectedFile 
                ? `对当前查看的文件 '${selectedFile}' 提出优化/定制疑问...` 
                : "输入您对 Go 开发网关的优化、并发或编译疑问..."
            }
            className="flex-1 bg-[#1e2030] border border-[#2c2f44] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#f97316] placeholder-gray-500"
          />
          <button
            id="btn-send-chat"
            onClick={() => handleSend(input)}
            disabled={loading || !input.trim()}
            className="p-2 bg-[#f97316] hover:bg-[#ea580c] disabled:bg-gray-700 disabled:text-gray-400 text-white rounded transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
