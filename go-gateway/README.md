# Go Remote Development Gateway

A performance-tuned local port-forwarder and delta file-synchronizer CLI utility written in Go. This tool bridges your local developer machine with any remote workspace (cloud server, VM, or container) to deliver a low-latency, responsive IDE experience (similar to JetBrains Gateway).

## Key Features

1. **Local TCP Port Forwarding**: Maps remote microservice/web ports to your local host over a secure SSH channel, allowing low-latency local testing.
2. **Delta File Synchronization**: Scans directory catalogs, computes SHA-256 signatures, performs fast tree comparisons, and transmits modified files over SSH/SCP streams instantly.
3. **Graceful Signals**: Handles termination gracefully, cleaning up ports and sockets safely.

---

## Getting Started

### 1. Prerequisites

Ensure you have **Go (1.18 or higher)** installed on your machine.
For SSH keys, the client will connect over port `22` (or your customized SSH port).

### 2. Compilation

Compile the Go files into a single, high-performance binary executable.

```bash
# Clone or navigate to the directory
cd go-gateway

# Download dependencies
go get golang.org/x/crypto/ssh

# Build the executable
go build -o gateway main.go forward.go sync.go
```

This creates a standalone `gateway` executable on Linux/macOS, or `gateway.exe` on Windows.

---

## Usage Guide

Run the compiled binary with flags to configure the modes of operation.

### A. Local Port Mapping Forwarding Mode (Local Tunnel, -L)
Forward remote database or application ports (e.g., remote port `8080` running on the server) to your local environment (local port `8080`):

```bash
./gateway -mode forward \
          -host "your-remote-host.com:22" \
          -user "ubuntu" \
          -key "~/.ssh/id_rsa" \
          -local-port 8080 \
          -remote-port 8080
```

### B. Remote/Reverse Port Forwarding Mode (Reverse Tunnel, -R)
Forward a service listening on your local machine (e.g., local ADB daemon running on port `5555`) to a port on the remote development machine (remote port `5555`), allowing tools running on the server to access your local devices/services:

```bash
./gateway -mode forward \
          -host "your-remote-host.com:22" \
          -user "ubuntu" \
          -key "~/.ssh/id_rsa" \
          -local-port 5555 \
          -remote-port 5555 \
          -reverse=true
```

### C. High-Speed File Synchronization Mode
Synchronize your local directory `~/projects/my-app` with your remote server directory `/var/www/my-app` with active file system watching:

```bash
./gateway -mode sync \
          -host "1.2.3.4:22" \
          -user "root" \
          -local-dir "./my-local-code" \
          -remote-dir "/var/www/remote-code" \
          -watch=true
```

### D. Hybrid Mode (Both Forwarding and Syncing)
Enable both continuous port mapping and file watching in a single workspace session:

```bash
./gateway -mode both \
          -host "dev-machine.internal:22" \
          -user "ec2-user" \
          -local-port 3000 \
          -remote-port 3000 \
          -local-dir "./src" \
          -remote-dir "/home/ec2-user/src" \
          -watch=true
```

---

## Technical Specifications & Optimizations

* **Concurrency**: Implements Go-routines (`go handleConnection`) to handle concurrent TCP sockets independently, avoiding blocking calls.
* **Low Latency**: Employs direct streaming buffer pipes (`io.Copy`) which map directly into native kernel buffers for zero-allocation high-speed socket transfers.
* **Delta Synchronization**: Avoids sending duplicate full-tree archives. It queries file checksums over an SSH channel first and performs a differential sync, significantly conserving bandwidth and remote I/O latency.
