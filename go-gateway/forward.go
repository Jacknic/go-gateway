package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// connectSSH configures and initializes an SSH connection to the remote host.
func connectSSH(config Config) (*ssh.Client, error) {
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

// PortForwarder manages local TCP sockets and forwards traffic over SSH.
type PortForwarder struct {
	sshClient  *ssh.Client
	localPort  int
	remotePort int
	listener   net.Listener
	mu         sync.Mutex
	activeConn int
}

func NewPortForwarder(client *ssh.Client, local, remote int) (*PortForwarder, error) {
	addr := fmt.Sprintf("127.0.0.1:%d", local)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("failed to bind to local port %d: %w", local, err)
	}

	return &PortForwarder{
		sshClient:  client,
		localPort:  local,
		remotePort: remote,
		listener:   listener,
	}, nil
}

// Start runs the TCP server, blocking until closed.
func (pf *PortForwarder) Start() error {
	log.Printf("[+] Local Port Forwarder listening on %s\n", pf.listener.Addr().String())
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

// handleConnection pipes bytes bi-directionally between local and remote target.
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
