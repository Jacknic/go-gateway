export interface Workspace {
  id: string;
  name: string;
  host: string;
  user: string;
  port: number;
  authMethod: 'password' | 'ssh_key';
  remotePath: string;
  localPath: string;
  status: 'connected' | 'disconnected' | 'connecting';
  latencyMs: number;
  createdAt: string;
}

export interface PortMapping {
  id: string;
  workspaceId: string;
  name: string;
  localPort: number;
  remotePort: number;
  active: boolean;
  reverse?: boolean;
  metrics: {
    bytesSent: number;
    bytesReceived: number;
    latencyMs: number;
    connectionsCount: number;
  };
}

export interface SyncSession {
  id: string;
  workspaceId: string;
  lastSyncTime: string | null;
  status: 'idle' | 'syncing' | 'error' | 'watching';
  totalFiles: number;
  syncedFiles: number;
  syncSpeedMb: number;
  logs: LogEntry[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: 'system' | 'ssh' | 'sync' | 'forward';
  message: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  status?: 'synced' | 'modified' | 'syncing' | 'untracked';
  children?: FileItem[];
}

export interface GoSourceFile {
  name: string;
  path: string;
  language: string;
  content: string;
  description: string;
}
