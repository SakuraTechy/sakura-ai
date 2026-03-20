---
summary: "Windows-specific Docker deployment guide for OpenClaw"
title: "Windows Docker Deployment"
---

# OpenClaw Windows Docker Deployment Guide

This guide provides Windows-specific instructions for deploying OpenClaw using Docker Desktop.

## Prerequisites

- **Windows 10/11** with WSL2 enabled
- **Docker Desktop for Windows** with WSL2 backend
- **PowerShell 5.1+** or **PowerShell Core 7+**
- At least **2GB RAM** available for Docker
- **Git for Windows** (optional, for cloning the repository)

## Quick Start

### Step 1: Clone Repository (if needed)

```powershell
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

### Step 2: Create Environment File

Create a `.env` file in the project root with Windows-specific paths:

```powershell
# Copy from example and edit
Copy-Item .env.example .env
```

Edit the `.env` file with your Windows paths:

```bash
# OpenClaw .env configuration for Windows
OPENCLAW_CONFIG_DIR=D:/your/project/path/.openclaw
OPENCLAW_WORKSPACE_DIR=D:/your/project/path/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=
OPENCLAW_IMAGE=openclaw:local
OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=true
```

**Important**: Replace `D:/your/project/path` with your actual project directory path using forward slashes.

### Step 3: Create Configuration Directories

```powershell
# Create required directories
$configDir = "D:/your/project/path/.openclaw"
$workspaceDir = "$configDir/workspace"

New-Item -ItemType Directory -Path $configDir -Force
New-Item -ItemType Directory -Path $workspaceDir -Force
```

### Step 4: Fix Docker Compose Configuration

If you encounter network namespace issues, edit `docker-compose.yml`:

Find the `openclaw-cli` service and change:
```yaml
openclaw-cli:
  network_mode: "service:openclaw-gateway"
```

To:
```yaml
openclaw-cli:
  networks:
    - openclaw-network
```

### Step 5: Build and Deploy

```powershell
# Build the Docker image
docker build -t openclaw:local -f Dockerfile .

# Run onboarding
docker compose run --rm openclaw-cli onboard --mode local --no-install-daemon

# Configure gateway for Docker environment
docker compose run --rm openclaw-cli config set gateway.mode local
docker compose run --rm openclaw-cli config set gateway.bind lan

# Start the gateway
docker compose up -d openclaw-gateway
```

### Step 6: Verify Deployment

```powershell
# Check service status
docker compose ps

# Test health endpoint
Invoke-WebRequest -Uri "http://127.0.0.1:18789/healthz" -UseBasicParsing

# Get dashboard URL
docker compose run --rm openclaw-cli dashboard --no-open
```

## Windows-Specific Commands

### PowerShell Equivalents

| Task | Linux/macOS | Windows PowerShell |
|------|-------------|-------------------|
| Health check | `curl -fsS http://127.0.0.1:18789/healthz` | `Invoke-WebRequest -Uri "http://127.0.0.1:18789/healthz" -UseBasicParsing` |
| View environment variable | `echo $OPENCLAW_GATEWAY_TOKEN` | `$env:OPENCLAW_GATEWAY_TOKEN` |
| Create directory | `mkdir -p path/to/dir` | `New-Item -ItemType Directory -Path "path/to/dir" -Force` |
| Copy file | `cp source dest` | `Copy-Item source dest` |

### Service Management

```powershell
# Start services
docker compose up -d

# Stop services
docker compose down

# Restart gateway
docker compose restart openclaw-gateway

# View logs
docker compose logs -f openclaw-gateway

# View last 50 log lines
docker compose logs --tail=50 openclaw-gateway
```

### Configuration Management

```powershell
# View current configuration
docker compose run --rm openclaw-cli config get

# Set configuration values
docker compose run --rm openclaw-cli config set gateway.bind lan
docker compose run --rm openclaw-cli config set gateway.mode local

# Get dashboard URL
docker compose run --rm openclaw-cli dashboard --no-open
```

## Common Windows Issues and Solutions

### Issue 1: Network Namespace Error

**Error:**
```
failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to create new parent process: namespace path: lstat /proc/xxxxx/ns/net: no such file or directory
```

**Solution:**
Modify `docker-compose.yml` to use independent networking for the CLI service:

```yaml
openclaw-cli:
  networks:
    - openclaw-network
  # Remove: network_mode: "service:openclaw-gateway"
```

### Issue 2: Path Format Problems

**Error:**
```
The "OPENCLAW_CONFIG_DIR" variable is not set. Defaulting to a blank string.
invalid spec: :/home/node/.openclaw: empty section between colons
```

