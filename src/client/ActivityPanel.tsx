import React, { useState, useEffect, useRef } from 'react'
import { AuthStatus } from './AuthStatus'
import './ActivityPanel.css'

interface ClusterInfo {
    clusterName?: string
    clusterId?: string
    version?: string
    vaultAddr?: string
    sealed?: boolean
    standby?: boolean
    replicationPerfMode?: string
    replicationDrMode?: string
}

function ClusterIdentity() {
    const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
    const [changedFields, setChangedFields] = useState<Set<string>>(new Set())
    const changeClearTimerRef = useRef<number | null>(null)

    const nodeStateFor = (info: ClusterInfo) =>
        info.sealed ? 'sealed' : info.standby ? 'standby' : 'active'

    const computeChangedFields = (prev: ClusterInfo, next: ClusterInfo): Set<string> => {
        const changed = new Set<string>()
        if (prev.vaultAddr !== next.vaultAddr) changed.add('vaultAddr')
        if (prev.clusterName !== next.clusterName) changed.add('clusterName')
        if (prev.clusterId !== next.clusterId) changed.add('clusterId')
        if (prev.version !== next.version) changed.add('version')
        if (nodeStateFor(prev) !== nodeStateFor(next)) changed.add('nodeState')
        if (
            prev.replicationPerfMode !== next.replicationPerfMode ||
            prev.replicationDrMode !== next.replicationDrMode
        ) {
            changed.add('replication')
        }
        return changed
    }

    useEffect(() => {
        const fetchClusterInfo = async () => {
            try {
                const response = await fetch('/api/auth/status')
                if (response.ok) {
                    const data = await response.json()
                    if (data.authenticated && data.cluster) {
                        const nextInfo: ClusterInfo = {
                            clusterName: data.cluster.clusterName,
                            clusterId: data.cluster.clusterId,
                            version: data.cluster.version,
                            vaultAddr: data.cluster.vaultAddr,
                            sealed: data.cluster.sealed,
                            standby: data.cluster.standby,
                            replicationPerfMode: data.cluster.replicationPerfMode,
                            replicationDrMode: data.cluster.replicationDrMode
                        }

                        setClusterInfo((prev) => {
                            if (prev) {
                                const changed = computeChangedFields(prev, nextInfo)
                                if (changed.size > 0) {
                                    setChangedFields(changed)
                                    if (changeClearTimerRef.current) {
                                        window.clearTimeout(changeClearTimerRef.current)
                                    }
                                    changeClearTimerRef.current = window.setTimeout(() => {
                                        setChangedFields(new Set())
                                    }, 1500)
                                }
                            }
                            return nextInfo
                        })
                    } else if (!data.authenticated) {
                        setClusterInfo(null)
                        setChangedFields(new Set())
                    }
                }
            } catch (err) {
                console.error('Failed to fetch cluster info:', err)
            }
        }
        fetchClusterInfo()
        const interval = setInterval(fetchClusterInfo, 10000)
        return () => {
            clearInterval(interval)
            if (changeClearTimerRef.current) {
                window.clearTimeout(changeClearTimerRef.current)
            }
        }
    }, [])

    const hasChanged = (field: string) => changedFields.has(field)

    if (!clusterInfo) {
        return null
    }

    return (
        <div className="cluster-identity-panel">
            {clusterInfo.vaultAddr && (
                <div className="cluster-identity-item">
                    <span className="cluster-identity-label">Vault Address:</span>
                    <span className={`cluster-identity-value cluster-vault-addr ${hasChanged('vaultAddr') ? 'cluster-changed' : ''}`} title={clusterInfo.vaultAddr}>{clusterInfo.vaultAddr}</span>
                </div>
            )}
            {clusterInfo.clusterName && (
                <div className="cluster-identity-item">
                    <span className="cluster-identity-label">Cluster Name:</span>
                    <span className={`cluster-identity-value cluster-name ${hasChanged('clusterName') ? 'cluster-changed' : ''}`} title={clusterInfo.clusterName}>{clusterInfo.clusterName}</span>
                </div>
            )}
            {clusterInfo.clusterId && (
                <div className="cluster-identity-item">
                    <span className="cluster-identity-label">Cluster ID:</span>
                    <span className={`cluster-identity-value cluster-id ${hasChanged('clusterId') ? 'cluster-changed' : ''}`} title={clusterInfo.clusterId}>{clusterInfo.clusterId}</span>
                </div>
            )}
            {clusterInfo.version && (
                <div className="cluster-identity-item">
                    <span className="cluster-identity-label">Vault version:</span>
                    <span className={`cluster-identity-value cluster-version ${hasChanged('version') ? 'cluster-changed' : ''}`} title={clusterInfo.version}>{clusterInfo.version}</span>
                </div>
            )}
            <div className="cluster-identity-item">
                <span className="cluster-identity-label">Node type:</span>
                <span className={`cluster-identity-value cluster-status ${clusterInfo.sealed ? 'sealed' : 'unsealed'} ${hasChanged('nodeState') ? 'cluster-changed' : ''}`}>
                    {clusterInfo.sealed ? 'Sealed' : clusterInfo.standby ? 'Standby' : 'Active'}
                </span>
            </div>
            {((clusterInfo.replicationPerfMode && clusterInfo.replicationPerfMode !== 'disabled') ||
                (clusterInfo.replicationDrMode && clusterInfo.replicationDrMode !== 'disabled')) && (
                    <div className="cluster-identity-item">
                        <span className="cluster-identity-label">Replication mode:</span>
                        <span className={`cluster-identity-value ${hasChanged('replication') ? 'cluster-changed' : ''}`}>
                            {clusterInfo.replicationPerfMode && clusterInfo.replicationPerfMode !== 'disabled' && (
                                <span className="cluster-replication">
                                    Perf: {clusterInfo.replicationPerfMode}
                                </span>
                            )}
                            {clusterInfo.replicationDrMode && clusterInfo.replicationDrMode !== 'disabled' && (
                                <span className="cluster-replication">
                                    DR: {clusterInfo.replicationDrMode}
                                </span>
                            )}
                        </span>
                    </div>
                )}
        </div>
    )
}

