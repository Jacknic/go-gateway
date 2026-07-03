package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

type Config struct {
	Mode       string // "forward" or "sync" or "both"
	SSHHost    string // e.g. "1.2.3.4:22"
	SSHUser    string // e.g. "root"
	SSHPass    string // password authentication
	SSHKeyPath string // SSH private key file path

	// Port forwarding params
	LocalPort  int // e.g. 8080
	RemotePort int // e.g. 8080

	// Sync params
	LocalDir  string // e.g. "./src"
	RemoteDir string // e.g. "/var/www/src"
	Watch     bool   // continuous watching
}

func main() {
	config := Config{}

	flag.StringVar(&config.Mode, "mode", "forward", "Core feature: 'forward' (TCP port forwarding) or 'sync' (file sync) or 'both'")
	flag.StringVar(&config.SSHHost, "host", "127.0.0.1:22", "Remote host with SSH port (e.g., dev-server:22)")
	flag.StringVar(&config.SSHUser, "user", "root", "SSH user name")
	flag.StringVar(&config.SSHPass, "pass", "", "SSH password (optional, prefer SSH keys)")
	flag.StringVar(&config.SSHKeyPath, "key", "", "SSH private key file path")

	// Port forward flags
	flag.IntVar(&config.LocalPort, "local-port", 8080, "Local port to listen on for forwarding")
	flag.IntVar(&config.RemotePort, "remote-port", 8080, "Target port on the remote host")

	// Sync flags
	flag.StringVar(&config.LocalDir, "local-dir", "./", "Local directory to synchronize")
	flag.StringVar(&config.RemoteDir, "remote-dir", "/app", "Remote target directory")
	flag.BoolVar(&config.Watch, "watch", false, "Enable real-time file system watch and continuous sync")

	flag.Parse()

	fmt.Printf(`
=========================================
  Go Remote Dev Gateway - JetBrains Style
=========================================
 Mode:        %s
 Target:      %s@%s
=========================================
`, config.Mode, config.SSHUser, config.SSHHost)

	// Set up OS signal interception for graceful shutdown
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	// Establish SSH Client connection
	sshClient, err := connectSSH(config)
	if err != nil {
		log.Fatalf("[-] SSH Connection failed: %v", err)
	}
	defer sshClient.Close()
	log.Println("[+] SSH Connection successfully established")

	switch config.Mode {
	case "forward":
		log.Printf("[*] Launching Local Port Forwarder: local:%d -> remote:%d\n", config.LocalPort, config.RemotePort)
		forwarder, err := NewPortForwarder(sshClient, config.LocalPort, config.RemotePort)
		if err != nil {
			log.Fatalf("[-] Forwarder initialization failed: %v", err)
		}

		go func() {
			if err := forwarder.Start(); err != nil {
				log.Printf("[-] Forwarder terminated with error: %v\n", err)
			}
		}()

	case "sync":
		log.Printf("[*] Launching File Synchronization: %s -> %s\n", config.LocalDir, config.RemoteDir)
		syncer := NewFileSyncer(sshClient, config.LocalDir, config.RemoteDir)

		// Initial full delta-sync
		log.Println("[*] Calculating file signatures and executing initial sync...")
		if err := syncer.Sync(); err != nil {
			log.Printf("[-] Initial file sync failed: %v\n", err)
		} else {
			log.Println("[+] File synchronization completed successfully")
		}

		if config.Watch {
			log.Println("[*] File system watch enabled. Listening for file changes...")
			go syncer.StartWatching()
		} else {
			return
		}

	case "both":
		// Run both port forward and file syncer
		log.Printf("[*] Launching BOTH Port Forwarder and File Syncer...\n")
		forwarder, err := NewPortForwarder(sshClient, config.LocalPort, config.RemotePort)
		if err != nil {
			log.Fatalf("[-] Forwarder initialization failed: %v", err)
		}
		go forwarder.Start()

		syncer := NewFileSyncer(sshClient, config.LocalDir, config.RemoteDir)
		if err := syncer.Sync(); err != nil {
			log.Printf("[-] Initial file sync failed: %v\n", err)
		}
		if config.Watch {
			go syncer.StartWatching()
		}
	default:
		log.Fatalf("[-] Invalid mode: %s. Use 'forward', 'sync', or 'both'", config.Mode)
	}

	// Wait for terminate signal
	<-stopChan
	log.Println("[*] Received shutdown signal. Closing connections...")
}
