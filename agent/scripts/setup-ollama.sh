#!/bin/bash
# Setup Ollama for Data Vault dbt Agent RAG
# This script installs Ollama and pulls the nomic-embed-text model

set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Ollama Setup for Data Vault dbt Agent"
echo "═══════════════════════════════════════════════════════════"

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    echo "✓ Ollama is already installed"
    ollama --version
else
    echo "📦 Installing Ollama..."
    curl -fsSL https://ollama.ai/install.sh | sh
    echo "✓ Ollama installed successfully"
fi

# Check if Ollama service is running
if ! pgrep -x "ollama" > /dev/null; then
    echo "🚀 Starting Ollama service..."
    # Try systemctl first, then direct start
    if systemctl is-enabled ollama &> /dev/null 2>&1; then
        sudo systemctl start ollama
    else
        # Start in background
        ollama serve &
        sleep 3
    fi
fi

echo ""
echo "📥 Pulling embedding model: nomic-embed-text"
echo "   (768 dimensions, 8192 context window)"
echo ""

ollama pull nomic-embed-text

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Verifying Installation"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "📋 Installed models:"
ollama list

echo ""
echo "🧪 Testing embedding generation..."
RESULT=$(curl -s http://localhost:11434/api/embeddings -d '{
  "model": "nomic-embed-text",
  "prompt": "Test embedding for Data Vault"
}' | head -c 200)

if [[ $RESULT == *"embedding"* ]]; then
    echo "✓ Embedding test successful!"
else
    echo "⚠️  Embedding test failed. Response:"
    echo "$RESULT"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Setup Complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Ollama is ready for use with the Data Vault dbt Agent."
echo ""
echo "API Endpoint: http://localhost:11434"
echo "Model: nomic-embed-text (768 dimensions)"
echo ""
echo "To test manually:"
echo "  curl http://localhost:11434/api/embeddings -d '{"
echo "    \"model\": \"nomic-embed-text\","
echo "    \"prompt\": \"Your text here\""
echo "  }'"
echo ""
