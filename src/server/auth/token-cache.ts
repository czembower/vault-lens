/**
 * Token Cache Manager
 * 
 * Handles in-memory caching of Vault tokens with expiry tracking for multiple clusters.
 */

interface CachedToken {
    token: string
    expiresAt: number // Unix timestamp in milliseconds
    issuedAt: number  // Unix timestamp in milliseconds
    ttl: number       // Original TTL in seconds
    oidcMount?: string  // OIDC mount used for this token
    oidcRole?: string   // OIDC role used for this token
    skipVerify?: boolean // TLS verification setting used for this token
}

interface MultiClusterCache {
    clusters: {
        [clusterAddress: string]: CachedToken
    }
}

export class TokenCache {
    private memoryCache: MultiClusterCache = { clusters: {} }

    constructor() {
        // Memory-only cache, no persistence
    }

    /**
     * Store a token with its TTL for a specific cluster
     */
    async setToken(clusterAddress: string, token: string, ttl: number, oidcMount?: string, oidcRole?: string, skipVerify?: boolean): Promise<void> {
        const now = Date.now()

        const cached: CachedToken = {
            token,
            expiresAt: now + (ttl * 1000),
            issuedAt: now,
            ttl,
            oidcMount,
            oidcRole,
            skipVerify
        }

        // Store in memory only
        this.memoryCache.clusters[clusterAddress] = cached
        console.log(`[TokenCache] Token cached in memory for ${clusterAddress}`)
    }

    /**
     * Get cached token if valid (not expired) for a specific cluster
     * Returns null if no valid token exists
     */
    async getToken(clusterAddress: string): Promise<string | null> {
        const cached = this.memoryCache.clusters[clusterAddress]

        if (!cached) {
            return null
        }

        if (this.isValid(cached)) {
            console.log(`[TokenCache] Valid token found in memory for ${clusterAddress}`)
            return cached.token
        }

        // Token expired, remove it
        console.log(`[TokenCache] Cached token expired for ${clusterAddress}, removing`)
        await this.clearToken(clusterAddress)
        return null
    }

    /**
     * Get cached token metadata for a cluster
     */
    async getTokenMetadata(clusterAddress: string): Promise<{ oidcMount?: string, oidcRole?: string, skipVerify?: boolean } | null> {
        const cached = this.memoryCache.clusters[clusterAddress]

        if (!cached || !this.isValid(cached)) {
            return null
        }

        return {
            oidcMount: cached.oidcMount,
            oidcRole: cached.oidcRole,
            skipVerify: cached.skipVerify
        }
    }

    /**
     * Get time remaining until token expires (in seconds) for a specific cluster
     * Returns null if no valid token
     */
    async getTimeRemaining(clusterAddress: string): Promise<number | null> {
        const cached = this.memoryCache.clusters[clusterAddress]

        if (!cached || !this.isValid(cached)) {
            return null
        }

        const remaining = Math.floor((cached.expiresAt - Date.now()) / 1000)
        return Math.max(0, remaining)
    }

    /**
     * Check if token should be renewed for a specific cluster
     * Returns true if less than 25% of TTL remains
     */
    async shouldRenew(clusterAddress: string): Promise<boolean> {
        const cached = this.memoryCache.clusters[clusterAddress]

        if (!cached || !this.isValid(cached)) {
            return true
        }

        const totalLifetime = cached.expiresAt - cached.issuedAt
        const remaining = cached.expiresAt - Date.now()
        const percentRemaining = (remaining / totalLifetime) * 100

        return percentRemaining < 25
    }

    /**
     * Clear cached token for a specific cluster
     */
    async clearToken(clusterAddress: string): Promise<void> {
        delete this.memoryCache.clusters[clusterAddress]
        console.log(`[TokenCache] Token removed from memory for ${clusterAddress}`)
    }

    /**
     * Get list of all cached cluster addresses
     */
    async getCachedClusters(): Promise<string[]> {
        return Object.keys(this.memoryCache.clusters)
    }

    /**
     * Check if cached token is still valid
     */
    private isValid(cached: CachedToken): boolean {
        // Check if token has expired (with 30 second buffer)
        const bufferMs = 30 * 1000
        return Date.now() < (cached.expiresAt - bufferMs)
    }
}
