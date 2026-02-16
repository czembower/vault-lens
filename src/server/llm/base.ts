/**
 * Base LLM Service Interface
 *
 * Abstract interface for LLM providers (Claude, OpenAI, etc.)
 * Ensures consistent behavior across different AI backends
 */

import { ExecutionEngine, ToolCall, ToolResult } from '../execution-engine'

export interface QueryResult {
    query: string
    response: string
    toolCalls: ToolCall[]
    toolResults: ToolResult[]
    reasoning: string
    timestamp: string
}

export interface ConversationContext {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export type StreamChunk =
    | { type: 'text'; content: string }
    | { type: 'tool_call'; toolCall: ToolCall }
    | { type: 'tool_result'; toolResult: ToolResult }
    | { type: 'done'; result: QueryResult }

export abstract class BaseLLMService {
    protected executionEngine: ExecutionEngine
    protected conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    protected queryHistory: QueryResult[] = []

    constructor(executionEngine: ExecutionEngine) {
        this.executionEngine = executionEngine
    }

    /**
     * Execute a query: natural language → agent reasoning → tool execution → response
     */
    abstract executeQuery(query: string, context?: ConversationContext): Promise<QueryResult>

    /**
     * Execute a query with streaming: yields text chunks, tool calls, and results as they happen
     */
    abstract executeQueryStream(
        query: string,
        context?: ConversationContext
    ): AsyncGenerator<StreamChunk, void, unknown>

    /**
     * Get query history
     */
    getHistory(): QueryResult[] {
        return this.queryHistory
    }

    /**
     * Clear conversation and query history
     */
    clearHistory(): void {
        this.conversationHistory = []
        this.queryHistory = []
    }
}
