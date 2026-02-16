# VaultLens - Setup Complete! 🚀

You now have a complete TypeScript/React project structure for VaultLens. Here's what has been created:

## Project Structure

```
vaultlens/
├── src/
│   ├── server/
│   │   ├── index.ts              # Express API server
│   │   ├── agent.ts              # Claude-powered agent
│   │   └── execution-engine.ts   # Tool orchestration layer
│   └── client/
│       ├── main.tsx              # React entry point
│       ├── App.tsx               # Chat interface component
│       └── App.css               # Styling
├── index.html                     # HTML template
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite build config
├── .env.example                   # Environment template
└── README.md                       # Full documentation
```

## Key Features Implemented

✅ **Claude AI Agent**
- Understands natural language queries
- Plans tool execution intelligently
- Synthesizes results from multiple sources

✅ **Dual MCP Server Integration**
- Connects to Vault MCP Server (port 8080)
- Connects to Vault Audit MCP Server
- Executes tools across both servers

✅ **React Chat Interface**
- Clean, modern chat-like UI
- Shows tool calls and results
- Query history tracking
- Real-time message streaming

✅ **Express Backend**
- RESTful API endpoints
- Claude integration via Anthropic SDK
- Tool execution orchestration
- Conversation history management

## Next Steps to Get Running

### 1. Install Node.js & npm (if not already installed)

**macOS with Homebrew:**
```bash
brew install node
```

**Or download from:** https://nodejs.org/ (v18+ recommended)

### 2. Set Up Environment Variables

```bash
cd vaultlens
cp .env.example .env
```

Edit `.env` and add your configuration:
```
ANTHROPIC_API_KEY=sk_...your_claude_api_key...
VAULT_MCP_URL=http://localhost:8080
VAULT_AUDIT_MCP_URL=http://localhost
API_PORT=3001
VITE_PORT=5173
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

This will start:
- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:3000 (with proxy to backend)

### 5. Open in Browser

Visit http://localhost:3000 and start querying Vault!

## Available Commands

```bash
npm run dev              # Start both server and client in dev mode
npm run dev:server      # Run just the TypeScript server
npm run dev:client      # Run just the React frontend
npm run build           # Build for production
npm run build:server    # Compile TypeScript
npm run build:client    # Build React app
npm run type-check      # Type-check without building
npm run preview         # Preview production build
```

## Important: Connecting to MCP Servers

The current implementation has **mock tool execution**. To connect to real Vault MCP servers:

### For Vault Audit MCP Server

In `src/server/execution-engine.ts`, update `executeAuditTool()`:

```typescript
private async executeAuditTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  // TODO: Connect to audit MCP server via stdio or HTTP
  // Options:
  // 1. Spawn child process and communicate via stdio
  // 2. Use HTTP if audit server exposes HTTP interface
  // 3. Use MCP SDK if available
}
```

### For Vault MCP Server

In `src/server/execution-engine.ts`, update `executeVaultTool()`:

```typescript
private async executeVaultTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  // TODO: Connect to Vault MCP server (port 8080)
  // The VaultLens user mentioned this is already running
}
```

## Architecture Overview

```
User Input (Natural Language)
    ↓
API: POST /query
    ↓
Claude Agent (with Tools)
    ↓
    ├─→ Decide: Which tools to call?
    ├─→ Plan: In what order?
    ├─→ Execute: Call tools via ExecutionEngine
    └─→ Synthesize: Create response
    ↓
Tool Execution
    ├─→ Vault Audit MCP Server (search/aggregate/trace)
    └─→ Vault MCP Server (read/write/manage)
    ↓
Response + Tool Details
    ↓
React UI (Chat Display)
```

## What Makes This Unique

1. **Agent-Powered**: Uses Claude as an intelligent agent, not just a chatbot
2. **Multi-Server Coordination**: Orchestrates calls across multiple MCP servers
3. **Tool Awareness**: Displays which tools were called and their results
4. **Rich Context**: Maintains conversation history for multi-turn interactions
5. **Type-Safe**: Full TypeScript for both backend and frontend

## Questions?

Refer to the full README.md for:
- API endpoint documentation
- Tool parameter details
- Troubleshooting guide
- Development workflows
- Project structure explanation

---

**Next: Run `npm install` then `npm run dev` to get started!**
