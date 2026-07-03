package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// connectSSH configures and initializes an SSH connection to the remote host.
func connectSSH(config Config) (*ssh.Client, error) {
	// Support parsing user@host from SSHHost or SSHUser if they contain '@'
	// e.g., if user inputted username@cnb.space in Host or User
	if strings.Contains(config.SSHHost, "@") {
		parts := strings.SplitN(config.SSHHost, "@", 2)
		config.SSHUser = parts[0]
		config.SSHHost = parts[1]
		log.Printf("[*] Extracted SSH user '%s' and host '%s' from host parameter\n", config.SSHUser, config.SSHHost)
	} else if strings.Contains(config.SSHUser, "@") {
		parts := strings.SplitN(config.SSHUser, "@", 2)
		// Only override host if host is default/empty/local
		if config.SSHHost == "" || config.SSHHost == "127.0.0.1" || config.SSHHost == "127.0.0.1:22" || config.SSHHost == "localhost:22" || config.SSHHost == "localhost" {
			config.SSHUser = parts[0]
			config.SSHHost = parts[1]
			log.Printf("[*] Extracted SSH user '%s' and host '%s' from user parameter\n", config.SSHUser, config.SSHHost)
		}
	}

	// Ensure SSHHost contains a port, default to 22
	if !strings.Contains(config.SSHHost, ":") {
		config.SSHHost = config.SSHHost + ":22"
	}

	var authMethods []ssh.AuthMethod

	if config.SSHPass != "" {
		authMethods = append(authMethods, ssh.Password(config.SSHPass))
	}

	if config.SSHKeyPath != "" {
		log.Printf("[*] Loading private key from: %s\n", config.SSHKeyPath)
		keyBytes, err := os.ReadFile(config.SSHKeyPath)
		if err != nil {
			return nil, fmt.Errorf("failed to read private key file: %w", err)
		}
		signer, err := ssh.ParsePrivateKey(keyBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}
		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	// Default fallback authentication for the example
	if len(authMethods) == 0 {
		authMethods = append(authMethods, ssh.Password("dev_gateway_token"))
	}

	sshConfig := &ssh.ClientConfig{
		User:            config.SSHUser,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // Use secure host checking in production!
		Timeout:         10 * time.Second,
	}

	return ssh.Dial("tcp", config.SSHHost, sshConfig)
}

// PortForwarder manages local or remote TCP sockets and forwards traffic over SSH.
type PortForwarder struct {
	sshClient      *ssh.Client
	localPort      int
	remotePort     int
	reverse        bool
	useCmdFallback bool         // Enable SSH Command-based Remote Listener fallback if -R is disabled
	listener       net.Listener // Local listener (for local -> remote)
	sshListener    net.Listener // Remote listener (for remote -> local)
	mu             sync.Mutex
	activeConn     int
}

func NewPortForwarder(client *ssh.Client, local, remote int, reverse bool) (*PortForwarder, error) {
	pf := &PortForwarder{
		sshClient:  client,
		localPort:  local,
		remotePort: remote,
		reverse:    reverse,
	}

	if reverse {
		log.Printf("[*] Using SSH Command-based Remote Port Forwarder (using Python on remote side) to listen on remote port %d...\n", remote)
		pf.useCmdFallback = true
	} else {
		// Local Port Forwarding: listen on local port
		addr := fmt.Sprintf("127.0.0.1:%d", local)
		listener, err := net.Listen("tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("failed to bind to local port %d: %w", local, err)
		}
		pf.listener = listener
	}

	return pf, nil
}

// startCommandBasedReverse runs a remote listener process via SSH session, receiving connections and piping data.
func (pf *PortForwarder) startCommandBasedReverse() error {
	log.Printf("[+] SSH Command-based Remote Port Forwarder starting (remote:%d -> local:%d)\n", pf.remotePort, pf.localPort)

	for {
		// Start a new SSH session for each incoming connection
		session, err := pf.sshClient.NewSession()
		if err != nil {
			log.Printf("[-] Failed to create SSH session for remote listener: %v. Retrying in 3s...\n", err)
			time.Sleep(3 * time.Second)
			continue
		}

		stdoutPipe, err := session.StdoutPipe()
		if err != nil {
			session.Close()
			log.Printf("[-] Failed to get stdout pipe: %v\n", err)
			time.Sleep(3 * time.Second)
			continue
		}
		stderrPipe, err := session.StderrPipe()
		if err != nil {
			session.Close()
			log.Printf("[-] Failed to get stderr pipe: %v\n", err)
			time.Sleep(3 * time.Second)
			continue
		}
		stdinPipe, err := session.StdinPipe()
		if err != nil {
			session.Close()
			log.Printf("[-] Failed to get stdin pipe: %v\n", err)
			time.Sleep(3 * time.Second)
			continue
		}

		// Python command to listen on remotePort and pipe to stdin/stdout
		pythonCmd := fmt.Sprintf(`python3 -c "
import socket, sys, threading
def pipe(src, dst):
    try:
        while True:
            data = src.recv(4096)
            if not data: break
            dst.write(data)
            dst.flush()
    except: pass
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    s.bind(('0.0.0.0', %d))
except Exception as e:
    sys.stderr.write('BIND_ERROR: ' + str(e))
    sys.stderr.flush()
    sys.exit(1)
s.listen(1)
sys.stderr.write('LISTENING')
sys.stderr.flush()
try:
    conn, addr = s.accept()
except:
    sys.exit(0)
sys.stderr.write('CONNECTED')
sys.stderr.flush()
t = threading.Thread(target=pipe, args=(conn, sys.stdout.buffer if hasattr(sys.stdout, 'buffer') else sys.stdout))
t.daemon = True
t.start()
stdin_file = sys.stdin.buffer if hasattr(sys.stdin, 'buffer') else sys.stdin
try:
    while True:
        data = stdin_file.read(4096)
        if not data: break
        conn.sendall(data)
except: pass
finally:
    conn.close()
"`, pf.remotePort)

		// Start the remote command
		if err := session.Start(pythonCmd); err != nil {
			session.Close()
			log.Printf("[-] Failed to start remote python3 listener: %v. Retrying with 'python'...\n", err)
			// Try 'python' instead of 'python3'
			session, err = pf.sshClient.NewSession()
			if err != nil {
				time.Sleep(3 * time.Second)
				continue
			}
			stdoutPipe, _ = session.StdoutPipe()
			stderrPipe, _ = session.StderrPipe()
			stdinPipe, _ = session.StdinPipe()

			pythonCmdFallback := strings.Replace(pythonCmd, "python3 -c", "python -c", 1)
			if err := session.Start(pythonCmdFallback); err != nil {
				session.Close()
				log.Printf("[-] Failed to start remote python fallback listener: %v. Retrying in 5s...\n", err)
				time.Sleep(5 * time.Second)
				continue
			}
		}

		// Set up status channels
		listeningChan := make(chan bool, 1)
		connectedChan := make(chan bool, 1)
		errChan := make(chan string, 1)

		// Continuously read stderr to detect status
		go func() {
			buf := make([]byte, 1024)
			for {
				n, err := stderrPipe.Read(buf)
				if err != nil {
					return
				}
				msg := string(buf[:n])
				if strings.Contains(msg, "BIND_ERROR") {
					errChan <- msg
					return
				}
				if strings.Contains(msg, "LISTENING") {
					listeningChan <- true
				}
				if strings.Contains(msg, "CONNECTED") {
					connectedChan <- true
					return
				}
			}
		}()

		// Wait for BIND or LISTENING
		select {
		case <-listeningChan:
			log.Printf("[+] Remote command listener successfully bound and listening on remote port %d\n", pf.remotePort)
		case errMsg := <-errChan:
			log.Printf("[-] Remote listener error during bind: %s. Re-trying in 5s...\n", errMsg)
			session.Close()
			time.Sleep(5 * time.Second)
			continue
		case <-time.After(10 * time.Second):
			log.Printf("[-] Timeout waiting for remote listener to start. Re-trying...\n")
			session.Close()
			continue
		}

		// Wait for remote client connection (accept)
		select {
		case <-connectedChan:
			log.Printf("[+] Remote client connected to remote port %d. Initiating tunnel...\n", pf.remotePort)
		case errMsg := <-errChan:
			log.Printf("[-] Remote listener encountered error: %s. Re-starting listener...\n", errMsg)
			session.Close()
			continue
		case <-time.After(1 * time.Hour): // Wait up to an hour for a connection
			log.Printf("[-] Timeout waiting for remote client connection on port %d. Re-starting listener...\n", pf.remotePort)
			session.Close()
			continue
		}

		// Now that a remote client connected, connect to the local target port
		localAddr := fmt.Sprintf("127.0.0.1:%d", pf.localPort)
		localConn, err := net.DialTimeout("tcp", localAddr, 5*time.Second)
		if err != nil {
			log.Printf("[-] Failed to connect to local target port %d: %v. Closing remote channel...\n", pf.localPort, err)
			session.Close()
			continue
		}

		pf.mu.Lock()
		pf.activeConn++
		active := pf.activeConn
		pf.mu.Unlock()

		log.Printf("[*] Command-based Reverse Connection #%d accepted on remote. Tunneling to local:%d...\n", active, pf.localPort)

		// Pipe the SSH session stdin/stdout with localConn bi-directionally
		var wg sync.WaitGroup
		wg.Add(2)

		var sentBytes, recvBytes int64
		startTime := time.Now()

		// Copy remote -> local (Stdout of SSH session contains remote data, write to localConn)
		go func() {
			defer wg.Done()
			copied, err := io.Copy(localConn, stdoutPipe)
			if err != nil {
				// expected EOF/Close
			}
			recvBytes = copied
			localConn.Close() // close write side of local
		}()

		// Copy local -> remote (Read localConn, write to SSH session stdin)
		go func() {
			defer wg.Done()
			copied, err := io.Copy(stdinPipe, localConn)
			if err != nil {
				// expected EOF/Close
			}
			sentBytes = copied
			stdinPipe.Close() // close write side of SSH session
		}()

		// Wait for data piping to complete, then close session and clean up
		wg.Wait()
		localConn.Close()
		session.Close()

		duration := time.Since(startTime)
		log.Printf("[+] Command-based Reverse Tunnel #%d summary: %d bytes sent, %d bytes received, session duration: %v\n",
			active, sentBytes, recvBytes, duration)

		pf.mu.Lock()
		pf.activeConn--
		pf.mu.Unlock()

		// Instantly restart listener for next connection
	}
}

// Start runs the TCP server, blocking until closed.
func (pf *PortForwarder) Start() error {
	if pf.reverse {
		if pf.useCmdFallback {
			return pf.startCommandBasedReverse()
		}

		log.Printf("[+] Remote Port Forwarder listening on remote:%d (forwarding to local:%d)\n", pf.remotePort, pf.localPort)
		defer pf.sshListener.Close()

		for {
			remoteConn, err := pf.sshListener.Accept()
			if err != nil {
				return fmt.Errorf("accept remote connection failed: %w", err)
			}

			pf.mu.Lock()
			pf.activeConn++
			active := pf.activeConn
			pf.mu.Unlock()

			log.Printf("[*] Reverse Connection #%d accepted on remote. Tunneling to local:%d...\n",
				active, pf.localPort)

			go pf.handleReverseConnection(remoteConn, active)
		}
	} else {
		log.Printf("[+] Local Port Forwarder listening on local:%d (forwarding to remote:%d)\n", pf.localPort, pf.remotePort)
		defer pf.listener.Close()

		for {
			localConn, err := pf.listener.Accept()
			if err != nil {
				return fmt.Errorf("accept local connection failed: %w", err)
			}

			pf.mu.Lock()
			pf.activeConn++
			active := pf.activeConn
			pf.mu.Unlock()

			log.Printf("[*] Connection #%d accepted from %s. Tunneling to remote:%d...\n",
				active, localConn.RemoteAddr().String(), pf.remotePort)

			go pf.handleConnection(localConn, active)
		}
	}
}

// handleConnection pipes bytes bi-directionally between local and remote target (local -> remote).
func (pf *PortForwarder) handleConnection(localConn net.Conn, id int) {
	defer func() {
		localConn.Close()
		pf.mu.Lock()
		pf.activeConn--
		pf.mu.Unlock()
		log.Printf("[*] Tunnel #%d closed\n", id)
	}()

	// Open a channel over the SSH connection to the remote loopback/target
	remoteAddr := fmt.Sprintf("127.0.0.1:%d", pf.remotePort)
	remoteConn, err := pf.sshClient.Dial("tcp", remoteAddr)
	if err != nil {
		log.Printf("[-] SSH tunnel channel dial failed: %v\n", err)
		return
	}
	defer remoteConn.Close()

	// Start stopwatch to log latency/duration
	startTime := time.Now()

	// High-performance bi-directional copy channel
	var wg sync.WaitGroup
	wg.Add(2)

	var sentBytes, recvBytes int64

	// Copy Local -> Remote
	go func() {
		defer wg.Done()
		copied, err := io.Copy(remoteConn, localConn)
		if err != nil {
			// Quietly terminate on expected EOF
		}
		sentBytes = copied
	}()

	// Copy Remote -> Local
	go func() {
		defer wg.Done()
		copied, err := io.Copy(localConn, remoteConn)
		if err != nil {
			// Quietly terminate on expected EOF
		}
		recvBytes = copied
	}()

	wg.Wait()
	duration := time.Since(startTime)
	log.Printf("[+] Tunnel #%d summary: %d bytes sent, %d bytes received, session duration: %v\n",
		id, sentBytes, recvBytes, duration)
}

// handleReverseConnection pipes bytes bi-directionally between remote and local target (remote -> local).
func (pf *PortForwarder) handleReverseConnection(remoteConn net.Conn, id int) {
	defer func() {
		remoteConn.Close()
		pf.mu.Lock()
		pf.activeConn--
		pf.mu.Unlock()
		log.Printf("[*] Reverse Tunnel #%d closed\n", id)
	}()

	// Connect to local loopback target port (e.g., local ADB server at 5555)
	localAddr := fmt.Sprintf("127.0.0.1:%d", pf.localPort)
	localConn, err := net.DialTimeout("tcp", localAddr, 5*time.Second)
	if err != nil {
		log.Printf("[-] Failed to connect to local target port %d: %v\n", pf.localPort, err)
		return
	}
	defer localConn.Close()

	// Start stopwatch to log latency/duration
	startTime := time.Now()

	// High-performance bi-directional copy channel
	var wg sync.WaitGroup
	wg.Add(2)

	var sentBytes, recvBytes int64

	// Copy Remote -> Local (data from remote client going into local service)
	go func() {
		defer wg.Done()
		copied, err := io.Copy(localConn, remoteConn)
		if err != nil {
			// Quietly terminate on expected EOF
		}
		recvBytes = copied
	}()

	// Copy Local -> Remote (data from local service sent back to remote server)
	go func() {
		defer wg.Done()
		copied, err := io.Copy(remoteConn, localConn)
		if err != nil {
			// Quietly terminate on expected EOF
		}
		sentBytes = copied
	}()

	wg.Wait()
	duration := time.Since(startTime)
	log.Printf("[+] Reverse Tunnel #%d summary: %d bytes sent, %d bytes received, session duration: %v\n",
		id, sentBytes, recvBytes, duration)
}
