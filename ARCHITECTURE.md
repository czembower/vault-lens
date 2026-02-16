# VaultLens Architecture Diagrams

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         END USER                                     │
│                      (Web Browser)                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTP
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      VAULTLENS UI                             │
│                  (React + TypeScript)                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Chat Interface                                            │   │
│  │  - Natural language input                                  │   │
│  │  - Message history display                                │   │
│  │  - Tool call visualization                                │   │
│  │  - Result formatting                                      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                          :3000                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS/JSON
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                   VAULTLENS SERVER                            │
│               (Node.js + Express + TypeScript)                      │
│                          :3001                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  REST API Endpoints                                      │      │
│  │  - POST /query         (execute natural language query)  │      │
│  │  - GET /history        (retrieve query history)          │      │
│  │  - POST /history/clear (clear conversation history)      │      │
│  └──────────────────────────────────────────────────────────┘      │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────┐       │
│  │  Claude AI Agent (agent.ts)                            │       │
│  │                                                        │       │
│  │  1. Parse user query                                   │       │
│  │  2. Send to Claude with tool definitions               │       │
│  │  3. Claude decides which tools to call                 │       │
│  │  4. Parse Claude's tool_use responses                  │       │
│  │  5. Send tool calls to ExecutionEngine                 │       │
│  │  6. Send tool results back to Claude                   │       │
│  │  7. Loop until Claude stops using tools                │       │
│  │  8. Return final response to client                    │       │
│  └──────────────────────────┬──────────────────────────────┘       │
│                             │                                       │
│  ┌──────────────────────────▼──────────────────────────────┐       │
│  │  Execution Engine (execution-engine.ts)                │       │
│  │                                                        │       │
│  │  Routes tool calls to appropriate MCP servers:         │       │
│  │  - Audit tools → Vault Audit MCP                       │       │
│  │  - Vault tools → Vault MCP Server                      │       │
│  │                                                        │       │
│  │  Handles:                                              │       │
│  │  - Tool validation                                     │       │
│  │  - Request routing                                     │       │
│  │  - Response parsing                                    │       │
│  │  - Error handling                                      │       │
│  └──────────────────────────┬──────────────────────────────┘       │
│                             │                                       │
└─────────────────┬───────────┼──────────────────────────────┬────────┘
                  │           │                              │
         Stdio/HTTP           │                       Stdio/HTTP
                  │           │                              │
       ┌──────────▼──────┐    │    ┌──────────────────────────▼──────┐
       │  Vault Audit    │    │    │   Vault MCP Server              │
       │  MCP Server     │    │    │   (Port 8080)                   │
       │                 │    │    │                                 │
       │ - search_events │    │    │  - kv.read                      │
       │ - aggregate     │    │    │  - kv.write                     │
       │ - trace         │    │    │  - policy.list                  │
       │                 │    │    │  - auth operations              │
       │                 │    │    │  - transit operations           │
       │                 │    │    │  - And more...                  │
       └──────┬──────────┘    │    └──────────┬──────────────────────┘
              │               │               │
              │ Query         │               │ API Call
              │               │               │
       ┌──────▼──────┐        │        ┌──────▼─────────┐
       │    Loki     │        │        │  Vault Server  │
       │  (Audit     │        │        │  (Port 8200)   │
       │   Logs)     │        │        │                │
       └─────────────┘        │        └────────────────┘
                              │
                         (Not used
                          in query
                          execution)
```

## Query Execution Flow

```
User Types Query
       │
       ▼
