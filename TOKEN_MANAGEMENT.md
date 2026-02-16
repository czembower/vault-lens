# Token Management & Data Reduction Strategy

## Problem Statement

On initial queries to the vault-audit-mcp server, responses could contain thousands of audit events. Each event can be 2-5KB in size (including full Raw JSON data), resulting in responses of 100KB+ being sent to the LLM. This causes token overflow errors like:

```
400 Input tokens exceed the configured limit of 272000 tokens. 
Your messages resulted in 402740 tokens.
```

## Solution: Tiered Data Reduction

The solution implements multiple layers of data reduction, with each tier becoming more aggressive:

### Tier 1: Server-Side Summarization (Primary)

**Location:** vault-audit-mcp (Go code)
**Approach:** Return intelligent summaries instead of raw event lists

#### Search Events Summarization
```
Before: [Event, Event, Event, ...] (100+ events × 2KB each)
After: SearchSummary {
  total_events: 12847,
  statistics: { total_success: 12600, total_errors: 247 },
  top_namespaces: [ { namespace: "admin", count: 8000 }, ... ],
  top_operations: [ { operation: "read", count: 10500 }, ... ],
  top_mount_types: [ { mount_type: "pki", count: 5000 }, ... ],
  success_rate: 0.981,
  sample_events: [Event, Event, Event, Event, Event]  ← Only 5 samples
}
```

**Size Reduction:** 100+ events → 1 summary + 5 samples = **~98% reduction**

#### Trace Summarization
```
Before: [Event, Event, Event, ...] (all events in request trace)
After: TraceSummary {
  request_id: "12345-abcde",
  total_events: 42,
  timeline: "Trace started at 21:45:00 and ended at 21:45:02 (42 events)",
  first_event: Event,
  last_event: Event,
  namespaces: ["admin", "engineering"],
  operations: ["read", "write", "list"],
  sample_events: [Event, Event, Event]  ← Only 3 samples
}
```

**Size Reduction:** Full trace → Summary + 3 samples = **~80% reduction**

#### Aggregate (Already Efficient)
```
Returns: [
  { key: "admin", value: 8000 },
  { key: "engineering", value: 4000 },
  { key: "finance", value: 847 }
]
```

No changes needed - very compact by nature.

### Tier 2: LLM Awareness (Secondary)

**Location:** VaultLens LLM system prompts
**Approach:** Train the LLM to understand and work effectively with summaries

The LLM system prompt now explains:
- What the summary format contains
- That `summarized: true` flag indicates truncated results
- How to ask targeted follow-up questions if it needs more specific data
- That samples show representative events

Example LLM behavior:
```
User: "Tell me about audit events in the last hour"
LLM: Calls search_events for last 1 hour
Response: SearchSummary showing 12,847 total events, top patterns: read (87%), write (10%)
LLM: "I found 12,847 audit events in the last hour. The most common operations are:
     - Read operations: 10,700 (87%)
     - Write operations: 1,247 (10%)
     Top accessed namespaces: admin (65%), engineering (25%)
     Success rate: 98.1%"
```

If more detail needed:
```
User: "Which specific admin reads failed?"
LLM: Calls search_events with filters (namespace=admin, operation=read, status=error)
Response: Smaller SearchSummary (e.g., 47 matching events)
```

### Tier 3: Response Filtering (Tertiary - if needed)

**Location:** VaultLens ExecutionEngine (TypeScript)
**Approach:** Further filter tool responses before sending to LLM (not yet implemented)

Could include:
- Strip `Stream` metadata from sample events
- Apply additional size limits
- Cache frequently-accessed results

## Token Savings Calculation

### Before Optimization
- Query: "Tell me about last hour of activity"
- Server Response: 5,000 events × 3KB per event = 15MB = ~1.9M tokens
- Status: ❌ **TOKEN LIMIT EXCEEDED**

### After Optimization
- Query: "Tell me about last hour of activity"
- Server Response: 1 summary (2KB) + 5 samples (5KB) = 7KB = ~1,750 tokens
- Status: ✅ **WELL WITHIN LIMITS**

**Reduction Factor:** ~1,000x in typical cases

## Configuration Options

### vault-audit-mcp (Go)

Currently, summarization is always enabled. Future options could include:

