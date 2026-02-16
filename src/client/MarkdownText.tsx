import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownTextProps {
    content: string
}

/**
 * Renders markdown text with full GFM (GitHub Flavored Markdown) support.
 * Follows CommonMark and GFM specifications:
 * - Inline code: `text` (single backticks, no line breaks)
 * - Code blocks: ```language\ncode\n``` (triple backticks with newlines)
 * - Tables: GFM table syntax with pipes
 * - Lists: -, *, or numbered
 * - And standard markdown formatting
 * 
 * No normalization is applied - content is rendered as the LLM generates it.
 */
export function MarkdownText({ content }: MarkdownTextProps) {
    // Log raw markdown content for debugging
    console.log('[MarkdownText] Raw content:')
    console.log('='.repeat(80))
    console.log(content)
    console.log('='.repeat(80))

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                // Style tables properly
                table: ({ node, ...props }) => (
                    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                        <table {...props} style={{
                            borderCollapse: 'collapse',
                            width: '100%',
                            fontSize: '0.9em',
                        }} />
                    </div>
                ),
                thead: ({ node, ...props }) => (
                    <thead {...props} style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderBottom: '2px solid var(--border)',
                    }} />
                ),
                th: ({ node, ...props }) => (
                    <th {...props} style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontWeight: 600,
                        borderBottom: '1px solid var(--border)',
                    }} />
                ),
                td: ({ node, ...props }) => (
                    <td {...props} style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--border-light)',
                    }} />
                ),
                tr: ({ node, ...props }) => (
                    <tr {...props} style={{
                        borderBottom: '1px solid var(--border-light)',
                    }} />
                ),
                // Style code blocks
                code: ({ node, inline, className, children, ...props }) => {
                    console.log('[MarkdownText] Code element:', { inline, className, children, hasNode: !!node })

                    // Safety check: If content has no newlines, it's inline code regardless of what react-markdown says
                    const content = String(children)
                    const isActuallyInline = inline || !content.includes('\n')

                    if (isActuallyInline) {
                        return <code className="inline-code" {...props}>{children}</code>
                    }

                    // Only use <pre> wrapper for actual multi-line code blocks
                    return (
                        <pre style={{
                            backgroundColor: 'var(--bg-secondary)',
                            padding: '1rem',
                            borderRadius: '6px',
                            overflow: 'auto',
                            marginTop: '0.5rem',
                            marginBottom: '0.5rem',
                        }}>
                            <code className={className} {...props}>{children}</code>
                        </pre>
                    )
                },
                // Style links
                a: ({ node, ...props }) => (
                    <a {...props} style={{
                        color: 'var(--primary)',
                        textDecoration: 'none',
                    }} />
                ),
                // Style lists
                ul: ({ node, ...props }) => (
                    <ul {...props} style={{
                        marginLeft: '1.5rem',
                        marginTop: '0.5rem',
                        marginBottom: '0.5rem',
                    }} />
                ),
                ol: ({ node, ...props }) => (
                    <ol {...props} style={{
                        marginLeft: '1.5rem',
                        marginTop: '0.5rem',
                        marginBottom: '0.5rem',
                    }} />
                ),
                // Style headings
                h1: ({ node, ...props }) => (
                    <h1 {...props} style={{
                        fontSize: '1.5em',
                        fontWeight: 600,
                        marginTop: '1rem',
                        marginBottom: '0.5rem',
                    }} />
                ),
                h2: ({ node, ...props }) => (
                    <h2 {...props} style={{
                        fontSize: '1.3em',
                        fontWeight: 600,
                        marginTop: '1rem',
                        marginBottom: '0.5rem',
                    }} />
                ),
                h3: ({ node, ...props }) => (
                    <h3 {...props} style={{
                        fontSize: '1.1em',
                        fontWeight: 600,
                        marginTop: '0.5rem',
                        marginBottom: '0.5rem',
                    }} />
                ),
                // Style paragraphs - let CSS handle margins for proper flow
                p: ({ node, ...props }) => (
                    <p {...props} />
                ),
            }}
        >
            {content}
        </ReactMarkdown>
    )
}
