import React, { useState, useEffect, useCallback } from 'react'
import { AuthStatus } from './AuthStatus'
import './DocumentationSidebar.css'

interface DocumentationSuggestion {
    id: string
    title: string
    url: string
    description: string
    context?: string
    timestamp: string
}

interface DocumentationSidebarProps {
    sessionId: string;
    authenticated: boolean;
    onLogout?: () => void;
    onAuthLoadingChange?: (loading: boolean, message: string | null) => void;
    tokenCount: { total: number; messages: number; maxContext: number } | null;
    onUnauthenticatedViewReady?: () => void;
}

export function DocumentationSidebar({ sessionId, authenticated, onLogout, onAuthLoadingChange, tokenCount, onUnauthenticatedViewReady }: DocumentationSidebarProps) {
    const [suggestions, setSuggestions] = useState<DocumentationSuggestion[]>([])
    const [isOIDC, setIsOIDC] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

    // Check if user is using OIDC (for logout button)
    const checkAuth = useCallback(async () => {
        try {
            const response = await fetch('/api/auth/status')
            if (response.ok) {
                const data = await response.json()
                setIsOIDC(data.authenticated && data.usingOIDC)
                setIsAuthenticated(!!data.authenticated)
            }
        } catch (err) {
            console.error('Failed to check auth status:', err)
        }
    }, [])

    // Listen for global status refresh events
    useEffect(() => {
        const handler = () => {
            checkAuth()
        }
        window.addEventListener('vault-auth-status-refresh', handler)
        return () => window.removeEventListener('vault-auth-status-refresh', handler)
    }, [checkAuth])

    useEffect(() => {
        checkAuth()
        const interval = setInterval(checkAuth, 30000) // Check every 30 seconds
        return () => clearInterval(interval)
    }, [checkAuth])

    // Previously attempted to register a handler with onAuthLoadingChange;
    // keep using polling and global events instead to refresh OIDC status.

    useEffect(() => {
        if (!authenticated) {
            setSuggestions([])
            void fetch('/api/suggestions/clear', {
                method: 'POST',
                headers: {
                    'X-Session-ID': sessionId
                }
            }).catch((err) => {
                console.error('Failed to clear suggestions after auth loss:', err)
            })
            return
        }

        // Poll for suggestions
        const fetchSuggestions = async () => {
            try {
                const response = await fetch('/api/suggestions', {
                    headers: {
                        'X-Session-ID': sessionId
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setSuggestions(data.suggestions || [])
                }
            } catch (err) {
                console.error('Failed to fetch documentation suggestions:', err)
            }
        }

        fetchSuggestions()
        const interval = setInterval(fetchSuggestions, 2000) // Poll every 2 seconds
        return () => clearInterval(interval)
    }, [sessionId, authenticated])

    const handleClear = async () => {
        try {
            await fetch('/api/suggestions/clear', {
                method: 'POST',
                headers: {
                    'X-Session-ID': sessionId
                }
            })
            setSuggestions([])
        } catch (err) {
            console.error('Failed to clear suggestions:', err)
        }
    }

    return (
        <div className="documentation-sidebar">
            <div className="auth-logout-wrapper">
                <div className="auth-status-container">
                    {isAuthenticated !== true && (
                        <AuthStatus onLogout={onLogout} onAuthLoadingChange={onAuthLoadingChange} hideLogoutButton={true} onUnauthenticatedViewReady={onUnauthenticatedViewReady} />
                    )}
                </div>
                {isOIDC && onLogout && (
                    <div className="auth-logout-container">
                        <button className="auth-button logout" onClick={onLogout}>
                            Logout
                        </button>
                    </div>
                )}
            </div>
            <div className="documentation-content">
                {suggestions.map((suggestion) => (
                    <div key={suggestion.id} className="documentation-card">
                        <h4 className="documentation-card-title">
                            <a
                                href={suggestion.url}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {suggestion.title}
                            </a>
                        </h4>
                        <p className="documentation-card-description">
                            {suggestion.description}
                        </p>
                        {suggestion.context && (
                            <p className="documentation-card-context">
                                <em>{suggestion.context}</em>
                            </p>
                        )}
                        <a
                            href={suggestion.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="documentation-card-link"
                        >
                            View Documentation →
                        </a>
                    </div>
                ))}
            </div>
        </div>
    )
}