```bash
# Disable summarization (return raw events - use with caution)
AUDIT_DISABLE_SUMMARIZATION=true

# Maximum events before forcing summary response
AUDIT_MAX_EVENTS_FULL_RESPONSE=50

# Maximum events to include in summary samples
AUDIT_SUMMARY_SAMPLE_SIZE=5

# Maximum bucket item results
AUDIT_MAX_TOP_ITEMS=5
```

### VaultLens (TypeScript)

System prompts are in:
- `src/server/llm/anthropic.ts` - Anthropic/Claude system prompt
- `src/server/llm/openai.ts` - OpenAI system prompt

Both explain the summary format to the LLM.

## Data Flows

### Flow 1: Large Result Set (Thousands of Events)
```
User Query
  ↓
LLM calls search_audit_events(..., start: "2026-02-10T21:00Z", end: "2026-02-10T22:00Z")
  ↓
vault-audit-mcp receives search request
  ↓
Backend queries Loki → 12,847 matching events
  ↓
SummarizeSearch() creates summary
  - Counts events by namespace, operation, mount_type
  - Calculates success/error rates
  - Strips Raw data from first 5 events (keeps key fields)
  ↓
Returns: SearchSummary (7KB)
  ├─ total_events: 12847
  ├─ top_namespaces: [admin: 8000, ...]
  ├─ top_operations: [read: 10500, ...]
  ├─ success_rate: 0.981
  ├─ sample_events: [Event(no raw), ...]
  └─ summarized: true
  ↓
LLM receives ~1,750 tokens instead of ~1.9M tokens
  ↓
LLM interprets summary and responds to user naturally
```

### Flow 2: Specific Follow-up (Narrows Scope)
```
User: "Which admin operations failed?"
  ↓
LLM calls search_audit_events(..., namespace: "admin", status: "error")
  ↓
vault-audit-mcp queries Loki → 47 matching events
  ↓
SummarizeSearch() creates summary (smaller result set)
  - Still summarizes, but smaller number
  ├─ total_events: 47
  ├─ sample_events: 5 samples
  └─ summarized: false  (fewer events than limit, showing all)
  ↓
LLM now has detailed view of failures
```

### Flow 3: Counting Query (Always Efficient)
```
User: "Give me a breakdown of operations"
  ↓
LLM calls audit.aggregate (dimension: "vault_operation")
  ↓
vault-audit-mcp returns:
  [
    { key: "read", value: 10500 },
    { key: "write", value: 1500 },
    ...
  ]
  ↓
Very efficient - always returns compressed format
```

## Future Enhancements

1. **Configurable Summarization Levels**
   - Level 1: Stats only (no samples)
   - Level 2: Stats + top patterns
   - Level 3: Stats + patterns + samples (current)
   - Level 4: Full events (for compatibility)

2. **Smart Caching**
   - Cache recent queries to avoid re-fetching
   - Return cached summaries on repeated queries

3. **Pagination Support**
   - For cases where user wants to review all matching events
   - "Show me the next batch of results from this search"

4. **Trend Analysis**
   - Include 5-minute trends in summaries
   - "Error rate increased 3x in last 5 minutes"

5. **Anomaly Detection**
   - Flag unusual patterns in summaries
   - "Unusual spike in failed operations from IP X"

## Testing & Verification

To verify the system is working:

1. **Make a query** to VaultLens:
   ```
   "Tell me about activity in the last 60 minutes"
   ```

2. **Check the response format** - should see:
   ```json
   {
     "total_events": 5247,
     "statistics": { ... },
     "top_namespaces": [ ... ],
     "success_rate": 0.95,
     "sample_events": [ ... ],
     "summarized": true
   }
   ```

3. **Monitor token usage** - should be dramatically lower than before

4. **Verify LLM understands** - LLM should naturally interpret the summary and explain findings to user

## Files Modified

### vault-audit-mcp
- `internal/audit/summary.go` - NEW: Summarization logic
- `internal/audit/tools.go` - Modified: Use summaries in tool handlers
- `SUMMARIZATION.md` - NEW: Technical documentation

### VaultLens
- `src/server/llm/anthropic.ts` - Modified: Updated system prompt
- `src/server/llm/openai.ts` - Modified: Updated system prompt
- `TOKEN_MANAGEMENT.md` - NEW: This document

## References

- [Vault Audit MCP Summarization](../vault-audit-mcp/SUMMARIZATION.md)
- [LLM Provider Configuration](./LLM_PROVIDERS.md)
- [MCP Stdio Integration](./MCP_STDIO.md)
