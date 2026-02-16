/**
 * Execution Engine
 *
 * Coordinates execution of tool calls against both MCP servers:
 * - Vault Audit MCP Server: For querying audit logs (stdio via MCPAuditClient)
 * - Vault MCP Server: For performing Vault operations (stdio via MCPVaultClient)
 */

import { MCPAuditClient } from './mcp-audit-client'
import { MCPVaultClient } from './mcp-vault-client'
import { VaultAuthManager } from './auth/manager'

export interface ToolCall {
    type: 'vault' | 'audit' | 'system'
    tool: string
    arguments: Record<string, unknown>
}

export interface ToolResult {
    type: 'vault' | 'audit' | 'system'
    tool: string
    success: boolean
    result?: unknown
    error?: string
}

export interface ExecutionPlan {
    steps: ToolCall[]
    reasoning: string
}

export class ExecutionEngine {
    private auditClient: MCPAuditClient
    private auditClientInitialized = false
    private vaultClient: MCPVaultClient
    private vaultClientInitialized = false
    private authManager: VaultAuthManager
    private suggestionHandler?: (suggestion: { title: string; url: string; description: string; context?: string }) => void
    private activityHandler?: (activity: { type: 'tool_call' | 'thinking' | 'result'; toolType?: string; toolName?: string; description?: string; status?: string; duration?: number; error?: string }) => void

    constructor(authManager: VaultAuthManager) {
        this.authManager = authManager
        this.auditClient = new MCPAuditClient()
        this.vaultClient = new MCPVaultClient(
            process.env.VAULT_MCP_COMMAND || './vault-mcp-server',
            authManager
        )
    }

    /**
     * Set handler for documentation suggestions
     */
    setSuggestionHandler(handler: (suggestion: { title: string; url: string; description: string; context?: string }) => void) {
        this.suggestionHandler = handler
    }

    /**
     * Set handler for activity tracking
     */
    setActivityHandler(handler: (activity: { type: 'tool_call' | 'thinking' | 'result'; toolType?: string; toolName?: string; description?: string; status?: string; duration?: number; error?: string }) => void) {
        this.activityHandler = handler
    }

    /**
     * Execute a tool call against one of the MCP servers
     */
    async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        console.log(
            `[ExecutionEngine] Executing ${toolCall.type} tool: ${toolCall.tool}`
        )

        const startTime = Date.now()

