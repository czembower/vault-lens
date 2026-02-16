/**
 * Token Usage Component
 * 
 * Displays current token usage and remaining context window
 */

import React from 'react'
import './TokenUsage.css'

interface TokenUsageProps {
    tokenCount: {
        total: number
        messages: number
        maxContext: number
    } | null
}

export function TokenUsage({ tokenCount }: TokenUsageProps) {
    if (!tokenCount) {
        return null
    }

    const { total, messages, maxContext } = tokenCount
    const percentage = Math.min((total / maxContext) * 100, 100)
    const remaining = Math.max(maxContext - total, 0)

    // Determine color based on usage
    let statusClass = 'safe'
    if (percentage > 80) {
        statusClass = 'critical'
    } else if (percentage > 60) {
        statusClass = 'warning'
    }

    return (
        <div className="token-usage">
            <div className="token-usage-header">
                <span className="token-usage-label">Context</span>
                <span className="token-usage-stats">
                    {total.toLocaleString()} / {maxContext.toLocaleString()} tokens
                </span>
            </div>
            <div className="token-usage-bar-container">
                <div
                    className={`token-usage-bar ${statusClass}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            <div className="token-usage-info">
                <span className="token-usage-messages">{messages} messages</span>
                <span className="token-usage-remaining">
                    {remaining.toLocaleString()} remaining
                </span>
            </div>
        </div>
    )
}