┌─────────────────────────────────────────┐
│  POST /query                            │
│  {                                      │
│    "query": "Show errors in the        │
│              last 24 hours"             │
│  }                                      │
└──────────┬────────────────────────────┬─┘
           │                            │
           ▼                            ▼
    ┌─────────────────────┐    ┌─────────────────────┐
    │  Validate Request   │    │ Add to History      │
    │  Parse Parameters   │    │ Set Loading State   │
    └──────────┬──────────┘    └────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │         Send to Claude with System Prompt + Tools           │
    │                                                             │
    │   System Prompt: "You are VaultLens..."              │
    │   Tools:                                                    │
    │   - search_audit_events                                     │
    │   - aggregate_audit_events                                  │
    │   - trace_request                                           │
    │   - vault_operation                                         │
    │                                                             │
    │   Messages:                                                 │
    │   [...conversation history...]                             │
    │   User: "Show errors in the last 24 hours"                │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Claude Processes Query                                   │
    │                                                             │
    │    Thinks: "The user wants error events from the last      │
    │            24 hours. I should use                           │
    │            search_audit_events with                         │
    │            status=error and 24 hour window."               │
    │                                                             │
    │    Response: {                                              │
    │      "tool_use": {                                          │
    │        "id": "toolu_...",                                   │
    │        "name": "search_audit_events",                       │
    │        "input": {                                           │
    │          "status": "error",                                 │
    │          "start_rfc3339": "2024-02-08T...",               │
    │          "end_rfc3339": "2024-02-10T..."                  │
    │        }                                                    │
    │      }                                                      │
    │    }                                                        │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Convert Tool Use to ToolCall                             │
    │                                                             │
    │    {                                                        │
    │      "type": "audit",                                       │
    │      "tool": "audit.search_events",                         │
    │      "arguments": {                                         │
    │        "status": "error",                                   │
    │        "start_rfc3339": "...",                             │
    │        "end_rfc3339": "..."                                │
    │      }                                                      │
    │    }                                                        │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Execute Tool Call                                        │
    │                                                             │
    │    1. Route to Vault Audit MCP Server                       │
    │    2. Call: audit.search_events(status=error, ...)          │
    │    3. Receive: List of error audit events                   │
    │    4. Return to Claude as tool result                       │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Send Tool Result Back to Claude                          │
    │                                                             │
    │    {                                                        │
    │      "tool_result": {                                       │
    │        "tool_use_id": "toolu_...",                          │
    │        "content": "[{                                       │
    │          errors: [                                          │
    │            {operation: 'write', path: '/auth/...'},        │
    │            {operation: 'read', path: '/secret/...'},       │
    │            ...                                              │
    │          ]                                                  │
    │        }]"                                                  │
    │      }                                                      │
    │    }                                                        │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Claude Synthesizes Response                              │
    │                                                             │
    │    stop_reason: "end_turn" (no more tool calls)             │
    │                                                             │
    │    Response: "Found 15 errors in the last 24 hours:        │
    │    - 8 failed write operations                              │
    │    - 5 failed read operations                               │
    │    - 2 failed auth attempts                                 │
    │                                                             │
    │    Most common path: /auth/ldap/ with 5 errors"            │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Return to Client                                         │
    │                                                             │
    │    {                                                        │
    │      "query": "Show errors in the last 24 hours",          │
    │      "response": "Found 15 errors...",                      │
    │      "toolCalls": [{...}],                                  │
    │      "toolResults": [{...}],                                │
    │      "reasoning": "...",                                    │
    │      "timestamp": "2024-02-10T21:30:00Z"                   │
    │    }                                                        │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │    Display Response                                         │
    │                                                             │
    │    - Show Claude's response text                            │
    │    - Display tool calls (expandable)                        │
    │    - Display tool results (expandable)                      │
    │    - Add to message history                                 │
    │                                                             │
    │    User sees: Full response with all context!               │
    └─────────────────────────────────────────────────────────────┘
```

## Tool Definition to Execution

```
┌─────────────────────────────────────────────────────────┐
│  Agent Tool Definition (agent.ts)                       │
│                                                         │
│  {                                                      │
│    "name": "search_audit_events",                       │
│    "description": "Search Vault audit events...",       │
│    "input_schema": {                                    │
│      "type": "object",                                  │
│      "properties": {                                    │
│        "limit": { "type": "number" },                   │
│        "status": { "enum": ["ok", "error"] },          │
│        "start_rfc3339": { "type": "string" },          │
│        ...                                              │
│      }                                                  │
│    }                                                    │
│  }                                                      │
└──────────┬──────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Includes in tools[] Parameter                    │
│  Sends to: models/claude-3-5-sonnet-20241022            │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Decides:                                        │
│  "I should call search_audit_events because..."        │
│                                                         │
│  Returns tool_use block:                               │
│  {                                                      │
│    "type": "tool_use",                                  │
│    "id": "toolu_...",                                   │
│    "name": "search_audit_events",                       │
│    "input": {                                           │
│      "limit": 100,                                      │
│      "status": "error",                                 │
│      "start_rfc3339": "2024-02-08T..."                │
│    }                                                    │
│  }                                                      │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Execution Engine (execution-engine.ts)                 │
│                                                         │
│  Convert:                                               │
│  - Tool name mapping                                    │
│    search_audit_events → audit.search_events           │
│  - Create ToolCall:                                     │
│    {                                                    │
│      "type": "audit",                                   │
│      "tool": "audit.search_events",                    │
│      "arguments": { ...input }                          │
│    }                                                    │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Route to MCP Server                                    │
│                                                         │
│  - Identify: type = "audit"                            │
│  - Call: executeAuditTool("search_events", {...})      │
│  - Connect to Vault Audit MCP Server                   │
│  - Send request (stdio or HTTP)                        │
│  - Receive response                                     │
│  - Parse results                                        │
│  - Return ToolResult                                    │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Tool Result                                            │
│                                                         │
│  {                                                      │
│    "type": "audit",                                    │
│    "tool": "audit.search_events",                      │
│    "success": true,                                     │
│    "result": {                                          │
│      "events": [                                        │
│        {                                                │
│          "timestamp": "2024-02-10T...",                │
│          "operation": "write",                          │
│          "path": "/auth/ldap/...",                     │
│          "status": "error",                             │
│          "error": "permission denied"                   │
│        },                                               │
│        ...                                              │
│      ]                                                  │
│    }                                                    │
│  }                                                      │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Send Back to Claude                                    │
│                                                         │
│  Messages.push({                                        │
│    "role": "user",                                      │
│    "content": [{                                        │
│      "type": "tool_result",                             │
│      "tool_use_id": "toolu_...",                        │
│      "content": JSON.stringify(toolResult)              │
│    }]                                                   │
│  })                                                     │
│                                                         │
│  Call Claude again with updated messages                │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│  Claude Continues                                       │
│  Either:                                                │
│  1. Call another tool if needed                         │
│  2. Return final response if done                       │
└──────────────────────────────────────────────────────────┘
```

This shows how a natural language query flows through the system and gets executed!
