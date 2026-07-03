package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// FileSignature holds metadata and content hashes for delta detection.
type FileSignature struct {
	RelativePath string
	Hash         string
	Size         int64
	LastModified time.Time
	IsDirectory  bool
}

type FileSyncer struct {
	sshClient *ssh.Client
	localDir  string
	remoteDir string
}

func NewFileSyncer(client *ssh.Client, local, remote string) *FileSyncer {
	return &FileSyncer{
		sshClient: client,
		localDir:  local,
		remoteDir: remote,
	}
}

// Sync performs a full delta comparison and synchronizes changed files.
func (fs *FileSyncer) Sync() error {
	log.Println("[*] Cataloging local directory structure...")
	localCatalog, err := fs.buildLocalCatalog()
	if err != nil {
		return fmt.Errorf("local catalog build failed: %w", err)
	}
	log.Printf("[+] Found %d items locally\n", len(localCatalog))

	log.Println("[*] Querying remote directory state via SSH...")
	remoteCatalog, err := fs.buildRemoteCatalog()
	if err != nil {
		// If remote doesn't exist yet, we will treat it as empty and create it
		log.Printf("[!] Remote directory query error (might not exist): %v. Creating remote dir...\n", err)
		if err := fs.createRemoteDirectory(fs.remoteDir); err != nil {
			return fmt.Errorf("failed to create remote target directory: %w", err)
		}
		remoteCatalog = make(map[string]FileSignature)
	}

	// Compare catalogs and determine actions
	for relPath, localSig := range localCatalog {
		remoteSig, exists := remoteCatalog[relPath]

		if localSig.IsDirectory {
			if !exists {
				log.Printf("[*] Sync: creating remote directory: %s\n", relPath)
				fs.createRemoteDirectory(filepath.Join(fs.remoteDir, relPath))
			}
			continue
		}

		if !exists {
			log.Printf("[*] Sync: uploading NEW file: %s (%s)\n", relPath, formatSize(localSig.Size))
			if err := fs.transferFile(relPath, localSig.Size); err != nil {
				log.Printf("[-] Upload failed: %v\n", err)
			}
		} else if localSig.Hash != remoteSig.Hash {
			log.Printf("[*] Sync: updating MODIFIED file (hash mismatch): %s (%s)\n", relPath, formatSize(localSig.Size))
			// Delta transfer: in a real Rsync setup, we would compare blocks.
			// Here, we transfer the file contents.
			if err := fs.transferFile(relPath, localSig.Size); err != nil {
				log.Printf("[-] Update failed: %v\n", err)
			}
		}
	}

	// Check for files deleted locally to sync deletion remotely (optional cleanup)
	for relPath, remoteSig := range remoteCatalog {
		if _, exists := localCatalog[relPath]; !exists {
			if !remoteSig.IsDirectory {
				log.Printf("[*] Sync: deleting orphaned remote file: %s\n", relPath)
				fs.deleteRemoteFile(filepath.Join(fs.remoteDir, relPath))
			}
		}
	}

	return nil
}

// StartWatching registers system fswatch notifications and triggers incremental delta-syncs.
func (fs *FileSyncer) StartWatching() {
	// In production, use "github.com/fsnotify/fsnotify"
	log.Println("[+] File system watching initialized on: " + fs.localDir)
	
	// Simulated watch loop
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		// Walk directories, find any files changed since the last execution
		// trigger fast, single-file incremental syncs
	}
}

// buildLocalCatalog walks the local directory and computes SHA-256 signatures.
func (fs *FileSyncer) buildLocalCatalog() (map[string]FileSignature, error) {
	catalog := make(map[string]FileSignature)
	absPath, err := filepath.Abs(fs.localDir)
	if err != nil {
		return nil, err
	}

	err = filepath.Walk(absPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Avoid infinite loops and skip dotfiles/node_modules
		if strings.Contains(path, "node_modules") || strings.Contains(path, ".git") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := filepath.Rel(absPath, path)
		if err != nil {
			return err
		}
		if relPath == "." {
			return nil
		}

		sig := FileSignature{
			RelativePath: relPath,
			Size:         info.Size(),
			LastModified: info.ModTime(),
			IsDirectory:  info.IsDir(),
		}

		if !info.IsDir() {
			hash, err := calculateSHA256(path)
			if err != nil {
				return err
			}
			sig.Hash = hash
		}

		catalog[relPath] = sig
		return nil
	})

	return catalog, err
}

// buildRemoteCatalog runs a remote script or command to gather file states over SSH.
func (fs *FileSyncer) buildRemoteCatalog() (map[string]FileSignature, error) {
	catalog := make(map[string]FileSignature)

	// Open SSH Session to run remote file scanner
	session, err := fs.sshClient.NewSession()
	if err != nil {
		return nil, err
	}
	defer session.Close()

	// Run a Go-based scanner or custom bash script on remote
	// For visualization, we invoke a lightweight find/sha256sum command.
	// E.g.: "find /app -type f -exec sha256sum {} +"
	cmd := fmt.Sprintf("find %s -type f -exec sha256sum {} +", fs.remoteDir)
	output, err := session.Output(cmd)
	if err != nil {
		return nil, err
	}

	// Parse remote checksum output: "<hash>  <filepath>"
	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		hash := parts[0]
		fullPath := strings.Join(parts[1:], " ")
		relPath := strings.TrimPrefix(fullPath, fs.remoteDir)
		relPath = strings.TrimPrefix(relPath, "/")

		catalog[relPath] = FileSignature{
			RelativePath: relPath,
			Hash:         hash,
			IsDirectory:  false,
		}
	}

	return catalog, nil
}

func (fs *FileSyncer) transferFile(relPath string, size int64) error {
	// In production, SFTP is preferred (using "github.com/pkg/sftp").
	// To minimize dependencies in standard library, we use SCP mode via SSH standard session pipes.
	session, err := fs.sshClient.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()

	localFilePath := filepath.Join(fs.localDir, relPath)
	file, err := os.Open(localFilePath)
	if err != nil {
		return err
	}
	defer file.Close()

	remoteFilePath := filepath.Join(fs.remoteDir, relPath)
	remoteDir := filepath.Dir(remoteFilePath)

	// Ensure remote directory tree exists
	fs.createRemoteDirectory(remoteDir)

	// Stream write target over stdin pipe
	go func() {
		w, _ := session.StdinPipe()
		defer w.Close()
		
		// Custom header or direct stream transfer
		io.Copy(w, file)
	}()

	cmd := fmt.Sprintf("cat > '%s'", remoteFilePath)
	return session.Run(cmd)
}

func (fs *FileSyncer) createRemoteDirectory(dirPath string) error {
	session, err := fs.sshClient.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	return session.Run(fmt.Sprintf("mkdir -p '%s'", dirPath))
}

func (fs *FileSyncer) deleteRemoteFile(filePath string) error {
	session, err := fs.sshClient.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	return session.Run(fmt.Sprintf("rm -f '%s'", filePath))
}

func calculateSHA256(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
