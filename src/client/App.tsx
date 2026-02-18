import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownText } from './MarkdownText'
import { DocumentationSidebar } from './DocumentationSidebar'
import { ActivityPanel } from './ActivityPanel'
import { TokenUsage } from './TokenUsage'
import './App.css'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: string
    toolCalls?: Array<{ type: string; tool: string; arguments: Record<string, unknown> }>
    toolResults?: Array<{ type: string; tool: string; success: boolean; result?: unknown; error?: string }>
}

function App() {
    // Generate or retrieve session ID
    const getSessionId = () => {
        let sessionId = localStorage.getItem('vaultlens-session-id')
        if (!sessionId) {
            sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            localStorage.setItem('vaultlens-session-id', sessionId)
        }
        return sessionId
    }

    const sessionId = useRef(getSessionId())

    const [messages, setMessages] = useState<Message[]>([
        {
            id: '0',
            role: 'assistant',
            content: 'Hello! I\'m VaultLens. I can help you examine your Vault environment by accessing Vault\'s configuration, audit logs, and telemetry. What would you like to do?',
            timestamp: new Date().toISOString(),
        },
    ])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [authenticated, setAuthenticated] = useState<boolean>(true)
    const [authLoading, setAuthLoading] = useState(false)
    const [authLoadingMessage, setAuthLoadingMessage] = useState<string | null>(null)
    // True after auth network calls finish but before UI is fully ready to use
    const [authPendingUiReady, setAuthPendingUiReady] = useState(false)
    const [tokenCount, setTokenCount] = useState<{ total: number; messages: number; maxContext: number } | null>(null)
    const [uiReadyForAuth, setUiReadyForAuth] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // Check authentication status
    const checkAuth = useCallback(async () => {
        try {
            const response = await fetch('/api/auth/status')
            if (response.ok) {
                const data = await response.json()
                setAuthenticated(data.authenticated)

                // If unauthenticated, clear messages
                if (!data.authenticated) {
                    setMessages([])
                }
            }
        } catch (err) {
            console.error('Failed to check authentication:', err)
        }
    }, [])

    useEffect(() => {
        checkAuth()
        const interval = setInterval(checkAuth, 2000) // Check every 2 seconds for quick auth detection
        const handleAuthRefresh = () => {
            void checkAuth()
        }
        window.addEventListener('vault-auth-status-refresh', handleAuthRefresh)
        return () => {
            clearInterval(interval)
            window.removeEventListener('vault-auth-status-refresh', handleAuthRefresh)
        }
    }, [checkAuth])

    // Safety timeout: clear loading state if it's been active too long (prevents stuck state)
    useEffect(() => {
        if (authLoading && authLoadingMessage) {
            const safetyTimer = setTimeout(() => {
                console.warn('Loading state timeout - clearing after 30 seconds')
                setAuthLoading(false)
                setAuthLoadingMessage(null)
                setAuthPendingUiReady(false)
            }, 30000) // 30 second safety timeout

            return () => clearTimeout(safetyTimer)
        }
        return undefined
    }, [authLoading, authLoadingMessage])

    // Keep auth loading overlay visible until the UI is truly ready.
    // For login: wait for authenticated=true and one paint cycle.
    // For logout: wait for unauthenticated UI-ready callback.
    useEffect(() => {
        if (!authLoading || !authPendingUiReady) return undefined

        if (authenticated) {
            const timer = setTimeout(() => {
                setAuthLoading(false)
                setAuthLoadingMessage(null)
                setAuthPendingUiReady(false)
            }, 150)
            return () => clearTimeout(timer)
        }

        if (!authenticated && uiReadyForAuth) {
            setAuthLoading(false)
            setAuthLoadingMessage(null)
            setAuthPendingUiReady(false)
        }
        return undefined
    }, [authLoading, authPendingUiReady, authenticated, uiReadyForAuth])

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // Auto-focus input on mount and after loading completes
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        if (!loading) {
            inputRef.current?.focus()
        }
    }, [loading])
    // Fetch token count periodically
    useEffect(() => {
        const fetchTokenCount = async () => {
            try {
                const response = await fetch('/api/tokens', {
                    headers: { 'X-Session-ID': sessionId.current }
                })
                if (response.ok) {
                    const data = await response.json()
                    setTokenCount(data.tokenCount)
                }
            } catch (err) {
                console.error('Failed to fetch token count:', err)
            }
        }

        fetchTokenCount()
        const interval = setInterval(fetchTokenCount, 5000) // Update every 5 seconds
        return () => clearInterval(interval)
    }, [messages])
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        // Add user message
        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, userMessage])
        setInput('')
        setLoading(true)
        setError(null)

        // Create placeholder assistant message that we'll update as we stream
        const assistantId = (Date.now() + 1).toString()
        const assistantMessage: Message = {
            id: assistantId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toISOString(),
            toolCalls: [],
            toolResults: [],
        }
        setMessages((prev) => [...prev, assistantMessage])

        try {
            const response = await fetch('/api/query/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': sessionId.current
                },
                body: JSON.stringify({ query: userMessage.content }),
            })

            if (!response.ok) {
                throw new Error('Failed to start streaming query')
            }

            if (!response.body) {
                throw new Error('No response body for streaming')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6)
                        if (data.trim()) {
                            const chunk = JSON.parse(data)

                            if (chunk.type === 'text') {
                                // Append text to the assistant message
                                setMessages((prev) =>
                                    prev.map((msg) =>
                                        msg.id === assistantId
                                            ? { ...msg, content: msg.content + chunk.content }
                                            : msg
                                    )
                                )
                            } else if (chunk.type === 'tool_call') {
                                // Add tool call to the message
                                setMessages((prev) =>
                                    prev.map((msg) =>
                                        msg.id === assistantId
                                            ? {
                                                ...msg,
                                                toolCalls: [...(msg.toolCalls || []), chunk.toolCall],
                                            }
                                            : msg
                                    )
                                )
                            } else if (chunk.type === 'tool_result') {
                                // Add tool result to the message
                                setMessages((prev) =>
                                    prev.map((msg) =>
                                        msg.id === assistantId
                                            ? {
                                                ...msg,
                                                toolResults: [
                                                    ...(msg.toolResults || []),
                                                    chunk.toolResult,
                                                ],
                                            }
                                            : msg
                                    )
                                )
                            } else if (chunk.type === 'done') {
                                // Final update with complete result
                                setMessages((prev) =>
                                    prev.map((msg) =>
                                        msg.id === assistantId
                                            ? {
                                                ...msg,
                                                content: chunk.result.response,
                                                toolCalls: chunk.result.toolCalls,
                                                toolResults: chunk.result.toolResults,
                                                timestamp: chunk.result.timestamp,
                                            }
                                            : msg
                                    )
                                )
                            } else if (chunk.type === 'error') {
                                throw new Error(chunk.error)
                            }
                        }
                    }
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            setError(message)
            console.error('Error:', err)
            // Remove the incomplete assistant message
            setMessages((prev) => prev.filter((msg) => msg.id !== assistantId))
        } finally {
            setLoading(false)
        }
    }

    // Called by AuthStatus at start/end of login/logout
    const handleAuthLoadingChange = useCallback((loading: boolean, message: string | null) => {
        if (loading) {
            setAuthLoading(loading)
            setAuthLoadingMessage(message)
            setAuthPendingUiReady(false)
            setUiReadyForAuth(false)
            return
        }

        // Keep overlay visible after network auth completes until UI readiness effect dismisses it.
        setAuthPendingUiReady(true)
        setAuthLoadingMessage(message || 'Finalizing interface...')
    }, [])

    // Called by AuthStatus when unauthenticated UI is visible
    const handleUnauthenticatedViewReady = useCallback(() => {
        setUiReadyForAuth(true)
    }, [])

    const handleLogout = async () => {
        setAuthLoading(true)
        setAuthPendingUiReady(false)
        setAuthLoadingMessage('Logging out...')
        setUiReadyForAuth(false)
        try {
            // Clear chat history and suggestions
            await fetch('/api/history/clear', {
                method: 'POST',
                headers: { 'X-Session-ID': sessionId.current }
            })
            await fetch('/api/suggestions/clear', {
                method: 'POST',
                headers: { 'X-Session-ID': sessionId.current }
            })
            await fetch('/api/activities/clear', {
                method: 'POST',
                headers: { 'X-Session-ID': sessionId.current }
            })
            // Logout from Vault
            await fetch('/api/auth/logout', { method: 'POST' })

            // Immediately check backend status and update UI
            const response = await fetch('/api/auth/status')
            let isUnauth = false
            if (response.ok) {
                const data = await response.json()
                setAuthenticated(data.authenticated)
                isUnauth = !data.authenticated
            } else {
                setAuthenticated(false)
                isUnauth = true
            }

            // Reset UI state
            setMessages([])
            setTokenCount(null)

            // Only hide overlay after unauthenticated and UI is reset
            if (isUnauth) {
                setAuthLoading(false)
                setAuthLoadingMessage(null)
                setAuthPendingUiReady(false)
            }

            // Notify other components to refresh auth status immediately
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('vault-auth-status-refresh'))
            }
        } catch (err) {
            console.error('Logout failed:', err)
            setAuthLoading(false)
            setAuthLoadingMessage(null)
            setAuthPendingUiReady(false)
        }
    }

    const handleClearHistory = async () => {
        try {
            await fetch('/api/history/clear', {
                method: 'POST',
                headers: { 'X-Session-ID': sessionId.current }
            })
            await fetch('/api/suggestions/clear', {
                method: 'POST',
                headers: { 'X-Session-ID': sessionId.current }
            })
            setMessages([
                {
                    id: '0',
                    role: 'assistant',
                    content: 'Hello! I\'m VaultLens. I can help you examine your Vault environment by accessing Vault\'s configuration, audit logs, and telemetry. What would you like to do?',
                    timestamp: new Date().toISOString(),
                },
            ])
            // Reset token count
            setTokenCount(null)
        } catch (err) {
            console.error('Error clearing history:', err)
        }
    }

    // Restore welcome message when re-authenticated
    useEffect(() => {
        if (authenticated && messages.length === 0) {
            setMessages([
                {
                    id: '0',
                    role: 'assistant',
                    content: 'Hello! I\'m VaultLens. I can help you examine your Vault environment by accessing Vault\'s configuration, audit logs, and telemetry. What would you like to do?',
                    timestamp: new Date().toISOString(),
                },
            ])
        }
    }, [authenticated, messages.length])

    // Helper to detect if content contains markdown tables or code blocks
    const hasTableContent = (content: string): boolean => {
        // Check for markdown table syntax (lines with multiple |)
        const lines = content.split('\n')
        const hasTable = lines.some(line => {
            const pipeCount = (line.match(/\|/g) || []).length
            return pipeCount >= 2 // At least 2 pipes indicates table columns
        })
        // Check for code blocks (triple backticks)
        const hasCodeBlock = content.includes('```')
        return hasTable || hasCodeBlock
    }

    return (
        <>
            {/* Global auth loading overlay: only show when authentication is actively loading */}
            {authLoading && (
                <div className="auth-loading-overlay">
                    <div className="auth-loading-content">
                        <div className="auth-loading-spinner"></div>
                        <div className="auth-loading-message">{authLoadingMessage || 'Loading...'}</div>
                    </div>
                </div>
            )}

            {authenticated && (
                <ActivityPanel
                    sessionId={sessionId.current}
                    onLogout={handleLogout}
                    onAuthLoadingChange={handleAuthLoadingChange}
                    onUnauthenticatedViewReady={handleUnauthenticatedViewReady}
                />
            )}

            <div className="app">
                <header className="app-header">
                    <div className="header-content">
                        <img src="/image.png" alt="Vault" className="vault-logo" />
                        <div className="header-text">
                            <h1>VaultLens</h1>
                            <p>[ Agent-powered Vault audit and operations interface ]</p>
                        </div>
                    </div>
                </header>

                {authenticated ? (
                    <div className="main-layout">
                        <div className="center-content">
                            <div className="chat-container">
                                <div className="messages">
                                    {!authenticated && messages.length === 0 && (
                                        <div className="unauthenticated-image-container">
                                            <img src="/vault-lens.png" alt="VaultLens" className="vault-lens-image" />
                                        </div>
                                    )}
                                    {messages.map((msg) => {
                                        const messageClasses = `message message-${msg.role}${hasTableContent(msg.content) ? ' has-table' : ''}`
                                        return (
                                            <div key={msg.id} className={messageClasses}>
                                                <div className="message-header">
                                                    {msg.role === 'user' ? (
                                                        <span className="message-role">Me</span>
                                                    ) : (
                                                        <img src="/vault-icon-black.png" alt="VaultLens" className="message-avatar" />
                                                    )}
                                                    <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                                <div className="message-content">
                                                    {msg.content ? (
                                                        <MarkdownText content={msg.content} />
                                                    ) : msg.role === 'assistant' ? (
                                                        <span className="thinking-dots">
                                                            <span>.</span><span>.</span><span>.</span>
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {error && (
                                        <div className="message message-error">
                                            <div className="message-header">
                                                <span className="message-role">Error</span>
                                            </div>
                                            <div className="message-content">{error}</div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>

                            <div className="input-area">
                                <form onSubmit={handleSubmit} className="input-form">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSubmit(e as unknown as React.FormEvent)
                                            }
                                        }}
                                        placeholder="Ask me about Vault... (Press Enter to send, Shift+Enter for new line)"
                                        disabled={loading}
                                        rows={3}
                                    />
                                    <div className="button-group">
                                        <button type="submit" disabled={loading || !input.trim()} className="button-primary">
                                            {loading ? 'Sending...' : 'Send'}
                                        </button>
                                        <button type="button" onClick={handleClearHistory} disabled={loading} className="button-secondary">
                                            Clear History
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="chat-container">
                            {messages.length === 0 && (
                                <div className="unauthenticated-image-container">
                                    <img src="/vault-lens.png" alt="VaultLens" className="vault-lens-image" />
                                </div>
                            )}
                        </div>
                        <div className="input-area">
                            <div className="unauthenticated-message">
                                <p>Please authenticate to begin.</p>
                            </div>
                        </div>
                    </>
                )}

            </div>


            {/* Pass handleUnauthenticatedViewReady to AuthStatus in the sidebar */}
            <DocumentationSidebar
                sessionId={sessionId.current}
                onLogout={handleLogout}
                onAuthLoadingChange={handleAuthLoadingChange}
                tokenCount={tokenCount}
                onUnauthenticatedViewReady={handleUnauthenticatedViewReady}
            />

            {authenticated && <TokenUsage tokenCount={tokenCount} />}
        </>
    )
}

export default App
