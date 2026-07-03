import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Global In-Memory Database for Gateway Simulation
let workspaces = [
  {
    id: "ws-1",
    name: "AWS Singapore Cluster - API Node",
    host: "13.212.45.101:22",
    user: "ubuntu",
    port: 22,
    authMethod: "ssh_key" as const,
    remotePath: "/home/ubuntu/workspace/project-api",
    localPath: "/Users/jack/workspace/project-api",
    status: "connected" as "connected" | "disconnected" | "connecting",
    latencyMs: 14,
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "ws-2",
    name: "GCP Silicon Valley - Frontend Inst",
    host: "34.102.122.8:22",
    user: "admin",
    port: 22,
    authMethod: "password" as const,
    remotePath: "/var/www/next-frontend",
    localPath: "/Users/jack/workspace/next-frontend",
    status: "disconnected" as "connected" | "disconnected" | "connecting",
    latencyMs: 145,
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  }
];

let portMappings = [
  {
    id: "pm-1",
    workspaceId: "ws-1",
    name: "Vite Development Server",
    localPort: 5173,
    remotePort: 5173,
    active: true,
    metrics: {
      bytesSent: 1245088,
      bytesReceived: 8940220,
      latencyMs: 14,
      connectionsCount: 3,
    }
  },
  {
    id: "pm-2",
    workspaceId: "ws-1",
    name: "PostgreSQL Database",
    localPort: 5432,
    remotePort: 5432,
    active: true,
    metrics: {
      bytesSent: 4522010,
      bytesReceived: 14502040,
      latencyMs: 15,
      connectionsCount: 8,
    }
  },
  {
    id: "pm-3",
    workspaceId: "ws-1",
    name: "Redis Server",
    localPort: 6379,
    remotePort: 6379,
    active: false,
    metrics: {
      bytesSent: 0,
      bytesReceived: 0,
      latencyMs: 0,
      connectionsCount: 0,
    }
  },
  {
    id: "pm-4",
    workspaceId: "ws-2",
    name: "Next.js Dev Server",
    localPort: 3000,
    remotePort: 3000,
    active: false,
    metrics: {
      bytesSent: 0,
      bytesReceived: 0,
      latencyMs: 0,
      connectionsCount: 0,
    }
  }
];

// File sync schemas & statuses
let workspaceFiles: Record<string, { local: any[]; remote: any[]; logs: any[] }> = {
  "ws-1": {
    local: [
      { name: "package.json", path: "package.json", isDirectory: false, size: 845, status: "synced" },
      { name: "tsconfig.json", path: "tsconfig.json", isDirectory: false, size: 412, status: "synced" },
      { name: "src", path: "src", isDirectory: true, status: "synced", children: [
        { name: "main.tsx", path: "src/main.tsx", isDirectory: false, size: 310, status: "synced" },
        { name: "index.css", path: "src/index.css", isDirectory: false, size: 120, status: "synced" },
        { name: "App.tsx", path: "src/App.tsx", isDirectory: false, size: 2450, status: "modified" },
      ]},
      { name: "go-gateway", path: "go-gateway", isDirectory: true, status: "synced", children: [
        { name: "main.go", path: "go-gateway/main.go", isDirectory: false, size: 2840, status: "synced" },
        { name: "forward.go", path: "go-gateway/forward.go", isDirectory: false, size: 2310, status: "synced" },
        { name: "sync.go", path: "go-gateway/sync.go", isDirectory: false, size: 4500, status: "synced" },
      ]}
    ],
    remote: [
      { name: "package.json", path: "package.json", isDirectory: false, size: 845, status: "synced" },
      { name: "tsconfig.json", path: "tsconfig.json", isDirectory: false, size: 412, status: "synced" },
      { name: "src", path: "src", isDirectory: true, status: "synced", children: [
        { name: "main.tsx", path: "src/main.tsx", isDirectory: false, size: 310, status: "synced" },
        { name: "index.css", path: "src/index.css", isDirectory: false, size: 120, status: "synced" },
        { name: "App.tsx", path: "src/App.tsx", isDirectory: false, size: 1840, status: "synced" }, // Smaller, older version
      ]},
      { name: "go-gateway", path: "go-gateway", isDirectory: true, status: "synced", children: [
        { name: "main.go", path: "go-gateway/main.go", isDirectory: false, size: 2840, status: "synced" },
        { name: "forward.go", path: "go-gateway/forward.go", isDirectory: false, size: 2310, status: "synced" },
        { name: "sync.go", path: "go-gateway/sync.go", isDirectory: false, size: 4500, status: "synced" },
      ]}
    ],
    logs: [
      { id: "log-1", timestamp: new Date(Date.now() - 3600 * 1000).toLocaleTimeString(), level: "success", source: "ssh", message: "SSH secure tunnel successfully connected" },
      { id: "log-2", timestamp: new Date(Date.now() - 1800 * 1000).toLocaleTimeString(), level: "info", source: "sync", message: "Delta sync: 0 changes detected. Folders up-to-date." }
    ]
  },
  "ws-2": {
    local: [
      { name: "package.json", path: "package.json", isDirectory: false, size: 1200, status: "synced" },
      { name: "next.config.js", path: "next.config.js", isDirectory: false, size: 420, status: "synced" },
      { name: "pages", path: "pages", isDirectory: true, status: "synced", children: [
        { name: "index.js", path: "pages/index.js", isDirectory: false, size: 1845, status: "modified" },
      ]}
    ],
    remote: [
      { name: "package.json", path: "package.json", isDirectory: false, size: 1200, status: "synced" },
      { name: "next.config.js", path: "next.config.js", isDirectory: false, size: 420, status: "synced" },
    ],
    logs: [
      { id: "log-1", timestamp: new Date(Date.now() - 10 * 3600 * 1000).toLocaleTimeString(), level: "warn", source: "ssh", message: "SSH connection interrupted. Timeout" }
    ]
  }
};

