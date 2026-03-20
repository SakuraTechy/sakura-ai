---
summary: "Linux-specific Docker deployment guide for OpenClaw"
title: "Linux Docker Deployment"
---

# OpenClaw Linux Docker Deployment Guide

This guide provides Linux-specific instructions for deploying OpenClaw using Docker.

## Prerequisites

- **Linux Distribution**: Ubuntu 20.04+, Debian 11+, CentOS 8+, or similar
- **Docker Engine** 20.10+ or **Docker Desktop for Linux**
- **Docker Compose** v2.0+
- At least **2GB RAM** available for Docker
- **curl** and **git** (usually pre-installed)

## Quick Start

### Method 1: Automated Deployment (Recommended)

```bash
# Clone the repository
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Run the automated setup script
./docker-setup.sh
```

This script automatically:
1. Builds the Docker image locally (or pulls remote image if `OPENCLAW_IMAGE` is set)
2. Runs the onboarding wizard
3. Generates gateway token and writes it to `.env` file
4. Starts the gateway service

### Method 2: Using Pre-built Images

```bash
# Use official pre-built image
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./docker-setup.sh
```

Available image tags:
- `main` - Latest main branch build
- `latest` - Latest stable version
- `<version>` - Specific version (e.g., `2026.2.26`)

### Method 3: Manual Deployment

```bash
# Build image
docker build -t openclaw:local -f Dockerfile .

# Run onboarding
docker compose run --rm openclaw-cli onboard

# Start gateway
docker compose up -d openclaw-gateway
```

## Environment Configuration

### Basic Configuration

Create or modify `.env` file:

```bash
# OpenClaw .env configuration for Linux
OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw
OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=
OPENCLAW_IMAGE=openclaw:local
OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=true
```

### Advanced Configuration

```bash
# Use remote image instead of local build
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"

# Install additional system packages
export OPENCLAW_DOCKER_APT_PACKAGES="ffmpeg build-essential git curl"

# Pre-install extension dependencies
export OPENCLAW_EXTENSIONS="diagnostics-otel matrix"

# Add extra mount directories
export OPENCLAW_EXTRA_MOUNTS="$HOME/.codex:/home/node/.codex:ro,$HOME/projects:/home/node/projects:rw"

# Enable sandbox isolation
export OPENCLAW_SANDBOX=1
```

## Service Management

### Basic Commands

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f openclaw-gateway

# Restart services
docker compose restart openclaw-gateway

# Stop services
docker compose down

# Start services
docker compose up -d
```

### Health Checks

```bash
# Quick health check
curl -fsS http://127.0.0.1:18789/healthz

# Detailed health check
curl -fsS http://127.0.0.1:18789/readyz

# Full health report (requires token)
docker compose exec openclaw-gateway node dist/index.js health
```

### Configuration Management

```bash
# View current configuration
docker compose run --rm openclaw-cli config get

# Set configuration values
docker compose run --rm openclaw-cli config set gateway.bind lan
docker compose run --rm openclaw-cli config set gateway.mode local

# Get dashboard URL
docker compose run --rm openclaw-cli dashboard --no-open
```

## Channel Configuration

### WhatsApp (QR Code Login)

```bash
docker compose run --rm openclaw-cli channels login
```

### Telegram (Bot Token)

```bash
docker compose run --rm openclaw-cli channels add --channel telegram --token "<your-bot-token>"
```

### Discord (Bot Token)

```bash
docker compose run --rm openclaw-cli channels add --channel discord --token "<your-bot-token>"
```

## Data Persistence

### Default Directories

- **Configuration**: `~/.openclaw/`
- **Workspace**: `~/.openclaw/workspace/`

### Custom Mount Points

```bash
# Set custom directories
export OPENCLAW_CONFIG_DIR="/opt/openclaw/config"
export OPENCLAW_WORKSPACE_DIR="/opt/openclaw/workspace"

# Create directories with proper permissions
sudo mkdir -p /opt/openclaw/{config,workspace}
sudo chown -R $USER:$USER /opt/openclaw
```

### Persistent Home Directory

```bash
# Use named volume for entire container home
export OPENCLAW_HOME_VOLUME="openclaw_home"
./docker-setup.sh
```

## Security Configuration

### File Permissions

```bash
# Fix ownership for Docker user (uid 1000)
sudo chown -R 1000:1000 ~/.openclaw

# Or use your current user
sudo chown -R $USER:$USER ~/.openclaw
```

### Firewall Configuration (UFW)

```bash
# Allow gateway port
sudo ufw allow 18789/tcp

# Allow from specific network only
sudo ufw allow from 192.168.1.0/24 to any port 18789

# Check status
sudo ufw status
```

### Firewall Configuration (iptables)

```bash
# Allow gateway port
sudo iptables -A INPUT -p tcp --dport 18789 -j ACCEPT

