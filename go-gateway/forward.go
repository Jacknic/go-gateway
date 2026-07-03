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
	sshClient   *ssh.Client
	localPort   int
	remotePort  int
	reverse     bool
	listener    net.Listener // Local listener (for local -> remote)
	sshListener net.Listener // Remote listener (for remote -> local)
	mu          sync.Mutex
	activeConn  int
}

func NewPortForwarder(client *ssh.Client, local, remote int, reverse bool) (*PortForwarder, error) {
	pf := &PortForwarder{
		sshClient:  client,
		localPort:  local,
		remotePort: remote,
		reverse:    reverse,
	}

	if reverse {
		// Remote Port Forwarding: listen on remote port
		// We bind to 127.0.0.1:remotePort on the remote SSH server
		addr := fmt.Sprintf("127.0.0.1:%d", remote)
		listener, err := client.Listen("tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("failed to listen on remote port %d: %w", remote, err)
		}
		pf.sshListener = listener
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

// Start runs the TCP server, blocking until closed.
func (pf *PortForwarder) Start() error {
	if pf.reverse {
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