// Simulate Real-time Metrics Update Background Task
setInterval(() => {
  portMappings.forEach(pm => {
    if (pm.active) {
      // Add random transfer packet sizes
      const sentDelta = Math.floor(Math.random() * 25000) + 1000;
      const receivedDelta = Math.floor(Math.random() * 125000) + 5000;
      pm.metrics.bytesSent += sentDelta;
      pm.metrics.bytesReceived += receivedDelta;
      
      // Jitter on latency
      const targetLatency = workspaces.find(w => w.id === pm.workspaceId)?.latencyMs || 20;
      const jitter = Math.floor(Math.random() * 5) - 2;
      pm.metrics.latencyMs = Math.max(1, targetLatency + jitter);

      // Fluctuate connections slightly
      if (Math.random() > 0.85) {
        const connChange = Math.random() > 0.5 ? 1 : -1;
        pm.metrics.connectionsCount = Math.max(1, pm.metrics.connectionsCount + connChange);
      }
    }
  });
}, 2000);

// --- REST API ENDPOINTS ---

// Get Workspaces
app.get("/api/workspaces", (req, res) => {
  res.json(workspaces);
});

// Create Workspace
app.post("/api/workspaces", (req, res) => {
  let { name, host, user, port, authMethod, remotePath, localPath } = req.body;
  
  if (!name || !host || !user) {
    return res.status(400).json({ error: "Missing required workspace fields" });
  }

  // Parse user@host if provided in either host or user fields
  if (host.includes("@")) {
    const parts = host.split("@");
    user = parts[0];
    host = parts[1];
  } else if (user.includes("@")) {
    const parts = user.split("@");
    if (host === "" || host === "127.0.0.1" || host === "localhost") {
      user = parts[0];
      host = parts[1];
    }
  }

  // Parse custom port from host if host contains colon, e.g. cnb.space:2222
  let finalPort = Number(port) || 22;
  if (host.includes(":")) {
    const parts = host.split(":");
    host = parts[0];
    finalPort = Number(parts[1]) || finalPort;
  }

  const newWorkspace = {
    id: "ws-" + Date.now(),
    name,
    host,
    user,
    port: finalPort,
    authMethod: authMethod || "ssh_key",
    remotePath: remotePath || "/app",
    localPath: localPath || "./",
    status: "disconnected" as const,
    latencyMs: Math.floor(Math.random() * 80) + 10,
    createdAt: new Date().toISOString()
  };

  workspaces.push(newWorkspace);
  
  // Seed file storage for new workspace
  workspaceFiles[newWorkspace.id] = {
    local: [
      { name: "main.go", path: "main.go", isDirectory: false, size: 2840, status: "modified" },
      { name: "go.mod", path: "go.mod", isDirectory: false, size: 85, status: "untracked" },
    ],
    remote: [],
    logs: [
      { id: "log-" + Date.now(), timestamp: new Date().toLocaleTimeString(), level: "info", source: "system", message: `Workspace '${name}' configured.` }
    ]
  };

  res.status(211).json(newWorkspace);
});

// Connect/Disconnect Workspace
app.post("/api/workspaces/:id/toggle-connect", (req, res) => {
  const workspace = workspaces.find(w => w.id === req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: "Workspace not found" });
  }

  const filesStore = workspaceFiles[workspace.id] || { local: [], remote: [], logs: [] };

  if (workspace.status === "connected") {
    workspace.status = "disconnected";
    
    // Deactivate all ports
    portMappings.forEach(pm => {
      if (pm.workspaceId === workspace.id) {
        pm.active = false;
        pm.metrics.connectionsCount = 0;
      }
    });

    filesStore.logs.push({
      id: "log-" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      level: "warn",
      source: "ssh",
      message: "Disconnected workspace gateway tunnel safely."
    });
  } else {
    workspace.status = "connecting";
    
    setTimeout(() => {
      workspace.status = "connected";
      filesStore.logs.push({
        id: "log-" + Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        level: "success",
        source: "ssh",
        message: "SSH Secure handshake successful. Tunnel established on port " + workspace.port
      });
    }, 1500);
  }

  res.json(workspace);
});

