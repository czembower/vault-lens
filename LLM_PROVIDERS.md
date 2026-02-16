# Multi-Provider LLM Architecture

## Overview

VaultLens now supports multiple LLM providers through a pluggable architecture. You can easily switch between Claude (Anthropic) and OpenAI's models without changing any code.

## Supported Providers

- **Anthropic** (Claude 3.5 Sonnet) - Default
- **OpenAI** (GPT-4 Turbo) - Alternative

## Configuration

### Set the LLM Provider

In your `.env` file, set the `LLM_PROVIDER` variable:

```bash
# Use Anthropic Claude (default)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk_ant_...

# OR use OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

If `LLM_PROVIDER` is not set, it defaults to `anthropic`.

## API Keys

### Anthropic
- Get your API key from: https://console.anthropic.com/
- Model used: `claude-3-5-sonnet-20241022`
- Environment variable: `ANTHROPIC_API_KEY`

### OpenAI
- Get your API key from: https://platform.openai.com/
- Model used: `gpt-4-turbo`
- Environment variable: `OPENAI_API_KEY`

## Architecture

### Base Service
All LLM implementations extend `BaseLLMService`, which defines the common interface:

```typescript
abstract class BaseLLMService {
    abstract executeQuery(query: string, context?: ConversationContext): Promise<QueryResult>
    getHistory(): QueryResult[]
    clearHistory(): void
}
```

### Service Implementations

**AnthropicLLMService** (`src/server/llm/anthropic.ts`)
- Uses Claude's tool_use response format
- Multi-turn conversation with tool_use blocks
- Optimized for Claude's message model

**OpenAILLMService** (`src/server/llm/openai.ts`)
- Uses OpenAI's tool_calls response format
- Multi-turn conversation with tool_calls
- Optimized for OpenAI's chat completion model

### Factory Pattern
The `LLMFactory` (`src/server/llm-factory.ts`) handles service instantiation:

```typescript
const agent = createLLMService(executionEngine)
```

This factory:
- Reads `LLM_PROVIDER` from environment
- Validates the required API key is set
- Returns the appropriate service instance
- Throws helpful errors if configuration is missing

## Usage

The API remains identical regardless of which LLM provider you use:

```typescript
// Same interface for both providers
const result = await agent.executeQuery("Show me audit errors")

// Returns QueryResult with:
// - query: the original query
// - response: the LLM's response
// - toolCalls: which tools were invoked
// - toolResults: results from each tool
// - reasoning: the LLM's reasoning
// - timestamp: when the query was executed
```

## Tool Definitions

Tool definitions are automatically converted to the appropriate format for each provider:

- **Anthropic**: Uses Claude's `Tool` schema with `input_schema`
- **OpenAI**: Uses OpenAI's `ChatCompletionTool` format with function definition

Both implementations define the same 4 tools:
1. `search_audit_events` - Search audit logs
2. `aggregate_audit_events` - Count events by dimension
3. `trace_request` - Trace specific request
4. `vault_operation` - Perform Vault operations

## Agentic Loop

Both providers support multi-turn conversations with tool calls:

1. **Initial Request**: Send query + tool definitions to LLM
2. **Tool Decision**: LLM decides which tools to invoke
3. **Tool Execution**: Agent executes tools via ExecutionEngine
4. **Response Loop**: Send tool results back to LLM
5. **Final Response**: LLM returns final answer

The loop continues until the LLM stops requesting tools.

## Switching Providers

To switch from Anthropic to OpenAI:

### 1. Get OpenAI API Key
- Visit https://platform.openai.com/api-keys
- Create a new secret key

### 2. Update .env
```bash
# Change from:
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk_ant_...

# To:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### 3. Restart Server
```bash
npm run dev
```

No code changes needed! The factory automatically selects the right provider.

## Fallback Behavior

If you forget to set the required API key for the chosen provider:

```
Error: ANTHROPIC_API_KEY environment variable is not set
Error: OPENAI_API_KEY environment variable is not set
```

The server will fail to start with a clear error message indicating which API key is missing.

## Response Format Differences

Despite using different LLMs, the response format is normalized:

```typescript
interface QueryResult {
    query: string                    // Original user query
    response: string                 // LLM's text response
    toolCalls: ToolCall[]           // Tools invoked (same format for both)
    toolResults: ToolResult[]       // Results from tool execution
    reasoning: string               // LLM's reasoning
    timestamp: string               // ISO 8601 timestamp
}
```

The `toolCalls` and `toolResults` arrays use the same internal format regardless of provider, making the frontend completely provider-agnostic.

## Adding New Providers

To add support for another provider (e.g., Gemini, Llama):

1. Create new service class in `src/server/llm/<provider>.ts`
2. Extend `BaseLLMService`
3. Implement `executeQuery()` with provider-specific logic
4. Add case to `createLLMService()` factory
5. Update `.env.example` with new environment variable

### Template

```typescript
import { ExecutionEngine, ToolCall, ToolResult } from '../execution-engine'
import { BaseLLMService, QueryResult, ConversationContext } from './base'

export class NewProviderLLMService extends BaseLLMService {
    constructor(executionEngine: ExecutionEngine) {
        super(executionEngine)
        // Initialize provider-specific SDK
    }

    async executeQuery(query: string, context?: ConversationContext): Promise<QueryResult> {
        // Implement agentic loop for new provider
    }
}
```

## Performance Comparison

### Anthropic Claude 3.5 Sonnet
- Faster token generation
- ~6,000 TPM rate limit (typical)
- $3/$15 per 1M input/output tokens
- Generally better at reasoning tasks

### OpenAI GPT-4 Turbo
- Slightly slower but highly capable
- ~90,000 TPM rate limit (typical)
- $10/$30 per 1M input/output tokens
- Excellent at structured output

## Cost Estimation

For an average VaultLens query:
- **Claude**: $0.001 - $0.003 per query
- **OpenAI**: $0.002 - $0.005 per query

Costs vary based on:
- Query complexity
- Number of tool calls
- Response length
- Rate limiting speeds

## Troubleshooting

### "Unknown LLM provider: undefined"
Missing `LLM_PROVIDER` variable. Set it in `.env`:
```bash
LLM_PROVIDER=anthropic
```

### "ANTHROPIC_API_KEY environment variable is not set"
Set your Anthropic key:
```bash
ANTHROPIC_API_KEY=sk_ant_...
```

### "OPENAI_API_KEY environment variable is not set"
Set your OpenAI key:
```bash
OPENAI_API_KEY=sk-...
```

### Provider responds with errors
- Verify API key is valid and has sufficient quota
- Check that the model name is available in your plan
- Review rate limiting in the provider's dashboard

### Tool execution hangs
- May indicate slow MCP server response
- Check ExecutionEngine mock implementations
- See [MCP_CONNECTION.md](./MCP_CONNECTION.md) for real MCP setup

## Security Notes

- Never commit API keys to version control
- Use `.env` (not `.env.example`) for actual keys
- Rotate keys regularly
- Use environment variables in production
- Consider using secret management services (Vault, AWS Secrets Manager)

## Future Plans

- Support for streaming responses
- Cost tracking per query
- Provider fallback (if Claude fails, try OpenAI)
- Model version management
- Custom system prompts per provider
