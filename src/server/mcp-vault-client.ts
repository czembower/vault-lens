/**
 * MCP Vault Client
 *
 * Communicates with Vault MCP Server via stdio transport
 * Uses the official MCP SDK for idiomatic protocol handling
 * Integrates with authentication manager for token handling
 */

import { spawn, ChildProcess } from 'child_process'
import { VaultAuthManager } from './auth/manager'

export interface VaultToolResult {
    success: boolean
    result?: unknown
    error?: string
}

/**
 * MCP Client for Vault Server
 * Communicates via stdio protocol
 */
export class MCPVaultClient {
    private process: ChildProcess | null = null
    private requestId = 0
    private pending = new Map<number, (response: any) => void>()
    private buffer = ''
    private command: string
    private initialized = false
    private authManager: VaultAuthManager

    constructor(command: string = process.env.VAULT_MCP_COMMAND || './vault-mcp-server', authManager: VaultAuthManager) {
        this.command = command
        this.authManager = authManager
    }

    /**
     * Initialize the MCP server connection
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return
        }

        console.log(`[MCP Vault Client] Starting: ${this.command}`)

        // Get token from auth manager (will authenticate if needed)
        const token = await this.authManager.getToken()

        this.process = spawn(this.command, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true,
            env: {
                ...process.env,
                // Pass Vault configuration to the vault-mcp-server
                VAULT_ADDR: this.authManager.getCurrentCluster().vaultAddr,
                VAULT_TOKEN: token,
                VAULT_SKIP_VERIFY: String(this.authManager.getCurrentCluster().skipVerify || false),
            },
        })

        if (!this.process.stdout || !this.process.stdin) {
            throw new Error('Failed to create stdio pipes for MCP server')
        }

        // Handle stdout - parse newline-delimited JSON responses
        this.process.stdout.on('data', (chunk: Buffer) => {
            this.buffer += chunk.toString()
            this.processBuffer()
        })

        // Handle stderr
        this.process.stderr?.on('data', (chunk: Buffer) => {
            console.error(`[MCP Vault Server Error] ${chunk.toString()}`)
        })

        // Handle process exit
        this.process.on('exit', (code) => {
            console.warn(`[MCP Vault Client] Server exited with code ${code}`)
            this.initialized = false
        })

        // Send initialization message
        await this.sendMessage({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'vaultlens',
                    version: '1.0.0',
                },
            },
        })

        this.initialized = true
        console.log('[MCP Vault Client] Initialized')
    }

    /**
     * Execute a tool call on the Vault MCP server
     */
    async callTool(
        toolName: string,
        args: Record<string, unknown>
    ): Promise<VaultToolResult> {
        if (!this.initialized) {
            await this.initialize()
        }

        try {
            const requestId = this.requestId + 1
            const startTime = Date.now()
            console.log(`[MCP Vault Client] Tool call start id=${requestId} name=${toolName}`)
            console.log(`[MCP Vault Client] Tool args id=${requestId}:`, args)
            const response = await this.sendMessage({
                jsonrpc: '2.0',
                id: ++this.requestId,
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args,
                },
            })

            console.log(
                `[MCP Vault Client] Tool call end id=${requestId} duration_ms=${Date.now() - startTime}`
            )

            if (response.error) {
                return {
                    success: false,
                    error: response.error.message || 'MCP tool call error',
                }
            }

            return {
                success: true,
                result: response.result?.content?.[0]?.text || response.result,
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Send a message to the MCP server and wait for response
     */
    private async sendMessage(message: any): Promise<any> {
        if (!this.process?.stdin) {
            throw new Error('MCP server process not initialized')
        }

        const id = message.id
        const messageStr = JSON.stringify(message) + '\n'

        return new Promise((resolve, reject) => {
            // Set a timeout for the response
            const timeout = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`MCP request ${id} timed out`))
            }, 30000) // 30 second timeout

            // Register the callback for this request
            this.pending.set(id, (response) => {
                clearTimeout(timeout)
                resolve(response)
            })

            // Send the message
            this.process!.stdin!.write(messageStr, (err) => {
                if (err) {
                    this.pending.delete(id)
                    clearTimeout(timeout)
                    reject(err)
                }
            })
        })
    }

    /**
     * Process the buffer for complete JSON-RPC messages
     */
    private processBuffer(): void {
        while (this.buffer.includes('\n')) {
            const newlineIndex = this.buffer.indexOf('\n')
            const line = this.buffer.substring(0, newlineIndex).trim()
            this.buffer = this.buffer.substring(newlineIndex + 1)

            if (line.length === 0) {
                continue
            }

            try {
                const response = JSON.parse(line)
                const id = response.id

                if (id && this.pending.has(id)) {
                    const resolve = this.pending.get(id)!
                    this.pending.delete(id)
                    resolve(response)
                } else {
                    console.log('[MCP Vault Client] Received notification:', response)
                }
            } catch (error) {
                console.error('[MCP Vault Client] Failed to parse message:', line, error)
            }
        }
    }

    /**
     * Close the MCP server connection
     */
    async close(): Promise<void> {
        if (this.process) {
            this.process.kill()
            this.process = null
            this.initialized = false
        }
    }
}
