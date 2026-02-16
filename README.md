# VaultLens

An agent-powered web interface for querying and managing HashiCorp Vault, combining audit log exploration with vault operations.

## Overview

VaultLens is a full-stack application that:

1. **Provides a Browser UI** - Clean, modern chat-like interface for querying Vault
2. **Uses Claude as an Agent** - Understands natural language queries about your Vault instance
3. **Integrates with Two MCP Servers**:
   - **Vault Audit MCP Server** - For querying and analyzing audit logs
   - **Vault MCP Server** - For performing Vault operations (read/write secrets, manage policies, etc.)
4. **Orchestrates Tool Calls** - Intelligently decides which tools to invoke based on user queries
5. **Synthesizes Results** - Combines data from multiple sources into coherent responses

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Browser Client (React)                 │
│                                                           │
│  - Chat interface                                         │
│  - Query history                                          │
│  - Result visualization                                   │
└────────────────┬────────────────────────────────────────┘
                 │ HTTP / JSON
┌────────────────▼────────────────────────────────────────┐
│        Express Server (Node.js / TypeScript)             │
│                                                           │
│  - API endpoints                                          │
│  - Request handling                                       │
│  - Claude agent orchestration                             │
└────────┬──────────────────────────────┬──────────────────┘
         │                              │
    HTTP │ / Tool Calls                 │ / Tool Calls
         │                              │
┌────────▼────────────────────┐ ┌──────▼──────────────────┐
│  Vault Audit MCP Server      │ │ Vault MCP Server       │
│                              │ │                        │
│ - search_events              │ │ - Secrets management   │
│ - aggregate                  │ │ - Policy management    │
│ - trace                       │ │ - Auth operations      │
│                              │ │ - And more...          │
└─────────────────────────────┘ └────────────────────────┘
         │                              │
    Loki │ Query                   Vault │ API
         │                              │
    ┌────▼──────────┐         ┌─────────▼────────┐
    │ Loki Instance │         │ Vault Server     │
    │ (Audit Logs)  │         │ (Port 8200)      │
    └───────────────┘         │                  │
                              │ (Running on      │
                              │  port 8080 via   │
                              │  MCP Server)     │
                              └──────────────────┘
