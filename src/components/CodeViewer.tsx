import React, { useState } from "react";
import { FileCode, FileText, File, Copy, Download, Check, Search, Terminal, Settings } from "lucide-react";
import { GoSourceFile } from "../types";

interface CodeViewerProps {
  goFiles: GoSourceFile[];
}

export default function CodeViewer({ goFiles }: CodeViewerProps) {
  const [activeFile, setActiveFile] = useState<string>("main.go");
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const currentFile = goFiles.find(f => f.name === activeFile) || goFiles[0];

  const handleCopy = () => {
    if (!currentFile) return;
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Extremely lightweight, robust Go syntax highlighter simulation
  // Highlights basic Go keywords, strings, types and comments for an authentic look
  const highlightGo = (code: string) => {
    if (!code) return "";
    
    // Safely escape HTML first
    let escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (currentFile?.language === "markdown") {
      // Basic markdown styling
      return escaped
        .replace(/^(#+)(.*)$/gm, '<span class="text-[#f97316] font-bold">$1$2</span>')
        .replace(/`([^`]+)`/g, '<code class="bg-[#1e2030] px-1 py-0.5 rounded text-amber-300 font-mono text-[11px]">$1</code>')
        .replace(/^\* (.*)$/gm, '<span class="text-indigo-300">• $1</span>');
    }

    // Go keywords
    const keywords = [
      "package", "import", "type", "struct", "func", "return", "switch", "case",
      "default", "go", "select", "chan", "var", "const", "for", "range", "if", "else", "defer"
    ];
    // Go basic types
    const types = [
      "string", "int", "int64", "bool", "error", "Client", "PortForwarder", "FileSyncer", "Config", "FileSignature"
    ];

    // Highlight keywords
    keywords.forEach(kw => {
      const reg = new RegExp(`\\b${kw}\\b`, 'g');
      escaped = escaped.replace(reg, `<span class="text-[#cc7832] font-semibold">${kw}</span>`);
    });

    // Highlight types
    types.forEach(t => {
      const reg = new RegExp(`\\b${t}\\b`, 'g');
      escaped = escaped.replace(reg, `<span class="text-[#a9b7c6] font-medium">$1</span>`); // Jetbrains gray-white
    });

    // Types like int, string can be highlighted custom
    escaped = escaped.replace(/\b(string|int|int64|bool|error|nil|true|false)\b/g, '<span class="text-[#569cd6]">$1</span>');

    // Highlight strings
    escaped = escaped.replace(/("[^"]*")/g, '<span class="text-[#6a8759]">$1</span>');
    escaped = escaped.replace(/(`[^`]*`)/g, '<span class="text-[#6a8759]">$1</span>');

    // Highlight single-line comments
    escaped = escaped.replace(/(\/\/.*)$/gm, '<span class="text-[#808080]">$1</span>');

    return escaped;
  };

  const filteredFiles = goFiles.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="jetbrains-editor" className="flex-1 bg-[#1e2030] border border-[#2b2d42] rounded-xl flex overflow-hidden h-[calc(100vh-140px)]">
      {/* Mini File Explorer inside Editor */}
      <div className="w-56 bg-[#161825] border-r border-[#2b2d42] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#2b2d42] bg-[#12141e]">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2 text-gray-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索源文件..."
              className="w-full bg-[#1e2030] border border-[#2c2f44] rounded pl-7 pr-2 py-1 text-[11px] text-white focus:outline-none focus:border-[#f97316] placeholder-gray-500"
            />
          </div>
        </div>

        {/* Tree List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block px-2 mb-1.5">
            项目模块 (GO)
          </span>

          {filteredFiles.map((file) => {
            const isSelected = activeFile === file.name;
            return (
              <button
                id={`file-tree-item-${file.name}`}
                key={file.name}
                onClick={() => setActiveFile(file.name)}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono flex items-center gap-2 transition-colors ${
                  isSelected
                    ? "bg-[#282b3d] text-[#f97316] font-medium"
                    : "text-gray-400 hover:bg-[#1a1d2d] hover:text-gray-200"
                }`}
              >
                {file.name.endsWith(".go") ? (
                  <FileCode size={13} className={isSelected ? "text-[#f97316]" : "text-[#5e81ac]"} />
                ) : (
                  <FileText size={13} className="text-[#a3be8c]" />
                )}
                <span className="truncate">{file.name}</span>
              </button>
            );
          })}

          {filteredFiles.length === 0 && (
            <p className="text-[10px] text-gray-500 text-center py-4 font-mono">未找到匹配文件</p>
          )}
        </div>

        {/* Compile hint */}
        <div className="p-3 bg-[#11131c] border-t border-[#2b2d42] text-[10px]">
          <div className="flex items-center gap-1.5 text-gray-400 mb-1 font-mono">
            <Settings size={10} className="animate-spin text-amber-500" />
            <span>本地快速编译:</span>
          </div>
          <code className="block bg-[#1a1c2a] p-1.5 rounded text-gray-400 font-mono text-[9px] break-all border border-[#26283b]">
            go build -o gateway *.go
          </code>
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#1e2030]">
        {/* Editor Tabs */}
        <div className="bg-[#161825] border-b border-[#2b2d42] flex items-center justify-between p-1">
          <div className="flex items-center gap-1 overflow-x-auto">
            {goFiles.map((file) => {
              const isSelected = activeFile === file.name;
              return (
                <button
                  id={`editor-tab-${file.name}`}
                  key={file.name}
                  onClick={() => setActiveFile(file.name)}
                  className={`px-3 py-1.5 rounded-t text-xs font-mono flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? "bg-[#1e2030] text-[#f97316] font-medium border-t-2 border-[#f97316]"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {file.name.endsWith(".go") ? (
                    <FileCode size={12} className={isSelected ? "text-[#f97316]" : "text-gray-500"} />
                  ) : (
                    <FileText size={12} className="text-gray-500" />
                  )}
                  <span>{file.name}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-2">
            <button
              id="btn-copy-code"
              onClick={handleCopy}
              className="p-1 rounded bg-[#2a2c3f] hover:bg-[#383a54] text-gray-300 hover:text-white transition-colors"
              title="复制代码"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
            </button>
            <button
              id="btn-download-code"
              onClick={handleDownload}
              className="p-1 rounded bg-[#2a2c3f] hover:bg-[#383a54] text-gray-300 hover:text-white transition-colors"
              title="下载源文件"
            >
              <Download size={12} />
            </button>
          </div>
        </div>

        {/* File description breadcrumb */}
        {currentFile && (
          <div className="bg-[#12141e]/50 px-4 py-1.5 border-b border-[#2b2d42]/60 flex items-center justify-between text-[10px] text-gray-400">
            <span className="font-mono text-gray-500">{currentFile.path}</span>
            <span className="italic truncate text-right pl-4 text-[#f97316]/80">{currentFile.description}</span>
          </div>
        )}

        {/* Code Content */}
        {currentFile ? (
          <div className="flex-1 overflow-auto p-4 bg-[#1e2030] font-mono text-xs leading-relaxed selection:bg-[#4f547c]">
            <pre className="text-[#a9b7c6] whitespace-pre select-text">
              <code dangerouslySetInnerHTML={{ __html: highlightGo(currentFile.content) }} />
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-500">
            <Terminal size={32} className="text-gray-700 mb-2" />
            <p className="text-xs">请选择文件以查看源代码</p>
          </div>
        )}
      </div>
    </div>
  );
}
