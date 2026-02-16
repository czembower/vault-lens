# VaultLens

VaultLens is a full-stack TypeScript app for interacting with HashiCorp Vault using an LLM agent. It combines:

- Vault audit analysis (via `vault-audit-mcp`)
- Vault operational queries/actions (via `vault-mcp-server`)
- A React UI with streaming responses and session-scoped history

## Stack

- Frontend: React 18 + Vite
- Backend: Express + TypeScript (`tsx` in dev)
- LLM providers: Anthropic and OpenAI (selectable)
- MCP integration: stdio child-process clients for both MCP servers

## Architecture

- Browser client calls Express API (`/api/*` through Vite proxy in dev)
- Express server orchestrates tool execution through an LLM service
- Execution engine calls:
  - `vault-audit-mcp` (stdio)
  - `vault-mcp-server` (stdio)
- Vault authentication state is managed server-side (OIDC or token auth)

## Prerequisites

- Node.js 18+
- Built binaries (or runnable commands) for:
  - `vault-audit-mcp`
  - `vault-mcp-server`
- Vault cluster accessible from the backend
- Loki accessible if you use audit queries
- API key for selected LLM provider

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Configure `.env`.

## Environment Variables

- `LLM_PROVIDER`: `anthropic` (default) or `openai`
- `ANTHROPIC_API_KEY`: required when `LLM_PROVIDER=anthropic`
- `OPENAI_API_KEY`: required when `LLM_PROVIDER=openai`
- `OPENAI_MODEL`: OpenAI model name (runtime default: `gpt-5.2`)
- `VAULT_AUDIT_MCP_COMMAND`: command/path for audit MCP server (default `./vault-audit-mcp`)
- `VAULT_MCP_COMMAND`: command/path for Vault MCP server (default `./vault-mcp-server`)
- `LOKI_URL`: passed to `vault-audit-mcp` (default `http://localhost:3100`)
- `API_PORT`: backend port (default `3001`)
- `VITE_PORT`: frontend dev port (default `5173`)
- `VAULT_OIDC_REDIRECT_URI`: OIDC callback URL (default `http://localhost:8250/oidc/callback`)

Notes:
- `VAULT_MCP_URL` appears in `.env.example` but is not used by current server code.
- MCP servers are started as local processes via stdio, not HTTP URLs.

## Development

Run frontend and backend together:

```bash
npm run dev
```

- Backend: `http://localhost:3001` (or `API_PORT`)
- Frontend: `http://localhost:5173` (or `VITE_PORT`)

The frontend proxies `/api` to the backend.

## Build

```bash
npm run build
```

Outputs:
- Server build under `dist/server`
- Client build under `dist/client`

## API Endpoints

Base backend endpoints:

- `GET /health`
- `POST /query`
- `POST /query/stream` (SSE stream)
- `GET /history`
- `POST /history/clear`
- `GET /tokens`
- `GET /suggestions`
- `POST /suggestions/clear`
- `GET /activities`
- `POST /activities/clear`
- `GET /auth/status`
- `POST /auth/login`
- `POST /auth/oidc/auth-url`
- `POST /auth/oidc/complete`
- `POST /auth/switch-cluster`
- `POST /auth/logout`

Session behavior:
- Session ID is read from `X-Session-ID` header.
- If omitted, backend uses `default` session.
- Frontend generates and persists a session ID in `localStorage`.

## Authentication

VaultLens supports:

- OIDC login flow (popup + local callback)
- Direct token-based login

Current token handling:
- Tokens are cached in memory only (per cluster)
- Periodic renewal checks clear expiring tokens and require re-authentication
- Logout attempts token revocation (`revoke-self`) for OIDC-managed tokens

## What the Agent Can Use

Audit-side capabilities include:
- search/aggregate/trace audit events
- fetch detailed event data by `request_id`

Vault-side capabilities include many `vault-mcp-server` tools (for example namespace, mount, secret, policy, auth-method, replication, health, metrics, and lease inspection).

Exact available tools are determined by the connected MCP servers and current versions.

## Project Structure

```text
src/
  client/    React UI
  server/    Express API, auth manager, LLM services, MCP clients
```

## Scripts

- `npm run dev`
- `npm run dev:server`
- `npm run dev:client`
- `npm run build`
- `npm run build:server`
- `npm run build:client`
- `npm run preview`
- `npm run type-check`

## License

See `LICENSE`.
