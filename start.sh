#!/bin/bash
# Quick start script for VaultLens
# Requirements: Node.js 18+, npm, and a Claude API key

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 VaultLens Quick Start"
echo "=============================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. You have $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi

echo "✅ npm $(npm -v) found"
echo ""

# Check .env file
if [ ! -f ".env" ]; then
    echo "📝 Setting up environment variables..."
    cp .env.example .env
    echo ""
    echo "⚠️  Please edit .env and add your ANTHROPIC_API_KEY:"
    echo "   nano .env"
    echo ""
    echo "   You'll need to add:"
    echo "   - ANTHROPIC_API_KEY=sk_... (from https://console.anthropic.com)"
    echo "   - VAULT_MCP_URL (where your Vault MCP server is running)"
    echo "   - VAULT_AUDIT_MCP_URL (where your audit server is)"
    echo ""
    exit 1
fi

# Check ANTHROPIC_API_KEY
if ! grep -q "ANTHROPIC_API_KEY=sk_" .env; then
    echo "❌ ANTHROPIC_API_KEY not set in .env"
    echo "   Please edit .env and add your Claude API key"
    exit 1
fi

echo "✅ Environment variables configured"
echo ""

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "✅ Dependencies installed"
echo ""

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run type-check
echo "✅ Type check passed"
echo ""

# Start servers
echo "🎯 Starting VaultLens..."
echo ""
echo "📍 Frontend:  http://localhost:3000"
echo "📍 Backend:   http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
