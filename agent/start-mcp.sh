#!/bin/bash
# MCP Server Startup Script
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Load environment variables if .env exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set dbt password environment variable (used in profiles.yml)
export DBT_SQL_PASSWORD="${DBT_SQL_PASSWORD:-Felldl1304#1988#}"

cd /Users/daniel/source/datavault-dbt/agent
node dist/mcp-server.js