**Solution:**
Ensure paths in `.env` use forward slashes:
- ✅ Correct: `D:/path/to/directory`
- ❌ Incorrect: `D:\path\to\directory`

### Issue 3: Control UI Access Error

**Error:**
```
Gateway failed to start: Error: non-loopback Control UI requires gateway.controlUi.allowedOrigins
```

**Solution:**
The gateway should auto-configure this, but if not:

```powershell
docker compose run --rm openclaw-cli config set gateway.controlUi.allowedOrigins '["http://localhost:18789","http://127.0.0.1:18789"]' --strict-json
```

### Issue 4: Docker Desktop WSL2 Issues

**Symptoms:**
- Slow performance
- Mount issues
- Network connectivity problems

**Solutions:**
1. Ensure WSL2 is properly configured:
   ```powershell
   wsl --set-default-version 2
   wsl --list --verbose
   ```

2. Allocate sufficient resources in Docker Desktop settings:
   - Memory: At least 2GB
   - CPU: At least 2 cores

3. Enable file sharing for your project directory in Docker Desktop settings.

### Issue 5: PowerShell Execution Policy

**Error:**
```
cannot be loaded because running scripts is disabled on this system
```

**Solution:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Windows Performance Tips

### 1. Use WSL2 Backend
Ensure Docker Desktop is using WSL2 backend for better performance:
- Open Docker Desktop Settings
- Go to General → Use the WSL 2 based engine

### 2. Store Project in WSL2 Filesystem
For better performance, consider storing the project in WSL2 filesystem:
```bash
# In WSL2 terminal
cd /home/username
git clone https://github.com/openclaw/openclaw.git
```

### 3. Optimize Docker Desktop Resources
- Memory: 4GB+ recommended
- CPU: 4+ cores recommended
- Disk image size: 64GB+ recommended

## Accessing from Other Devices

If you want to access OpenClaw from other devices on your network:

1. **Find your Windows machine's IP address:**
   ```powershell
   ipconfig | Select-String "IPv4"
   ```

2. **Configure allowed origins:**
   ```powershell
   docker compose run --rm openclaw-cli config set gateway.controlUi.allowedOrigins '["http://localhost:18789","http://127.0.0.1:18789","http://YOUR_IP:18789"]' --strict-json
   ```

3. **Ensure Windows Firewall allows the connection:**
   ```powershell
   New-NetFirewallRule -DisplayName "OpenClaw Gateway" -Direction Inbound -Protocol TCP -LocalPort 18789 -Action Allow
   ```

## Backup and Restore

### Backup Configuration

```powershell
# Create backup directory
$backupDir = "D:/openclaw-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $backupDir -Force

# Backup configuration
Copy-Item -Recurse $env:OPENCLAW_CONFIG_DIR "$backupDir/config"

# Backup workspace
Copy-Item -Recurse $env:OPENCLAW_WORKSPACE_DIR "$backupDir/workspace"

# Backup environment file
Copy-Item .env "$backupDir/.env"
```

### Restore Configuration

```powershell
# Stop services
docker compose down

# Restore from backup
$backupDir = "D:/openclaw-backup-20260310-160000"  # Replace with your backup directory
Copy-Item -Recurse "$backupDir/config/*" $env:OPENCLAW_CONFIG_DIR -Force
Copy-Item -Recurse "$backupDir/workspace/*" $env:OPENCLAW_WORKSPACE_DIR -Force
Copy-Item "$backupDir/.env" .env -Force

# Start services
docker compose up -d
```

## Uninstallation

To completely remove OpenClaw:

```powershell
# Stop and remove containers
docker compose down -v

# Remove images
docker rmi openclaw:local
docker rmi $(docker images "ghcr.io/openclaw/openclaw" -q)

# Remove configuration directories
Remove-Item -Recurse -Force $env:OPENCLAW_CONFIG_DIR
Remove-Item -Recurse -Force $env:OPENCLAW_WORKSPACE_DIR

# Remove environment file
Remove-Item .env
```

## Getting Help

- **Documentation**: https://docs.openclaw.ai
- **GitHub Issues**: https://github.com/openclaw/openclaw/issues
- **Discord Community**: Join for real-time help
- **Windows-specific issues**: Tag issues with `windows` label on GitHub

## Next Steps

After successful deployment:

1. **Access the Control Panel**: Open the dashboard URL in your browser
2. **Configure Channels**: Set up Telegram, Discord, or WhatsApp integration
3. **Add Skills**: Install additional capabilities as needed
4. **Configure Security**: Review security settings for your use case
5. **Set up Backup**: Implement regular backup procedures

For detailed configuration options, see the main [Docker Deployment Guide](./deployment.md).
