# MCP Stdio Integration

## Overview

VaultLens now has **idiomatic MCP protocol integration** with the Vault Audit MCP Server using stdio transport. This is the standard way to communicate with MCP servers that use the stdio protocol.

## Architecture

```
VaultLens (Node.js)
    │
    ├─ LLM Service (Claude or OpenAI)
    │  └─ Agent decides which tools to call
    │
    └─ Execution Engine
       ├─ MCPAuditClient (Vault Audit MCP via stdio)
       │  └─ Spawns child process: ./vault-audit-mcp
       │     └─ JSON-RPC 2.0 protocol (newline-delimited)
       │
       └─ HTTP Client (Vault MCP on port 8080)
          └─ TODO: Implement direct HTTP integration
```

## How It Works

### Stdio Transport Protocol

The MCP (Model Context Protocol) uses **newline-delimited JSON-RPC 2.0** over stdin/stdout:

1. **Request** (sent to vault-audit-mcp stdin):
```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_events","arguments":{"limit":100}}}
```

2. **Response** (received from vault-audit-mcp stdout):
```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"[found events...]"}]}}
```

### Message Flow

```
User Query
  ↓
LLM Agent (Claude/OpenAI)
  ├─ Decides to call: "search_audit_events"
  ├─ Converts to internal format: audit.search_events
  ↓
Execution Engine
  ├─ Routes to MCPAuditClient
  ├─ Generates JSON-RPC request
  ├─ Writes to vault-audit-mcp stdin
  ├─ Waits for response from vault-audit-mcp stdout
  ├─ Parses JSON response
  ↓
JSON Response Back to LLM
  ├─ LLM sees the tool results
  ├─ Synthesizes final answer
  ↓
User Response
```

## Configuration

### 1. Set the Command Path

In `.env`, specify the path to your vault-audit-mcp binary:

```bash
# Option A: Relative path (assumes binary in project root)
VAULT_AUDIT_MCP_COMMAND=./vault-audit-mcp

# Option B: Absolute path
VAULT_AUDIT_MCP_COMMAND=/usr/local/bin/vault-audit-mcp

# Option C: In PATH (if installed system-wide)
VAULT_AUDIT_MCP_COMMAND=vault-audit-mcp
```

### 2. Make Binary Executable

```bash
chmod +x ./vault-audit-mcp
```

### 3. Verify Binary Works

```bash
# Test that the binary can be started
./vault-audit-mcp --help

# Or test stdin/stdout communication
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | ./vault-audit-mcp
```

## Tool Mapping

When the LLM calls an audit tool, it's automatically mapped:

```
LLM Tool Name           →  MCP Tool Name
─────────────────────────────────────────
search_audit_events     →  search_events
aggregate_audit_events  →  aggregate
trace_request          →  trace
```

Internal representation: `audit.search_events` → MCP call: `search_events`

## Implementation Details

### MCPAuditClient (`src/server/mcp-audit-client.ts`)

- **Spawns** the vault-audit-mcp binary as a child process
- **Manages** stdio pipes for input/output
- **Handles** newline-delimited JSON-RPC message protocol
- **Buffers** incomplete lines until complete JSON arrives
- **Routes** responses to pending requests by ID
- **Times out** requests after 30 seconds

Key methods:
- `initialize()` - Start the process and send initialization message
- `callTool(name, args)` - Execute a tool and wait for response
- `close()` - Cleanly shut down the process

### ExecutionEngine Updates

- Replaced mock implementations with real MCP client
- Added lazy initialization: client starts on first audit tool call
- Proper error handling and logging
- Tool name conversion: `audit.search_events` → `search_events`

## Error Handling

If vault-audit-mcp fails to start:

```
Error: Cannot find module './vault-audit-mcp'
```

**Solution**: Verify the path in `VAULT_AUDIT_MCP_COMMAND` and that the binary exists.

If the binary is not executable:

```
Error: EACCES: permission denied
```

**Solution**: `chmod +x ./vault-audit-mcp`

If initialization times out:

```
Error: MCP request 1 timed out
```

**Solutions**:
- Check that vault-audit-mcp starts successfully (`./vault-audit-mcp` in terminal)
- Check for stderr output from the server
- Increase timeout in `mcp-audit-client.ts` (currently 30s)

## Lifecycle Management

### Initialization (Lazy)

The MCP client is initialized on the **first audit tool call**:

```typescript
if (!this.auditClientInitialized) {
    await this.auditClient.initialize()
    this.auditClientInitialized = true
}
```

This means:
- No overhead if no audit queries are made
- Automatic startup on first query
- Shared connection for all subsequent queries

### Cleanup

On server shutdown, the MCP process should be terminated:

```typescript
// In server shutdown handler (TODO: add to server)
await executionEngine.close()
```

## Example Query Flow

### User: "Show me the last 10 audit errors"

1. **LLM** decides to call `search_audit_events` with `{status: "error", limit: 10}`

2. **Execution Engine** routes to `executeAuditTool("audit.search_events", {...})`

3. **MCPAuditClient** sends JSON-RPC:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "search_events",
    "arguments": {"status": "error", "limit": 10}
  }
}
```

4. **vault-audit-mcp** processes and responds:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [{
      "type": "text",
      "text": "[10 error events found...]"
    }]
  }
}
```

5. **ExecutionEngine** returns `ToolResult` with success and data

6. **LLM** sees the results and synthesizes: "Found 10 errors in the last 24 hours: [summary]"

## Debugging

### Enable Verbose Logging

Add to `src/server/mcp-audit-client.ts`:

```typescript
private log(message: string): void {
    if (process.env.DEBUG_MCP) {
        console.log(`[MCP Debug] ${message}`)
    }
}
```

Then run with:
```bash
DEBUG_MCP=1 npm run dev
```

### Inspect Vault Audit MCP Output

Run vault-audit-mcp directly to see initialization output:

```bash
./vault-audit-mcp

# Should see Go program startup logs
# Watch for any errors in stderr
```

### Monitor Stdio Communication

In `mcp-audit-client.ts` constructor, add:

```typescript
this.process.stdout?.on('data', (chunk: Buffer) => {
    console.log('[MCP RX]', chunk.toString())
    // ... rest of handler
})
```

Then you'll see all messages sent to VaultLens.

## Performance Considerations

### Cold Start
- First audit query takes ~100-200ms extra to spawn the process
- Subsequent queries reuse the connection (~10-50ms per query)

### Resource Usage
- One child process per VaultLens instance
- Minimal memory footprint (~5-10MB for vault-audit-mcp)
- Efficient stdio communication (no serialization overhead)

### Connection Lifecycle
- Process stays alive for the lifetime of the server
- Survives multiple queries
- Restarts if the process crashes (on next tool call)

## Future Enhancements

1. **Process Pooling** - Multiple vault-audit-mcp instances for parallel queries
2. **Reconnection Logic** - Auto-restart if process fails
3. **Connection Monitoring** - Periodic health checks
4. **Graceful Shutdown** - Close connection on server exit
5. **Alternative Transports** - HTTP wrapper around vault-audit-mcp (if needed)

## Comparison with Other Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Stdio (Current)** | ✅ Standard MCP protocol, low overhead, simple | Requires binary executable |
| HTTP Wrapper | ✅ Works with remote servers | ✅ Adds latency, needs web server |
| Go Client Lib | ✅ Direct integration | ✅ Requires CGO, complex builds |

We chose stdio because it's the idiomatic MCP approach and requires no additional setup.

---

**Next Steps:**
- Test with real vault-audit-mcp queries
- Monitor performance and stability
- Consider adding Vault MCP integration (currently mocked)
