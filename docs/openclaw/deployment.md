---
summary: "Complete Docker deployment guide for OpenClaw"
title: "Docker Deployment Guide"
---

# OpenClaw Docker Deployment Guide

This document provides comprehensive Docker deployment steps and configuration instructions for the OpenClaw project.

## Prerequisites

Before starting deployment, ensure your system meets the following requirements:

- **Docker Desktop** or **Docker Engine** + **Docker Compose v2**
- At least **2GB RAM** (required for image build; 1GB may cause OOM errors with exit code 137)
- Sufficient disk space for images and logs
- If running on a VPS or public host, review the [Network Exposure Security Hardening Guide](/gateway/security#04-network-exposure-bind--port--firewall)

## Deployment Methods

### Method 1: Quick Deployment (Recommended)

Use the automated script provided by the project for one-click deployment:

```bash
# 1. Navigate to project root directory
cd /path/to/openclaw

# 2. Run the automated deployment script
./docker-setup.sh
```

This script automatically performs the following operations:

1. Builds local Docker image (or pulls remote image)
2. Runs the onboarding wizard
3. Generates gateway token and writes it to `.env` file
4. Starts the gateway service

After deployment completes, you can:

- Open `http://127.0.0.1:18789/` in your browser
- Paste the generated token in settings
- To retrieve the access link again: `docker compose run --rm openclaw-cli dashboard --no-open`

### Method 2: Using Pre-built Images

If you don't want to build locally, use official pre-built images:

```bash
# Use GitHub Container Registry image
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./docker-setup.sh
```

Available image tags:

- `main` - Latest main branch build
- `latest` - Latest stable version
- `<version>` - Specific version (e.g., `2026.2.26`)

### Method 3: Manual Deployment

If you need more control, manually execute deployment steps:

```bash
# 1. Build image
docker build -t openclaw:local -f Dockerfile .

# 2. Run onboarding configuration
docker compose run --rm openclaw-cli onboard

# 3. Start gateway service
docker compose up -d openclaw-gateway
```

## Environment Variable Configuration

Before running `docker-setup.sh`, you can set the following environment variables to customize deployment:

### Basic Configuration

```bash
# Configuration directory (default: ~/.openclaw)
export OPENCLAW_CONFIG_DIR=/data/openclaw/.openclaw

# Workspace directory (default: ~/.openclaw/workspace)
export OPENCLAW_WORKSPACE_DIR=/data/openclaw/.openclaw/workspace

# Gateway port (default: 18789)
export OPENCLAW_GATEWAY_PORT=18789

# Bridge port (default: 18790)
export OPENCLAW_BRIDGE_PORT=18790

# Gateway bind mode (lan or loopback, default: lan)
export OPENCLAW_GATEWAY_BIND=lan
```

### Image Configuration

```bash
# Use remote image instead of local build
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# Install additional apt packages
export OPENCLAW_DOCKER_APT_PACKAGES="ffmpeg build-essential git"

# Pre-install extension dependencies (space-separated extension names)
export OPENCLAW_EXTENSIONS="diagnostics-otel matrix"
```

### Advanced Configuration

```bash
# Add extra mount directories (comma-separated)
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/github:/home/node/github:rw"

# Persist container home directory (using named volume)
export OPENCLAW_HOME_VOLUME="openclaw_home"

# Enable sandbox isolation (requires Docker CLI)
export OPENCLAW_SANDBOX=1

# Custom Docker socket path
export OPENCLAW_DOCKER_SOCKET=/var/run/docker.sock

# Allow insecure private WebSocket connections
export OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=true
```

## Accessing the Control Panel

After deployment completes, you can access the control panel:

1. Open `http://127.0.0.1:18789/` in your browser
2. Paste the generated token in the settings page (token is saved in the `.env` file as `OPENCLAW_GATEWAY_TOKEN`)

To retrieve the access link and token again:

```bash
docker compose run --rm openclaw-cli dashboard --no-open
```

## Configuring Message Channels

### WhatsApp (QR Code Login)

```bash
docker compose run --rm openclaw-cli channels login
```

### Telegram (Bot Token)

```bash
docker compose run --rm openclaw-cli channels add --channel telegram --token "<your-token>"
```

### Discord (Bot Token)

```bash
docker compose run --rm openclaw-cli channels add --channel discord --token "<your-token>"
```

For more channel configuration details, refer to:
- [WhatsApp Configuration](/channels/whatsapp)
- [Telegram Configuration](/channels/telegram)
- [Discord Configuration](/channels/discord)

## Common Management Commands

### Windows PowerShell Commands

In Windows PowerShell, some commands have different syntax:

```powershell
# Health check (alternative to curl)
Invoke-WebRequest -Uri "http://127.0.0.1:18789/healthz" -UseBasicParsing

# View environment variables
$env:OPENCLAW_GATEWAY_TOKEN

# Create directories
mkdir -p "path/to/directory"

# View service status
docker compose ps

# View logs
docker compose logs -f openclaw-gateway
```

### View Logs

```bash
# View gateway real-time logs
docker compose logs -f openclaw-gateway

# View last 100 lines of logs
docker compose logs --tail=100 openclaw-gateway
```

### Health Checks

```bash
# Liveness check (no authentication required)
curl -fsS http://127.0.0.1:18789/healthz

# Readiness check (no authentication required)
curl -fsS http://127.0.0.1:18789/readyz

# Complete health check (requires token)
docker compose exec openclaw-gateway node dist/index.js health --token "$OPENCLAW_GATEWAY_TOKEN"
```

### Device Management

```bash
# View device list
docker compose run --rm openclaw-cli devices list

# Approve device
docker compose run --rm openclaw-cli devices approve <requestId>
```

### Service Management

```bash
# Stop service
docker compose down

# Restart service
docker compose restart openclaw-gateway

# Rebuild and start
docker compose up -d --build openclaw-gateway
```

## Data Persistence

By default, configuration and workspace are mounted to host directories:

- **Configuration directory**: `~/.openclaw/` or `$OPENCLAW_CONFIG_DIR`
- **Workspace**: `~/.openclaw/workspace` or `$OPENCLAW_WORKSPACE_DIR`

Data in these directories will persist after container restarts or rebuilds.

### Persisting the Entire Container Home Directory

If you want to persist the entire `/home/node` directory (including browser cache, tool cache, etc.), use a named volume:

```bash
export OPENCLAW_HOME_VOLUME="openclaw_home"
./docker-setup.sh
```

### Adding Extra Mount Directories

If you need to mount other host directories into the container:

```bash
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/projects:/home/node/projects:rw"
./docker-setup.sh
```

Notes:
- Paths must be shared in Docker Desktop (macOS/Windows)
- Each entry format is `source:target[:options]`, cannot contain spaces, tabs, or newlines
- After modification, rerun `docker-setup.sh` to regenerate configuration

## Sandbox Isolation (Optional)

OpenClaw supports running tools in Docker containers for additional security isolation.

### Enable Sandbox

```bash
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

### Custom Docker Socket Path

For rootless Docker or custom installations:

```bash
export OPENCLAW_SANDBOX=1
export OPENCLAW_DOCKER_SOCKET=/run/user/1000/docker.sock
./docker-setup.sh
```

### Build Sandbox Images

```bash
# Build basic sandbox image
scripts/sandbox-setup.sh

# Build sandbox image with common tools (Node, Go, Rust, etc.)
scripts/sandbox-common-setup.sh

# Build browser sandbox image
scripts/sandbox-browser-setup.sh
```

For more sandbox configuration details, refer to the [Sandboxing Documentation](/gateway/sandboxing).

## Security Considerations

### Container Security

- Container runs as non-root user (`node`, uid 1000)
- Defaults to `lan` bind mode to support host access
- If running on a public VPS, configure firewall rules to restrict access
- Gateway token is stored in `.env` file, keep it secure

### Network Security

If deploying on a public server:

1. Use firewall to restrict port access
2. Consider using a reverse proxy (like Nginx) with HTTPS enabled
3. Regularly update tokens
4. Review the [Network Exposure Security Guide](/gateway/security#04-network-exposure-bind--port--firewall)

### File Permissions

The image runs as `node` user (uid 1000). If you encounter permission errors:

```bash
# Linux host
sudo chown -R 1000:1000 /path/to/openclaw-config /path/to/openclaw-workspace

# Or auto-fix in deployment script (already included in docker-setup.sh)
```

## Troubleshooting

### Permission Errors (EACCES)

If you see permission errors for `/home/node/.openclaw`:

```bash
# Fix configuration directory permissions (Linux)
sudo chown -R 1000:1000 $OPENCLAW_CONFIG_DIR $OPENCLAW_WORKSPACE_DIR

# Or use docker-setup.sh to auto-fix
./docker-setup.sh
```

### Connection Issues

If you see "unauthorized" or "disconnected (1008): pairing required" errors:

```bash
# Get new control panel link
docker compose run --rm openclaw-cli dashboard --no-open

# View device list
docker compose run --rm openclaw-cli devices list

# Approve device
docker compose run --rm openclaw-cli devices approve <requestId>
```

### Out of Memory

If you encounter OOM errors during build (exit code 137):

- Increase Docker available memory (at least 2GB)
- Use pre-built image instead of local build:
  ```bash
  export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
  ./docker-setup.sh
  ```

### Gateway Configuration Issues

#### Control UI Requires allowedOrigins Configuration

If you see the following error:
```
Gateway failed to start: Error: non-loopback Control UI requires gateway.controlUi.allowedOrigins
```

This occurs because the gateway binding to `lan` mode requires configured allowed origins. Usually the gateway configures this automatically, but if not, you can set it manually:

```bash
docker compose run --rm openclaw-cli config set gateway.controlUi.allowedOrigins '["http://localhost:18789","http://127.0.0.1:18789"]' --strict-json
```

#### Missing Configuration Error

If you see "Missing config" errors, it means the configuration file doesn't exist or the path is incorrect:

1. Confirm the path format in `.env` file is correct
2. Confirm configuration directories have been created
3. Re-run the onboard command

### Gateway Inaccessible

If host cannot access gateway port:

```bash
# Check bind mode
docker compose run --rm openclaw-cli config get gateway.bind

# Set to lan mode
docker compose run --rm openclaw-cli config set gateway.bind lan

# Restart gateway
docker compose restart openclaw-gateway
```

### View Detailed Logs

```bash
# View gateway logs
docker compose logs -f openclaw-gateway

# View container status
docker compose ps

# Check container health status
docker inspect openclaw-gateway | grep -A 10 Health
```

## Automation and CI/CD

For scripts and CI environments, disable TTY allocation to avoid interactive prompts:

```bash
# Use -T flag
docker compose run -T --rm openclaw-cli gateway probe
docker compose run -T --rm openclaw-cli devices list --json
```

## Updates and Maintenance

### Update to Latest Version

```bash
# Pull latest image
docker pull ghcr.io/openclaw/openclaw:latest

# Or rebuild local image
docker build -t openclaw:local -f Dockerfile .

# Restart service
docker compose up -d --force-recreate openclaw-gateway
```

### Backup Configuration

```bash
# Backup configuration directory
tar -czf openclaw-config-backup-$(date +%Y%m%d).tar.gz $OPENCLAW_CONFIG_DIR

# Backup workspace
tar -czf openclaw-workspace-backup-$(date +%Y%m%d).tar.gz $OPENCLAW_WORKSPACE_DIR
```

### Clean Up Old Data

```bash
# Clean unused images
docker image prune -a

# Clean unused volumes
docker volume prune

# Clean unused containers
docker container prune
```

## Performance Optimization

### Speed Up Image Build

Use BuildKit cache to speed up builds:

```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Build with cache
docker build --cache-from openclaw:local -t openclaw:local -f Dockerfile .
```

### Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
services:
  openclaw-gateway:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

## Production Deployment Recommendations

1. **Use Reverse Proxy**: Deploy Nginx or Traefik in front of the gateway
2. **Enable HTTPS**: Use Let's Encrypt certificates
3. **Configure Log Rotation**: Prevent log files from growing indefinitely
4. **Set Up Monitoring**: Use Prometheus + Grafana to monitor container status
5. **Regular Backups**: Automate configuration and workspace backups
6. **Use Orchestration Tools**: Consider Docker Swarm or Kubernetes for production deployment

## Related Documentation

- [Docker Installation Guide](/install/docker)
- [Sandbox Isolation](/gateway/sandboxing)
- [Gateway Security](/gateway/security)
- [Channel Configuration](/channels)
- [Device Management](/cli/devices)
- [Control Panel](/web/dashboard)

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review [GitHub Issues](https://github.com/openclaw/openclaw/issues)
3. Join the Discord community for help
4. View complete documentation: https://docs.openclaw.ai