```

## Getting Started

### Prerequisites

1. **Node.js 18+** - For running the application
2. **Claude API Key** - From Anthropic (https://console.anthropic.com)
3. **Vault MCP Server** - Running on port 8080
4. **Vault Audit MCP Server** - Running and accessible
5. **Vault Instance** - With audit logs being generated to Loki

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   cd vaultlens
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add:
   - `ANTHROPIC_API_KEY`: Your Claude API key
   - `VAULT_MCP_URL`: Vault MCP server URL (default: http://localhost:8080)
   - `VAULT_AUDIT_MCP_URL`: Vault Audit MCP server URL
   - `API_PORT`: Backend API server port (default: 3001)
   - `VITE_PORT`: Frontend dev server port (default: 5173)

### Development

Start the development server (both frontend and backend):

```bash
npm run dev
```

This runs:
- **Backend**: TypeScript/Node.js server on port 3001
- **Frontend**: Vite dev server on port 3000 with proxy to backend

Then open http://localhost:3000 in your browser.

### Production Build

```bash
npm run build
```

This creates optimized builds for both server and client in the `dist/` directory.

## Usage

### Query Examples

Once the application is running, try queries like:

**Audit Log Queries:**
- "Show me all audit events from the last hour"
- "How many read operations were performed today?"
- "What errors occurred on the PKI mount?"
- "Were there any failed authentication attempts?"
- "Trace the request ID: abc-123-def-456"

**Vault Operations:**
- "Create a new secret at secret/app/config"
- "List all policies"
- "Read the token policy"
- "Show me secrets under secret/database/"

**Combined Queries:**
- "Find all failed operations in the last 24 hours and show me what they were trying to access"
- "Count operations by type and tell me which operations had errors"
- "Show me audit events for the transit engine and what paths were accessed"

### Features

- **Conversational Interface** - Ask questions in natural language
- **Tool Visibility** - See which tools the agent is calling and their parameters
- **Result Details** - View structured results and tool responses
- **Query History** - All conversations are tracked and can be reviewed
- **Clear History** - Start fresh at any time

## API Endpoints

### POST /query

Execute a query via the Claude agent.

**Request:**
```json
{
  "query": "Show me all audit events from the last hour"
}
```

**Response:**
```json
{
  "query": "Show me all audit events from the last hour",
  "response": "Based on the audit logs...",
  "toolCalls": [
    {
      "type": "audit",
      "tool": "audit.search_events",
      "arguments": { "limit": 100 }
    }
  ],
  "toolResults": [
    {
      "type": "audit",
      "tool": "audit.search_events",
      "success": true,
      "result": [...audit events...]
    }
  ],
  "reasoning": "The user asked for audit events...",
  "timestamp": "2024-02-10T21:30:00Z"
}
```

### GET /history

Retrieve the query history.

**Response:**
```json
{
  "history": [
    { ...QueryResult... },
    { ...QueryResult... }
  ]
}
```

### POST /history/clear

Clear all query history.

**Response:**
```json
{
  "success": true
}
```

## Project Structure

```
vaultlens/
├── src/
│   ├── server/
│   │   ├── index.ts              # Express app setup
│   │   ├── agent.ts              # Claude agent service
│   │   └── execution-engine.ts   # Tool execution orchestration
│   └── client/
│       ├── main.tsx              # React entry point
│       ├── App.tsx               # Main component
│       └── App.css               # Styles
├── dist/                          # Compiled output
├── index.html                     # HTML entry point
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite config
├── .env.example                   # Environment variable template
└── README.md                       # This file
```

## Tool Integration Details

### Vault Audit MCP Server Tools

The agent has access to these audit tools:

- **search_audit_events** - Search events with filters
  - Parameters: limit, namespace, operation, mount_type, status, start_rfc3339, end_rfc3339
  
- **aggregate_audit_events** - Count events by dimension
  - Parameters: by (vault_namespace|vault_operation|vault_mount_type|vault_status), filters
  
- **trace_request** - Trace events for a specific request
  - Parameters: request_id, limit

### Vault MCP Server Tools

The agent can call Vault operations:

- **vault_operation** - Perform any Vault operation
  - Parameters: operation, path, data (for writes)

## Troubleshooting

### Claude API Key Not Working
- Verify `ANTHROPIC_API_KEY` is set in `.env`
- Check that the key is valid at https://console.anthropic.com
- Ensure the key has appropriate usage limits

### Can't Connect to Vault MCP Server
- Check that Vault MCP server is running on port 8080
- Verify `VAULT_MCP_URL` in `.env`
- Check firewall and network connectivity

### Can't Connect to Audit MCP Server
- Verify the audit server is running
- Check `VAULT_AUDIT_MCP_URL` in `.env`
- Ensure Loki is accessible and has audit data

### Empty Query Results
- Verify Vault is generating audit logs
- Check that logs are reaching Loki
- Try more specific filters in your query
- See [vault-audit-mcp TESTING.md](../vault-audit-mcp/TESTING.md) for debugging

## Development

### Type Checking

```bash
npm run type-check
```

### Building

```bash
npm run build:server   # TypeScript compilation
npm run build:client   # Vite build
```

## Next Steps

1. **Implement Real MCP Connection**
   - Currently using mock implementations
   - Connect to actual Vault MPC server and Audit MCP server
   - Handle stdio/HTTP communication

2. **Add More Tools**
   - Vault auth methods
   - Certificate management
   - Replication commands
   - Identity management

3. **Enhance UI**
   - Better formatting for different result types
   - Charts and graphs for audit statistics
   - Advanced filtering UI

4. **Add Persistence**
   - Save conversation history to database
   - User authentication
   - Per-user history and preferences

5. **Monitoring and Logging**
   - Comprehensive audit logging of agent actions
   - Performance metrics
   - Error tracking

## License

See [LICENSE](LICENSE)