// Delete Workspace
app.delete("/api/workspaces/:id", (req, res) => {
  const index = workspaces.findIndex(w => w.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Workspace not found" });
  }
  
  const [deleted] = workspaces.splice(index, 1);
  portMappings = portMappings.filter(pm => pm.workspaceId !== req.params.id);
  delete workspaceFiles[req.params.id];

  res.json({ success: true, deleted });
});

// Get Port Mappings
app.get("/api/workspaces/:id/ports", (req, res) => {
  const mappings = portMappings.filter(pm => pm.workspaceId === req.params.id);
  res.json(mappings);
});

// Add Port Mapping
app.post("/api/workspaces/:id/ports", (req, res) => {
  const { name, localPort, remotePort, reverse } = req.body;
  if (!localPort || !remotePort) {
    return res.status(400).json({ error: "Local and Remote ports are required" });
  }

  const newMapping = {
    id: "pm-" + Date.now(),
    workspaceId: req.params.id,
    name: name || `Port ${localPort} Mapping`,
    localPort: Number(localPort),
    remotePort: Number(remotePort),
    active: true,
    reverse: !!reverse,
    metrics: {
      bytesSent: 0,
      bytesReceived: 0,
      latencyMs: workspaces.find(w => w.id === req.params.id)?.latencyMs || 15,
      connectionsCount: 1
    }
  };

  portMappings.push(newMapping);
  
  const filesStore = workspaceFiles[req.params.id];
  if (filesStore) {
    const bindMessage = !!reverse
      ? `Bound remote listener 127.0.0.1:${remotePort} -> local:${localPort} (Reverse Tunnel)`
      : `Bound local listener 127.0.0.1:${localPort} -> remote:${remotePort}`;
    filesStore.logs.push({
      id: "log-" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      source: "forward",
      message: bindMessage
    });
  }

  res.json(newMapping);
});

// Toggle Port Mapping Active
app.post("/api/ports/:id/toggle", (req, res) => {
  const pm = portMappings.find(p => p.id === req.params.id);
  if (!pm) {
    return res.status(404).json({ error: "Port mapping not found" });
  }

  pm.active = !pm.active;
  if (!pm.active) {
    pm.metrics.connectionsCount = 0;
  } else {
    pm.metrics.connectionsCount = 1;
  }

  const filesStore = workspaceFiles[pm.workspaceId];
  if (filesStore) {
    filesStore.logs.push({
      id: "log-" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      source: "forward",
      message: pm.active ? `Enabled port mapping ${pm.localPort} -> ${pm.remotePort}` : `Disabled port mapping ${pm.localPort} -> ${pm.remotePort}`
    });
  }

  res.json(pm);
});

// Get Files & Logs for Workspace
app.get("/api/workspaces/:id/sync", (req, res) => {
  const data = workspaceFiles[req.params.id];
  if (!data) {
    return res.status(404).json({ error: "Workspace files data not found" });
  }
  res.json(data);
});

// Trigger File Sync Simulator
app.post("/api/workspaces/:id/sync", (req, res) => {
  const store = workspaceFiles[req.params.id];
  if (!store) {
    return res.status(404).json({ error: "Workspace not found" });
  }

  const addLog = (level: 'info' | 'success' | 'warn', message: string) => {
    store.logs.push({
      id: "log-" + Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      source: "sync",
      message
    });
  };

  // Perform multi-step sync logs simulation
  addLog("info", "Delta file-sync initiated...");
  addLog("info", "Scanning local folders and generating SHA256 checksum signatures...");
  
  // Recursively update local files status to "synced"
  const markSynced = (files: any[]) => {
    files.forEach(f => {
      if (f.status === "modified" || f.status === "untracked") {
        f.status = "synced";
      }
      if (f.children) {
        markSynced(f.children);
      }
    });
  };

  setTimeout(() => {
    addLog("info", "Comparing catalog with remote server signatures...");
  }, 500);

  setTimeout(() => {
    // Find modified files
    let modifiedFilesCount = 0;
    const findModified = (files: any[]) => {
      files.forEach(f => {
        if (f.status === "modified" || f.status === "untracked") {
          modifiedFilesCount++;
        }
        if (f.children) {
          findModified(f.children);
        }
      });
    };
    findModified(store.local);

    if (modifiedFilesCount === 0) {
      addLog("success", "Sync summary: No changes detected. All systems synchronized and stable.");
    } else {
      addLog("info", `Syncing ${modifiedFilesCount} changed files over low-latency multi-channel SCP connection...`);
      
      // Update remote tree to match local tree structure
      store.remote = JSON.parse(JSON.stringify(store.local));
      markSynced(store.local);
      markSynced(store.remote);

      setTimeout(() => {
        addLog("success", `Sync Completed! Handled ${modifiedFilesCount} files successfully. Latency check: 12ms. speed: 45.4 MB/s.`);
      }, 800);
    }
  }, 1000);

  res.json({ success: true });
});