interface Activity {
    id: string
    type: 'tool_call' | 'thinking' | 'result'
    timestamp: string
    toolType?: 'vault' | 'audit' | 'system'
    toolName?: string
    description?: string
    status?: 'running' | 'success' | 'error'
    duration?: number
    error?: string
}

interface ActivityPanelProps {
    sessionId: string
    onLogout?: () => void
    onAuthLoadingChange?: (loading: boolean, message: string | null) => void
    onUnauthenticatedViewReady?: () => void
}

export function ActivityPanel({ sessionId, onLogout, onAuthLoadingChange, onUnauthenticatedViewReady }: ActivityPanelProps) {
    const [activities, setActivities] = useState<Activity[]>([])
    const visibleToolCalls = activities
        .filter((activity) => activity.type === 'tool_call')
        .slice(-4)

    useEffect(() => {
        // Poll for activities
        const fetchActivities = async () => {
            try {
                const response = await fetch('/api/activities', {
                    headers: {
                        'X-Session-ID': sessionId
                    }
                })
                if (response.ok) {
                    const data = await response.json()
                    setActivities(data.activities || [])
                }
            } catch (err) {
                console.error('Failed to fetch activities:', err)
            }
        }

        fetchActivities()
        const interval = setInterval(fetchActivities, 1000) // Poll every second for real-time updates
        return () => clearInterval(interval)
    }, [sessionId])

    const handleClear = async () => {
        try {
            await fetch('/api/activities/clear', {
                method: 'POST',
                headers: {
                    'X-Session-ID': sessionId
                }
            })
            setActivities([])
        } catch (err) {
            console.error('Failed to clear activities:', err)
        }
    }

    const getActivityIcon = (activity: Activity) => {
        if (activity.type === 'tool_call') {
            if (activity.toolType === 'vault') return '🔐'
            if (activity.toolType === 'audit') return '📋'
            if (activity.toolType === 'system') return '⚙️'
            return '🔧'
        }
        if (activity.type === 'result') {
            if (activity.status === 'error') return '❌'
            if (activity.status === 'success') return '✅'
            return '✓'
        }
        return '💭'
    }

    const getStatusClass = (activity: Activity) => {
        if (activity.status === 'running') return 'running'
        if (activity.status === 'error') return 'error'
        if (activity.status === 'success') return 'success'
        return ''
    }

    return (
        <div className="activity-panel">
            <ClusterIdentity />
            <div className="activity-content">
                {visibleToolCalls.map((activity, index) => {
                    // Calculate opacity based on position (older items at top fade out)
                    // Newest (bottom, last index) = 1.0, oldest (top, index 0) = 0.3
                    const positionFromEnd = visibleToolCalls.length - 1 - index
                    const opacity = Math.max(0.3, 1 - (positionFromEnd * 0.14))

                    return (
                        <div
                            key={activity.id}
                            className={`activity-item ${getStatusClass(activity)}`}
                            style={{ opacity }}
                        >
                            <div className="activity-item-header">
                                <span className="activity-item-icon">
                                    {getActivityIcon(activity)}
                                </span>
                                <span className="activity-item-title">
                                    {activity.toolName || activity.type}
                                </span>
                                {activity.duration && (
                                    <span className="activity-item-duration">
                                        {activity.duration}ms
                                    </span>
                                )}
                            </div>
                            {activity.description && (
                                <div className="activity-item-description">
                                    {activity.description}
                                </div>
                            )}
                            {activity.error && (
                                <div className="activity-item-error">{activity.error}</div>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="auth-status-wrapper">
                <AuthStatus onLogout={onLogout} onAuthLoadingChange={onAuthLoadingChange} onUnauthenticatedViewReady={onUnauthenticatedViewReady} hideLogoutButton={true} />
            </div>
        </div>
    )
}
