#!/bin/bash
# Install and configure the Data Vault dbt Agent systemd service

set -e

SERVICE_NAME="datavault-agent"
SERVICE_FILE="/home/user/projects/datavault-dbt/agent/scripts/datavault-agent.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "═══════════════════════════════════════════════════════════"
echo "  Data Vault dbt Agent - Service Installation"
echo "═══════════════════════════════════════════════════════════"

# Check if running as root or with sudo
if [[ $EUID -ne 0 ]]; then
    echo "This script must be run with sudo"
    echo "Usage: sudo ./install-service.sh"
    exit 1
fi

# Ensure data directory exists
echo "📁 Creating data directory..."
mkdir -p /home/user/projects/datavault-dbt/agent/data
chown user:user /home/user/projects/datavault-dbt/agent/data

# Build TypeScript first (using user's node via nvm)
echo "🔨 Building TypeScript..."
cd /home/user/projects/datavault-dbt/agent
sudo -u user bash -c 'source ~/.nvm/nvm.sh && npm run build'

# Copy schema.sql to dist
echo "📋 Copying schema.sql..."
mkdir -p /home/user/projects/datavault-dbt/agent/dist/memory
cp /home/user/projects/datavault-dbt/agent/memory/schema.sql /home/user/projects/datavault-dbt/agent/dist/memory/

# Copy service file
echo "📋 Installing systemd service..."
cp "$SERVICE_FILE" "$SYSTEMD_DIR/$SERVICE_NAME.service"

# Reload systemd
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable service
echo "✅ Enabling service..."
systemctl enable "$SERVICE_NAME"

# Start service
echo "🚀 Starting service..."
systemctl start "$SERVICE_NAME"

# Show status
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Installation Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
systemctl status "$SERVICE_NAME" --no-pager
echo ""
echo "Useful commands:"
echo "  systemctl status $SERVICE_NAME     # Check status"
echo "  systemctl restart $SERVICE_NAME    # Restart service"
echo "  systemctl stop $SERVICE_NAME       # Stop service"
echo "  journalctl -u $SERVICE_NAME -f     # View logs"
echo ""