# Allow from specific network only
sudo iptables -A INPUT -s 192.168.1.0/24 -p tcp --dport 18789 -j ACCEPT

# Save rules (Ubuntu/Debian)
sudo iptables-save > /etc/iptables/rules.v4
```

## Sandbox Configuration

### Enable Sandbox

```bash
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

### Build Sandbox Images

```bash
# Basic sandbox image
scripts/sandbox-setup.sh

# Sandbox with common tools (Node, Go, Rust, etc.)
scripts/sandbox-common-setup.sh

# Browser sandbox image
scripts/sandbox-browser-setup.sh
```

### Custom Docker Socket

```bash
# For rootless Docker
export OPENCLAW_DOCKER_SOCKET="/run/user/$(id -u)/docker.sock"
export OPENCLAW_SANDBOX=1
./docker-setup.sh
```

## System Service Integration

### Systemd Service (Optional)

Create a systemd service for automatic startup:

```bash
# Create service file
sudo tee /etc/systemd/system/openclaw.service > /dev/null <<EOF
[Unit]
Description=OpenClaw Gateway
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/path/to/openclaw
ExecStart=/usr/local/bin/docker-compose up -d openclaw-gateway
ExecStop=/usr/local/bin/docker-compose down
User=$USER
Group=$USER

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable openclaw.service
sudo systemctl start openclaw.service
```

## Performance Optimization

### Docker Daemon Configuration

Edit `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Hard": 64000,
      "Soft": 64000
    }
  }
}
```

### Resource Limits

Add to `docker-compose.yml`:

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

## Troubleshooting

### Common Issues

#### Permission Denied Errors

```bash
# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock

# Or add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

#### Port Already in Use

```bash
# Find process using port 18789
sudo lsof -i :18789

# Kill process if needed
sudo kill -9 <PID>
```

#### Out of Disk Space

```bash
# Clean up Docker resources
docker system prune -a

# Remove unused volumes
docker volume prune

# Check disk usage
df -h
docker system df
```

### Log Analysis

```bash
# View gateway logs
docker compose logs --tail=100 openclaw-gateway

# Follow logs in real-time
docker compose logs -f openclaw-gateway

# View system logs
journalctl -u docker.service -f
```

## Backup and Restore

### Backup Script

```bash
#!/bin/bash
# backup-openclaw.sh

BACKUP_DIR="/backup/openclaw-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Stop services
docker compose down

# Backup configuration
tar -czf "$BACKUP_DIR/config.tar.gz" -C "$HOME" .openclaw

# Backup Docker volumes
docker run --rm -v openclaw_data:/data -v "$BACKUP_DIR":/backup alpine tar czf /backup/volumes.tar.gz -C /data .

# Backup environment file
cp .env "$BACKUP_DIR/"

# Start services
docker compose up -d

echo "Backup completed: $BACKUP_DIR"
```

### Restore Script

```bash
#!/bin/bash
# restore-openclaw.sh

BACKUP_DIR="$1"
if [ -z "$BACKUP_DIR" ]; then
    echo "Usage: $0 <backup-directory>"
    exit 1
fi

# Stop services
docker compose down

# Restore configuration
tar -xzf "$BACKUP_DIR/config.tar.gz" -C "$HOME"

# Restore Docker volumes
docker run --rm -v openclaw_data:/data -v "$BACKUP_DIR":/backup alpine tar xzf /backup/volumes.tar.gz -C /data

# Restore environment file
cp "$BACKUP_DIR/.env" .

# Start services
docker compose up -d

echo "Restore completed from: $BACKUP_DIR"
```

## Monitoring

### Basic Monitoring

```bash
# Check container stats
docker stats

# Monitor logs
tail -f ~/.openclaw/logs/gateway.log

# Check disk usage
du -sh ~/.openclaw/
```

### Advanced Monitoring with Prometheus

Create `docker-compose.monitoring.yml`:

```yaml
version: '3.8'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Uninstallation

### Complete Removal

```bash
# Stop and remove containers
docker compose down -v

# Remove images
docker rmi openclaw:local
docker rmi $(docker images "ghcr.io/openclaw/openclaw" -q)

# Remove configuration
rm -rf ~/.openclaw

# Remove environment file
rm .env

# Remove systemd service (if created)
sudo systemctl stop openclaw.service
sudo systemctl disable openclaw.service
sudo rm /etc/systemd/system/openclaw.service
sudo systemctl daemon-reload
```

## Getting Help

- **Documentation**: https://docs.openclaw.ai
- **GitHub Issues**: https://github.com/openclaw/openclaw/issues
- **Discord Community**: Join for real-time support
- **Linux-specific issues**: Tag with `linux` label on GitHub

## Next Steps

1. Access the control panel at http://127.0.0.1:18789/
2. Configure your preferred messaging channels
3. Set up web search providers
4. Install additional skills and extensions
5. Configure security settings for your environment

For more advanced configuration, see the [main Docker documentation](./deployment.md).