        try {
            let result: ToolResult

            if (toolCall.type === 'audit') {
                result = await this.executeAuditTool(toolCall.tool, toolCall.arguments)
            } else if (toolCall.type === 'vault') {
                result = await this.executeVaultTool(toolCall.tool, toolCall.arguments)
            } else if (toolCall.type === 'system') {
                result = await this.executeSystemTool(toolCall.tool, toolCall.arguments)
            } else {
                result = {
                    type: toolCall.type,
                    tool: toolCall.tool,
                    success: false,
                    error: `Unknown tool type: ${toolCall.type}`,
                }
            }

            const duration = Date.now() - startTime

            // Emit activity completion
            if (this.activityHandler) {
                this.activityHandler({
                    type: 'tool_call',
                    toolType: toolCall.type,
                    toolName: toolCall.tool,
                    description: result.success ? `Completed in ${duration}ms` : `Failed: ${result.error}`,
                    status: result.success ? 'success' : 'error',
                    duration,
                    error: result.error
                })
            }

            return result
        } catch (error) {
            const duration = Date.now() - startTime
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'

            // Emit activity error
            if (this.activityHandler) {
                this.activityHandler({
                    type: 'tool_call',
                    toolType: toolCall.type,
                    toolName: toolCall.tool,
                    description: `Error: ${errorMsg}`,
                    status: 'error',
                    duration,
                    error: errorMsg
                })
            }

            return {
                type: toolCall.type,
                tool: toolCall.tool,
                success: false,
                error: errorMsg,
            }
        }
    }

    /**
     * Execute a tool call against the Vault Audit MCP server
     */
    private async executeAuditTool(
        tool: string,
        args: Record<string, unknown>
    ): Promise<ToolResult> {
        const startTime = Date.now()
        console.log(`[Audit] Calling ${tool} with args:`, args)

        try {
            // Initialize client on first use
            if (!this.auditClientInitialized) {
                await this.auditClient.initialize()
                this.auditClientInitialized = true
            }

            // Send the full tool name to the MCP server (e.g., "audit.search_events")
            // vault-audit-mcp expects tool names with the namespace prefix
            const result = await this.auditClient.callTool(tool, args as Record<string, unknown>)

            console.log(
                `[Audit] Result ${tool} success=${result.success} duration_ms=${Date.now() - startTime}`
            )

            return {
                type: 'audit',
                tool,
                success: result.success,
                result: result.result,
                error: result.error,
            }
        } catch (error) {
            return {
                type: 'audit',
                tool,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Execute a tool call against the Vault MCP server
     */
    private async executeVaultTool(
        tool: string,
        args: Record<string, unknown>
    ): Promise<ToolResult> {
        const startTime = Date.now()
        console.log(`[Vault] Calling ${tool} with args:`, args)

        try {
            // Initialize client on first use
            if (!this.vaultClientInitialized) {
                await this.vaultClient.initialize()
                this.vaultClientInitialized = true
            }

            // Send the tool call to the Vault MCP server
            const result = await this.vaultClient.callTool(tool, args as Record<string, unknown>)

            console.log(
                `[Vault] Result ${tool} success=${result.success} duration_ms=${Date.now() - startTime}`
            )

            return {
                type: 'vault',
                tool,
                success: result.success,
                result: result.result,
                error: result.error,
            }
        } catch (error) {
            return {
                type: 'vault',
                tool,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Execute a system tool (built-in functionality that doesn't require MCP servers)
     */
    private async executeSystemTool(
        tool: string,
        args: Record<string, unknown>
    ): Promise<ToolResult> {
        console.log(`[System] Calling ${tool} with args:`, args)

        try {
            if (tool === 'suggest_documentation') {
                // Validate required fields
                const { title, url, description, context } = args

                if (!title || typeof title !== 'string') {
                    throw new Error('title is required and must be a string')
                }
                if (!url || typeof url !== 'string') {
                    throw new Error('url is required and must be a string')
                }
                if (!description || typeof description !== 'string') {
                    throw new Error('description is required and must be a string')
                }

                // Call the suggestion handler
                if (this.suggestionHandler) {
                    this.suggestionHandler({
                        title,
                        url,
                        description,
                        context: context as string | undefined,
                    })
                }

                return {
                    type: 'system',
                    tool,
                    success: true,
                    result: { message: 'Documentation suggestion added' },
                }
            } else {
                return {
                    type: 'system',
                    tool,
                    success: false,
                    error: `Unknown system tool: ${tool}`,
                }
            }
        } catch (error) {
            return {
                type: 'system',
                tool,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Execute a sequence of tool calls
     */
    async executePlan(plan: ExecutionPlan): Promise<ToolResult[]> {
        const results: ToolResult[] = []

        for (const step of plan.steps) {
            const result = await this.executeTool(step)
            results.push(result)

            // Stop execution if a critical step fails
            if (!result.success && this.isCriticalStep(step)) {
                console.warn(
                    `[ExecutionEngine] Critical step failed: ${step.tool}, stopping execution`
                )
                break
            }
        }

        return results
    }

    private isCriticalStep(toolCall: ToolCall): boolean {
        // Define which steps are critical (failures should stop execution)
        // For now, all steps are critical
        return true
    }

    /**
     * Reset all MCP clients (closes connections and clears state)
     * Should be called when authentication changes (e.g., logout)
     */
    async reset(): Promise<void> {
        console.log('[ExecutionEngine] Resetting MCP clients...')

        // Close vault client
        if (this.vaultClientInitialized) {
            await this.vaultClient.close()
            this.vaultClientInitialized = false
        }

        // Close audit client
        if (this.auditClientInitialized) {
            await this.auditClient.close()
            this.auditClientInitialized = false
        }

        console.log('[ExecutionEngine] MCP clients reset complete')
    }
}