// Modify local file to simulate fswatch change
app.post("/api/workspaces/:id/files/modify", (req, res) => {
  const store = workspaceFiles[req.params.id];
  if (!store) {
    return res.status(404).json({ error: "Workspace not found" });
  }

  const { filePath } = req.body;

  const updateFileStatus = (files: any[]): boolean => {
    for (let f of files) {
      if (f.path === filePath) {
        f.status = "modified";
        f.size = (f.size || 100) + Math.floor(Math.random() * 500) + 50;
        return true;
      }
      if (f.children && updateFileStatus(f.children)) {
        return true;
      }
    }
    return false;
  };

  const updated = updateFileStatus(store.local);
  if (updated) {
    store.logs.push({
      id: "log-" + Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      level: "warn",
      source: "sync",
      message: `[fswatch] Local file change detected: ${filePath} (re-calculating delta hash)`
    });
  }

  res.json({ success: updated, files: store.local });
});

// --- GO CODE EXPLORER & AI CHAT ---

// Get Go source files
const getGoSourceFiles = (): any[] => {
  const goDir = path.join(process.cwd(), "go-gateway");
  const files = ["main.go", "forward.go", "sync.go", "README.md"];
  
  return files.map(filename => {
    const filePath = path.join(goDir, filename);
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (err) {
      content = `// Error reading file ${filename}`;
    }

    let language = "go";
    if (filename.endsWith(".md")) {
      language = "markdown";
    }

    let description = "";
    if (filename === "main.go") description = "Handshakes client configs, parses SSH arguments, and spawns the syncer or forwarder channels.";
    if (filename === "forward.go") description = "Establishes secure multi-channel SSH TCP pipelines and pipes network packets bi-directionally.";
    if (filename === "sync.go") description = "Walks folders, hashes catalogs with SHA256, compares delta states, and syncs altered files over SSH pipelines.";
    if (filename === "README.md") description = "Documentation guide on prerequisites, Go compilation commands, and usage command examples.";

    return {
      name: filename,
      path: `go-gateway/${filename}`,
      language,
      content,
      description
    };
  });
};

app.get("/api/go-files", (req, res) => {
  res.json(getGoSourceFiles());
});

// AI Chatbot with Gemini to explain/optimize code
app.post("/api/gemini/chat", async (req, res) => {
  const { message, chatHistory, selectedFile } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: "Missing message payload" });
  }

  if (!ai) {
    return res.status(503).json({ 
      reply: "Gemini AI API key is not configured in secrets. Please set GEMINI_API_KEY in Settings > Secrets to unlock the smart AI Remote Gateway optimizer." 
    });
  }

  try {
    const sourceFiles = getGoSourceFiles();
    const systemInstruction = `You are an elite Golang Network Engineer and Systems Architect specializing in secure, low-latency client-server communications, TCP port-forwarding, SSH tunneling, file-watching with fsnotify, and delta sync optimization (like Rsync algorithms).
Your objective is to help the user understand, customize, and optimize the "Go Remote Dev Gateway" tool that we've written.

Here is the source code of our Go gateway for context:
${sourceFiles.map(f => `--- File: ${f.name} --- \n${f.content}\n`).join("\n")}

Respond to the user's questions in detail. If they ask to optimize the code (e.g., buffering size, concurrency controls, delta synchronization, Brotli compression, fsnotify events), provide real, elegant Go code modifications. Avoid generic summaries; write precise, professional answers in a clear, engineering-focused tone. Let's respond in Chinese, maintaining professional tech vocabulary.`;

    const contents: any[] = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach(h => {
        contents.push({
          role: h.sender === "user" ? "user" : "model",
          parts: [{ text: h.text }]
        });
      });
    }

    // Add current prompt
    let userPrompt = message;
    if (selectedFile) {
      userPrompt = `[Context: Viewing file ${selectedFile}]\n${message}`;
    }
    contents.push({ role: "user", parts: [{ text: userPrompt }] });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("Gemini API Error: ", error);
    res.status(500).json({ error: error.message || "An error occurred with Gemini generation." });
  }
});


// --- VITE INTERACTION FOR SPA PORTING ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[+] Full Stack Developer Server running on port ${PORT}`);
  });
}

startServer();
