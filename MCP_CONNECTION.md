# Connecting MCP Servers to VaultLens

This guide explains how to connect VaultLens to the two MCP servers:
1. **Vault Audit MCP Server** - For querying audit logs
2. **Vault MCP Server** - For performing operations (running on port 8080)

## Current State

The application currently has **mock implementations** of tool execution. To make it fully functional, we need to connect to the real MCP servers.

## Option 1: Stdio-based MCP Communication (Recommended)

If the MCP servers expose a stdio interface (which is standard for MCP), you can communicate with them using child processes.

### Implementation for Audit MCP Server

Update `src/server/execution-engine.ts`:

```typescript
import { spawn } from 'child_process'
import { EventEmitter } from 'events'

private auditServerProcess: ChildProcess | null = null

private async ensureAuditServerConnection(): Promise<ChildProcess> {
  if (!this.auditServerProcess) {
    // Spawn the audit server process
    // Assuming it's at ../vault-audit-mcp/server
    this.auditServerProcess = spawn('./server', [], {
      cwd: '../vault-audit-mcp',
      env: { ...process.env, LOKI_URL: 'http://localhost:3100' }
    })
  }
  return this.auditServerProcess
}

private async executeAuditTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const process = await this.ensureAuditServerConnection()
    
    // Send MCP tool call via stdio
    const request = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: `audit.${tool.split('.')[1]}`,
        arguments: args
      }
    }
    
    process.stdin.write(JSON.stringify(request) + '\n')
    
    // Read response from stdout
    return new Promise((resolve) => {
      const handler = (data: Buffer) => {
        const response = JSON.parse(data.toString())
        if (response.id === request.id) {
          process.stdout.removeListener('data', handler)
          resolve({
            type: 'audit',
            tool,
            success: !response.error,
            result: response.result,
            error: response.error?.message
          })
        }
      }
      process.stdout.on('data', handler)
    })
  } catch (error) {
    return {
      type: 'audit',
      tool,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

### Implementation for Vault MCP Server

If the Vault MCP server runs on port 8080 and exposes a Web API or similar:

```typescript
private async executeVaultTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    // Option A: If Vault MCP server exposes HTTP
    const response = await fetch(`${this.vaultMcpUrl}/tools/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: tool,
        arguments: args
      })
    })
    
    const result = await response.json()
    return {
      type: 'vault',
      tool,
      success: !result.error,
      result: result.data,
      error: result.error
    }
  } catch (error) {
    return {
      type: 'vault',
      tool,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

## Option 2: Direct Vault API

If you want to call Vault directly instead of via MCP:

```typescript
import axios from 'axios'

private vaultClient = axios.create({
  baseURL: 'http://localhost:8200/v1',
  headers: {
    'X-Vault-Token': process.env.VAULT_TOKEN
  }
})

private async executeVaultTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const [operation, ...pathParts] = tool.split('.')
    const path = args.path as string
    
    let response
    switch (operation) {
      case 'read':
        response = await this.vaultClient.get(path)
        break
      case 'write':
        response = await this.vaultClient.post(path, args.data)
        break
      case 'delete':
        response = await this.vaultClient.delete(path)
        break
      case 'list':
        response = await this.vaultClient.request({
          method: 'LIST',
          url: path
        })
        break
      default:
        throw new Error(`Unknown operation: ${operation}`)
    }
    
    return {
      type: 'vault',
      tool,
      success: true,
      result: response.data.data
    }
  } catch (error) {
    return {
      type: 'vault',
      tool,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
```

## Option 3: MCP SDK Integration

If the MCP servers use the official MCP SDK, you can integrate directly:

```typescript
import { Client } from '@modelcontextprotocol/sdk-js'

private auditClient: Client | null = null

private async getAuditClient(): Promise<Client> {
  if (!this.auditClient) {
    this.auditClient = new Client(/* ... config ... */)
    await this.auditClient.connect()
  }
  return this.auditClient
}

private async executeAuditTool(
  tool: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const client = await this.getAuditClient()
  const result = await client.callTool({
    name: `audit.${tool}`,
    arguments: args
  })
  return {
    type: 'audit',
    tool,
    success: !result.error,
    result: result.data,
    error: result.error
  }
}
```

## Implementation Steps

### Step 1: Determine MCP Server Type

First, check how your MCP servers expose their interface:

```bash
# For vault-audit-mcp
cd ../vault-audit-mcp
./server --help  # Does it have CLI help?

# Does it respond to stdin?
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | ./server
```

### Step 2: Update ExecutionEngine

Modify `src/server/execution-engine.ts` based on the server type above.

### Step 3: Update Environment Variables

Add any required credentials to `.env`:

```
ANTHROPIC_API_KEY=sk_...
VAULT_TOKEN=hvs_...
VAULT_ADDR=http://localhost:8200
VAULT_MCP_URL=http://localhost:8080
VAULT_AUDIT_MCP_PATH=../vault-audit-mcp/server
```

### Step 4: Test Tool Execution

Add a test endpoint to verify tools work:

```bash
curl -X POST http://localhost:3001/test-tool \
  -H "Content-Type: application/json" \
  -d '{
    "type": "audit",
    "tool": "audit.search_events",
    "arguments": {"limit": 5}
  }'
```

## Debugging MCP Communication

Add logging to see what's happening:

```typescript
private async executeTool(toolCall: ToolCall): Promise<ToolResult> {
  console.log('📤 Sending tool call:', {
    type: toolCall.type,
    tool: toolCall.tool,
    arguments: toolCall.arguments
  })
  
  const result = await this.executeTool(toolCall)
  
  console.log('📥 Received result:', {
    type: result.type,
    tool: result.tool,
    success: result.success,
    result: result.result ? '✓ has data' : '✗ empty',
    error: result.error
  })
  
  return result
}
```

## Health Check Endpoints

Consider adding health check endpoints:

```typescript
app.get('/health/audit', async (req, res) => {
  try {
    const result = await executionEngine.executeTool({
      type: 'audit',
      tool: 'audit.search_events',
      arguments: { limit: 1 }
    })
    res.json({ status: result.success ? 'ok' : 'error', detail: result })
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message })
  }
})

app.get('/health/vault', async (req, res) => {
  try {
    const result = await executionEngine.executeTool({
      type: 'vault',
      tool: 'vault.read',
      arguments: { path: 'sys/version' }
    })
    res.json({ status: result.success ? 'ok' : 'error', detail: result })
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message })
  }
})
```

## Common Issues

### "Tool execution timed out"
- Increase timeout in ExecutionEngine
- Check if MCP servers are responding
- Verify network connectivity

### "Connection refused"
- Verify MCP servers are running
- Check ports and URLs in `.env`
- Check firewall rules

### "Error parsing MCP response"
- Verify response format (JSON-RPC)
- Add logging to see raw response
- Check MCP server logs

## Next: Choose Your Integration Path

Based on your Vault MCP server setup:
1. **If it's stdio-based**: Use Option 1
2. **If it's HTTP-based**: Use Option 2 or 3
3. **If it's unknown**: Start with stdio (MCP standard)

Let me know how your MCP servers are configured and I can provide more specific integration code!
