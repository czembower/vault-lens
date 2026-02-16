/**
 * Authentication Status Component
 * 
 * Displays current authentication status and provides login/logout controls
 */

import React, { useState, useEffect } from 'react'
import './AuthStatus.css'

interface AuthStatusProps {
    onLogout?: () => void
    onAuthLoadingChange?: (loading: boolean, message: string | null) => void
    hideLogoutButton?: boolean
    onUnauthenticatedViewReady?: () => void
}

interface AuthStatus {
    authenticated: boolean
    usingOIDC: boolean
    usingToken: boolean
    timeRemaining: number | null
    shouldRenew: boolean
    policies: string[] | null
    entityId: string | null
    cluster: {
        vaultAddr: string | null
        clusterId: string | null
        clusterName: string | null
        sealed: boolean
        initialized: boolean
        standby: boolean
        version: string | null
        replicationPerfMode: string | null
        replicationDrMode: string | null
    } | null
    cachedClusters?: string[]
}

export function AuthStatus({ onLogout, onAuthLoadingChange, hideLogoutButton, onUnauthenticatedViewReady }: AuthStatusProps = {}) {
    const [status, setStatus] = useState<AuthStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showConnectionForm, setShowConnectionForm] = useState(false)
    const [connectLoading, setConnectLoading] = useState(false)
    const [connectError, setConnectError] = useState<string | null>(null)
    const [authLoadingMessage, setAuthLoadingMessage] = useState<string | null>(null)

    // Notify parent component when auth loading state changes
    useEffect(() => {
        if (onAuthLoadingChange) {
            onAuthLoadingChange(connectLoading, authLoadingMessage)
        }
    }, [connectLoading, authLoadingMessage, onAuthLoadingChange])

    // Call onAuthLoadingChange immediately when login/logout starts
    const setConnectLoadingImmediate = (loading: boolean, message: string | null = null) => {
        setConnectLoading(loading)
        setAuthLoadingMessage(message)
        if (onAuthLoadingChange) {
            onAuthLoadingChange(loading, message)
        }
    }

    // Cluster connection form state
    const [vaultAddr, setVaultAddr] = useState('')
    const [authMethod, setAuthMethod] = useState<'oidc' | 'token'>('oidc')
    const [token, setToken] = useState('')
    const [oidcMount, setOidcMount] = useState('oidc')
    const [oidcRole, setOidcRole] = useState('default_role')
    const [skipVerify, setSkipVerify] = useState(false)

    const fetchStatus = async () => {
        try {
            const response = await fetch('/api/auth/status')
            if (!response.ok) throw new Error('Failed to fetch auth status')
            const data = await response.json()
            setStatus(data)
            setError(null)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()
        // Poll status every 30 seconds
        const interval = setInterval(fetchStatus, 30000)
        return () => clearInterval(interval)
    }, [])

    // Notify parent when status becomes unauthenticated so parent can hide overlays
    useEffect(() => {
        if (status && !status.authenticated) {
            if (onUnauthenticatedViewReady) onUnauthenticatedViewReady()
        }
    }, [status, onUnauthenticatedViewReady])

    const handleConnectToCluster = async () => {
        if (!vaultAddr.trim()) {
            setConnectError('Vault address is required')
            return
        }

        if (authMethod === 'token' && !token.trim()) {
            setConnectError('Token is required for token-based authentication')
            return
        }

        setConnectLoadingImmediate(true, 'Preparing authentication...')
        setConnectError(null)
        try {
            if (authMethod === 'oidc') {
                // For OIDC, use new popup flow
                // 1. Get auth URL from server
                setConnectLoadingImmediate(true, 'Connecting to Vault...')
                const authUrlResponse = await fetch('/api/auth/oidc/auth-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vaultAddr: vaultAddr.trim(),
                        oidcMount: oidcMount.trim() || 'oidc',
                        oidcRole: oidcRole.trim() || 'default_role',
                        skipVerify: skipVerify
                    })
                })

                if (!authUrlResponse.ok) {
                    const data = await authUrlResponse.json()
                    throw new Error(data.error || 'Failed to get auth URL')
                }

                const { authUrl } = await authUrlResponse.json()

                // 2. Open popup window with controlled dimensions
                setConnectLoadingImmediate(true, 'Opening authentication popup...')
                const width = 500
                const height = 700
                const left = (window.screen.width / 2) - (width / 2)
                const top = (window.screen.height / 2) - (height / 2)

                const popup = window.open(
                    authUrl,
                    'Vault OIDC Authentication',
                    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
                )

                if (!popup) {
                    throw new Error('Failed to open authentication popup. Please allow popups for this site.')
                }

                setConnectLoadingImmediate(true, 'Waiting for authentication...')

                // 3. Complete authentication on server (it will wait for callback)
                const completeResponse = await fetch('/api/auth/oidc/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                })

                if (!completeResponse.ok) {
                    const data = await completeResponse.json()
                    throw new Error(data.error || 'Authentication failed')
                }

                setConnectLoadingImmediate(true, 'Completing authentication...')

                // Close popup after successful auth
                if (popup && !popup.closed) {
                    popup.close()
                }
            } else {
                // Token auth - use original flow
                setConnectLoadingImmediate(true, 'Authenticating with token...')
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vaultAddr: vaultAddr.trim(),
                        authMethod,
                        token: token.trim(),
                        skipVerify: skipVerify
                    })
                })
                if (!response.ok) {
                    const data = await response.json()
                    throw new Error(data.error || 'Connection failed')
                }
            }

            setConnectLoadingImmediate(true, 'Loading cluster details...')
            await fetchStatus()
            setShowConnectionForm(false)
            setVaultAddr('')
            setAuthMethod('oidc')
            setToken('')
            setOidcMount('oidc')
            setOidcRole('default_role')
            setSkipVerify(false)
            // Instantly clear loading state so UI updates immediately
            setConnectLoadingImmediate(false, null)
            // Immediately refresh status for parent components
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('vault-auth-status-refresh'))
            }
        } catch (err) {
            setConnectError(err instanceof Error ? err.message : 'Connection failed')
            // Clear loading state immediately on error
            setConnectLoading(false)
            setAuthLoadingMessage(null)
        }
    }

    const handleSwitchCluster = async (clusterAddr: string) => {
        setLoading(true)
        setError(null)
        try {
            const response = await fetch('/api/auth/switch-cluster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vaultAddr: clusterAddr })
            })
            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Cluster switch failed')
            }
            await fetchStatus()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Cluster switch failed')
        } finally {
            setLoading(false)
        }
    }

    const handleLogout = async () => {
        setConnectLoadingImmediate(true, 'Logging out...')
        try {
            // Clear chat history
            await fetch('/api/history/clear', { method: 'POST' })
            // Logout and clear auth token
            await fetch('/api/auth/logout', { method: 'POST' })
            // Clear messages in UI
            if (onLogout) {
                onLogout()
            }
            await fetchStatus()
            // Instantly clear loading state so UI updates immediately
            setConnectLoadingImmediate(false, null)
            // Immediately refresh status for parent components
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('vault-auth-status-refresh'))
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Logout failed')
            setConnectLoadingImmediate(false, null)
        }
    }

    if (loading) {
        return (
            <div className="auth-status loading">
                <span className="auth-status-icon">🔄</span>
                <span>Checking authentication...</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className="auth-status error">
                <span className="auth-status-icon">⚠️</span>
                <span>{error}</span>
            </div>
        )
    }

    if (!status) return null

    if (!status.authenticated) {
        return (
            <>
                <div className="auth-status unauthenticated">
                    <button
                        className="auth-button login"
                        onClick={() => setShowConnectionForm(true)}
                        aria-label="Connect to Cluster"
                    >
                        Connect to Cluster
                    </button>
                </div>

                {showConnectionForm && (
                    <div className="modal-overlay" onClick={() => setShowConnectionForm(false)}>
                        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Connect to Vault Cluster</h3>
                                <button
                                    className="modal-close"
                                    onClick={() => setShowConnectionForm(false)}
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="modal-body">
                                {connectError && (
                                    <div className="form-error">
                                        <span>⚠️ {connectError}</span>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label htmlFor="vault-addr">Vault Address *</label>
                                    <input
                                        id="vault-addr"
                                        type="text"
                                        value={vaultAddr}
                                        onChange={(e) => setVaultAddr(e.target.value)}
                                        placeholder="https://vault.example.com:8200"
                                        disabled={connectLoading}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Authentication Method *</label>
                                    <div className="auth-method-selector">
                                        <label className="radio-label">
                                            <input
                                                type="radio"
                                                value="oidc"
                                                checked={authMethod === 'oidc'}
                                                onChange={(e) => setAuthMethod(e.target.value as 'oidc')}
                                                disabled={connectLoading}
                                            />
                                            <span>OIDC (Browser-based)</span>
                                        </label>
                                        <label className="radio-label">
                                            <input
                                                type="radio"
                                                value="token"
                                                checked={authMethod === 'token'}
                                                onChange={(e) => setAuthMethod(e.target.value as 'token')}
                                                disabled={connectLoading}
                                            />
                                            <span>Token</span>
                                        </label>
                                    </div>
                                </div>
                                {authMethod === 'token' && (
                                    <div className="form-group">
                                        <label htmlFor="token">Vault Token *</label>
                                        <input
                                            id="token"
                                            type="password"
                                            value={token}
                                            onChange={(e) => setToken(e.target.value)}
                                            placeholder="hvs.***"
                                            disabled={connectLoading}
                                            autoComplete="off"
                                        />
                                    </div>
                                )}
                                {authMethod === 'oidc' && (
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label htmlFor="oidc-mount">OIDC Mount Path</label>
                                            <input
                                                id="oidc-mount"
                                                type="text"
                                                value={oidcMount}
                                                onChange={(e) => setOidcMount(e.target.value)}
                                                placeholder="oidc"
                                                disabled={connectLoading}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label htmlFor="oidc-role">OIDC Role</label>
                                            <input
                                                id="oidc-role"
                                                type="text"
                                                value={oidcRole}
                                                onChange={(e) => setOidcRole(e.target.value)}
                                                placeholder="default_role"
                                                disabled={connectLoading}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="form-group checkbox-group">
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={skipVerify}
                                            onChange={(e) => setSkipVerify(e.target.checked)}
                                            disabled={connectLoading}
                                        />
                                        <span>Skip TLS verification (insecure)</span>
                                    </label>
                                </div>
                                <button
                                    className="auth-button login"
                                    onClick={handleConnectToCluster}
                                    disabled={connectLoading || !vaultAddr.trim() || (authMethod === 'token' && !token.trim())}
                                >
                                    {connectLoading ? 'Connecting...' : 'Connect & Authenticate'}
                                </button>
                                <p className="form-help">
                                    {authMethod === 'oidc'
                                        ? 'Enter the Vault server address and optionally customize OIDC settings. This will open your browser for authentication.'
                                        : 'Enter the Vault server address and your Vault token for direct authentication.'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </>
        )
    }

    // Format time remaining
    const formatTimeRemaining = (seconds: number | null): string => {
        if (!seconds) return 'N/A'
        if (seconds < 60) return `${seconds}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    }

    return (
        <div className="auth-header-container">
            {/* Authentication Details */}
            <div className="auth-info-section">
                <div className="auth-details">
                    <span className="auth-status-icon">✓</span>
                    <div className="auth-content">
                        <div className="auth-primary">
                            <span className="auth-method">
                                {status.usingToken ? 'Token' : status.usingOIDC ? 'OIDC' : 'Authenticated'}
                            </span>
                            {status.timeRemaining && (
                                <span className="auth-ttl">
                                    TTL: {formatTimeRemaining(status.timeRemaining)}
                                    {status.shouldRenew && ' (will renew)'}
                                </span>
                            )}
                        </div>
                        {status.policies && status.policies.length > 0 && (
                            <div className="auth-secondary">
                                <span className="auth-policies">
                                    Policies: {status.policies.join(', ')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="auth-actions">
                    {status.cachedClusters && status.cachedClusters.length > 1 && (
                        <select
                            className="cluster-switcher"
                            value={status.cluster?.vaultAddr || ''}
                            onChange={(e) => handleSwitchCluster(e.target.value)}
                            title="Switch to a different cached cluster"
                        >
                            {status.cachedClusters.map((clusterAddr) => (
                                <option key={clusterAddr} value={clusterAddr}>
                                    {clusterAddr}
                                </option>
                            ))}
                        </select>
                    )}
                    {!hideLogoutButton && status.usingOIDC && (
                        <button className="auth-button logout" onClick={handleLogout}>
                            Logout
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
