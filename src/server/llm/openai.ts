/**
 * OpenAI LLM Service
 *
 * Uses OpenAI models (GPT-4, etc.) as the LLM backend
 * Implements agentic loop with tool_calls response handling
 */

import OpenAI from 'openai'
import { ExecutionEngine, ToolCall, ToolResult } from '../execution-engine'
import { BaseLLMService, QueryResult, ConversationContext, StreamChunk } from './base'

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2'

const getSystemPrompt = (): string => {
    const now = new Date().toISOString();
    return `You are VaultLens, an intelligent agent for querying and managing HashiCorp Vault.

**Current Date/Time: ${now}**

When users ask about time ranges (e.g., "last 30 minutes", "last hour", "today"), calculate them relative to the current time above.

You have access to two MCP servers:

1. **Vault Audit MCP Server** - For querying audit logs:
   - audit.search_events: Search audit events by labels. Returns a SUMMARY that includes:
     * **top_actors**: WHO performed the actions (display_name, remote_addr, event count, operations, namespaces accessed)
     * Event categories and severity counts (critical vs high-risk events)
     * Top patterns (operations, namespaces, mount types)
     * Key insights and sample events
     * Success/failure rates
     * The 'summarized' flag indicates if results are truncated
     * **Authentication filter strategies** - Auth logins appear as write operations on auth mount paths:
       * For AppRole: Use mount_type="approle" (searches write operations to auth/approle/login, auth/approle/lookup, etc.)
       * For OIDC: Use mount_type="oidc" (writes to auth/oidc/callback, auth/oidc/login)
       * For LDAP: Use mount_type="ldap" (writes to auth/ldap/login)
       * For UserPass: Use mount_type="userpass" (writes to auth/userpass/login)
       * For JWT: Use mount_type="jwt" (writes to auth/jwt/login)
       * For all auth: Use mount_type="approle" OR "oidc" OR "ldap" OR "userpass" OR "jwt", or search broadly without mount_type filter
   
   - audit.aggregate: Count events grouped by dimension (namespace, operation, mount_type, status). Very efficient for counts.
   - audit.trace: Trace all events for a specific request ID. Returns timeline summary with first/last events and who accessed what.
   - audit.get_event_details: Get full detailed information for a specific request ID. Use when initial summary results lack important details like role_name, entity_id, request path, or remote_address. Returns complete event objects with raw audit log JSON.

2. **Vault MCP Server** - For directly querying Vault configuration and secrets:
   - list_namespaces: List child namespaces in Vault Enterprise. Use to discover available namespaces.
   - list_mounts: List all mounted secrets engines and auth methods. Optional namespace parameter for Vault Enterprise.
   - list_secrets: List secrets at a path in a KV engine. Optional namespace parameter.
   - read_secret: Read a secret from a KV engine. Optional namespace parameter.
   - list_auth_roles: List roles in an auth mount (approle/jwt/oidc/etc) to discover role names.
   - read_auth_role: Read role configuration including 'token_policies' and auth-specific constraints.
   - analyze_secret_access: Analyze which auth roles can access a Vault API path; supports policy-template-aware conditional results and KV v2 path expansion.
   - list_entities: List identity entities by id or name.
   - read_entity: Read an identity entity including entity metadata and aliases.
   - list_entity_aliases: List identity entity aliases by id.
   - read_entity_alias: Read an identity alias including alias metadata and mount accessor.
   - lookup_self: Read current caller token details (policies, display_name, entity_id, TTL, metadata) via auth/token/lookup-self.
   - read_entity_self: Resolve and read the identity entity associated with the current caller token, including aliases and metadata.
   - introspect_self: Combined self-introspection for token + identity entity data in one call; use before ACL/policy-template analysis.
   - read_replication_status: Get detailed replication status for Performance and DR replication. Returns cluster IDs, replication modes (primary/secondary/disabled), connection states, WAL indexes, merkle tree status, and known secondaries. Use for diagnosing replication health, checking lag, or understanding cluster topology.
   - read_cluster_health: Get comprehensive cluster health including HA status (nodes, leader), Raft autopilot state (server health, failure tolerance, redundancy zones), autopilot configuration, and seal backend status (KMS/HSM health). Use for cluster node count, health monitoring, and raft configuration details.
   - read_metrics: Read Vault telemetry metrics from sys/metrics endpoint. Returns performance metrics, counters, gauges, and summaries including operations/sec, storage metrics, token operations, secret engine activity, and system resource usage. Use for performance monitoring, capacity planning, troubleshooting slow operations, and operational diagnostics.
   - read_host_info: Read host-level runtime and compute details from sys/host-info (OS/runtime/CPU/memory/host characteristics). Use for infrastructure diagnostics and capacity context.
   - list_leases: List leases at a specific prefix path. Returns keys/paths containing leases. Omit prefix to list top-level lease paths. Use to explore lease hierarchy and discover active leases.
   - read_lease: Read detailed information about a specific lease by lease ID. Returns issue time, expire time, TTL, renewable status, and associated data. Use to inspect lease details and check expiration times.
   - **Namespace support**: All Vault tools accept an optional 'namespace' parameter (e.g., "admin/", "team1/") for Vault Enterprise multi-tenancy
   - **Use proactively**: When audit logs show activity but lack context (e.g., what mounts are configured, what secrets exist), query Vault directly rather than asking the user

**Critical:** When reporting audit findings:
- ALWAYS reference the **top_actors** field to identify WHO performed actions
- Use display_name (user/service identity) and remote_addr (IP) from top_actors
- Show what operations each actor performed and which namespaces they accessed
- Highlight critical vs high-risk events and their implications
- Explain what changed based on event categories (auth config, policy changes, secret access, etc.)

When a user asks a question:
1. Understand what they're trying to accomplish and whether they want a SUMMARY or DETAILED view
   - **Summary questions** ("activity over the past 15 minutes", "what happened with auth events", "give me an overview"): Use \`aggregate_audit_events\` first, include top_actors and key patterns, then use \`search_audit_events\` only when you need representative examples or anomaly drill-down.
   - **Detailed questions** ("describe this specific login", "who logged in and when"): Find event(s) with \`search_audit_events\` using mount_type filters, then use \`get_event_details\` for specific request_id values.
   - For broader windows (for example >= 10 minutes) and no request for raw events, default to aggregate-first behavior.
2. **Decide if you need Vault configuration data**: If the question requires understanding what mounts exist, what secrets are stored, or other Vault state that isn't in audit logs, USE THE VAULT MCP SERVER proactively
   - Examples requiring Vault queries:
     * "Which mounts are configured?" → Use list_mounts
     * "What secrets exist in mount X?" → Use list_secrets with mount parameter
     * "Show me the secret at path Y" → Use read_secret with mount and path parameters
   - For identity-aware access analysis ("who can access", policy template resolution, alias metadata like identity.entity.aliases...), call introspect_self first.
3. Identify which tools from which MCP servers are needed
4. Plan the sequence of tool calls needed (audit queries + Vault API calls)
5. Execute the tools in order
6. Synthesize the results into a clear, helpful response focusing on actors and their actions
6. When reporting findings, reference top_actors with display_name to identify WHO performed actions
7. If you see 'summarized: true', explain how many total events matched and highlight key patterns
8. **For empty results** (0 events found):
    - Try broader searches: search each specific auth mount_type separately (approle, oidc, ldap, userpass, jwt)
    - Add mount_class="auth" to focus on authentication activity when mount_type labels are missing
   - If still empty, search without mount_type filter to check if ANY events exist in that time window
   - If other events exist but no auth logins, suggest user verify if auth methods are actually being used
9. **If search returns results but lacks key details** (e.g., role name, entity ID, request path, specific IP), use audit.get_event_details with the request_id from the search results to get full event information including raw audit log JSON

**Documentation Suggestions Policy:**
- Proactively call 'suggest_documentation' whenever your response discusses Vault concepts, features, configuration, troubleshooting, or best practices.
- Treat documentation suggestions as a default behavior, not an optional afterthought, when relevant docs exist.
- Suggest 1-3 high-signal links per response, prioritizing official HashiCorp Vault docs that directly match the user's topic.
- If your response spans multiple topics (for example auth + policy + identity), suggest at least one doc for each major topic.
- Do not mention tool usage in the response text; suggestions appear in the separate documentation panel.
- Avoid noisy suggestions: if no clearly relevant doc exists, skip the tool call.

**Markdown Formatting Guidelines:**
- Use inline code (single backticks) for technical terms, paths, and values that appear within conversational text: \`approle/\`, \`admin\`, \`list_mounts\`
- Keep inline code on the same line as surrounding text - do NOT put it on separate lines
- Only use code blocks (triple backticks) for multi-line code, JSON, or HCL content
- Use tables only for structured data with multiple rows/columns
- Single strings should not be in code blocks - use inline code or plain text as appropriate
- Write naturally - don't force every technical term into markdown formatting unless it aids clarity

Always explain your reasoning and the actions you're taking, especially identifying actors by their display_name.`;
}

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'search_audit_events',
            description: 'Search Vault audit events by labels and filters',
            parameters: {
                type: 'object',
                properties: {
                    limit: {
                        type: 'number',
                        description: 'Max number of events to return (1-500, default 100)',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Filter by Vault namespace',
                    },
                    operation: {
                        type: 'string',
                        description: 'Filter by operation type (e.g., read, write, update)',
                    },
                    mount_type: {
                        type: 'string',
                        description: 'Filter by mount type (e.g., pki, secret, auth)',
                    },
                    mount_class: {
                        type: 'string',
                        description: 'Filter by mount class (e.g., auth, secret, system)',
                    },
                    status: {
                        type: 'string',
                        enum: ['ok', 'error'],
                        description: 'Filter by status',
                    },
                    start_rfc3339: {
                        type: 'string',
                        description: 'Start time (RFC3339 format, default now-15m)',
                    },
                    end_rfc3339: {
                        type: 'string',
                        description: 'End time (RFC3339 format, default now)',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'aggregate_audit_events',
            description: 'Count audit events grouped by a dimension',
            parameters: {
                type: 'object',
                properties: {
                    by: {
                        type: 'string',
                        enum: [
                            'vault_namespace',
                            'vault_operation',
                            'vault_mount_type',
                            'vault_mount_class',
                            'vault_status',
                        ],
                        description: 'Group by this dimension',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Filter by namespace',
                    },
                    operation: {
                        type: 'string',
                        description: 'Filter by operation',
                    },
                    mount_type: {
                        type: 'string',
                        description: 'Filter by mount type',
                    },
                    mount_class: {
                        type: 'string',
                        description: 'Filter by mount class',
                    },
                    status: {
                        type: 'string',
                        enum: ['ok', 'error'],
                        description: 'Filter by status',
                    },
                },
                required: ['by'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'trace_request',
            description: 'Trace all audit events for a specific request ID',
            parameters: {
                type: 'object',
                properties: {
                    request_id: {
                        type: 'string',
                        description: 'The Vault request ID to trace',
                    },
                    limit: {
                        type: 'number',
                        description: 'Max number of events to return (default 100)',
                    },
                },
                required: ['request_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_event_details',
            description: 'Get full detailed information for a specific audit event by request ID. Returns complete event details including request path, role name, entity ID, remote address, and raw audit log JSON. Use when initial search results lack important details.',
            parameters: {
                type: 'object',
                properties: {
                    request_id: {
                        type: 'string',
                        description: 'The Vault request ID to retrieve detailed event for',
                    },
                },
                required: ['request_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_namespaces',
            description: 'List child namespaces within a Vault Enterprise namespace. Requires Vault Enterprise. Returns all namespaces under the specified parent namespace path.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Parent namespace path to list from (e.g., "admin/" or empty for root)',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_mounts',
            description: 'List all mounted secrets engines and auth methods in Vault. Returns a comprehensive list of all mounts including their type, description, and path. Supports querying specific namespaces in Vault Enterprise.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path to query (e.g., "admin/"). If not specified, queries the root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_secrets',
            description: 'List secrets at a specific path in a KV secrets engine. Supports querying specific namespaces.',
            parameters: {
                type: 'object',
                properties: {
                    mount: {
                        type: 'string',
                        description: 'The mount path where secrets are stored (e.g., "secret", "kv")',
                    },
                    path: {
                        type: 'string',
                        description: 'The path within the mount to list (e.g., "app1/", "team/" - use empty string for root)',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path to query (e.g., "admin/"). If not specified, queries the root namespace context.',
                    },
                },
                required: ['mount'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_secret',
            description: 'Read a secret from a KV secrets engine at a specific path. Supports querying specific namespaces.',
            parameters: {
                type: 'object',
                properties: {
                    mount: {
                        type: 'string',
                        description: 'The mount path where the secret is stored (e.g., "secret", "kv")',
                    },
                    path: {
                        type: 'string',
                        description: 'The path to the secret (e.g., "app1/db-credentials", "team/api-key")',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path to query (e.g., "admin/"). If not specified, queries the root namespace context.',
                    },
                },
                required: ['mount', 'path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_policies',
            description: 'List all ACL policies configured in Vault. Returns the names of all policies available in the specified namespace. Use to discover what policies exist.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path to list policies from (e.g., "admin/"). If not specified, lists from the root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_policy',
            description: 'Read the contents of a specific Vault ACL policy. Returns the policy rules in HCL format. Use when you need to understand what permissions a policy grants.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The name of the policy to read (e.g., "default", "admin-policy")',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path where the policy exists (e.g., "admin/"). If not specified, reads from the root namespace context.',
                    },
                },
                required: ['name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_auth_methods',
            description: 'List all enabled authentication methods in Vault. Returns information about each auth method including type, path, accessor, and configuration details. Use to discover what auth methods are configured.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path to list auth methods from (e.g., "admin/"). If not specified, lists from the root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_auth_method',
            description: 'Read detailed configuration and information about a specific authentication method in Vault. Returns full details including config, options, and metadata for the specified auth method.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The mount path of the auth method to read (e.g., "approle/", "userpass/", "oidc/"). Include trailing slash.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path where the auth method exists (e.g., "admin/"). If not specified, reads from the root namespace context.',
                    },
                },
                required: ['path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_auth_roles',
            description: 'List all roles configured in a Vault auth method. Returns role names for role-based auth methods like approle, jwt, oidc, kubernetes, aws, gcp, azure. For userpass use path_suffix="users", for ldap use path_suffix="groups" or "users". Use this to discover what roles exist before reading their details.',
            parameters: {
                type: 'object',
                properties: {
                    mount: {
                        type: 'string',
                        description: 'Auth method mount path (e.g., "approle", "jwt", "kubernetes"). Do not include trailing slash.',
                    },
                    path_suffix: {
                        type: 'string',
                        description: 'Path suffix for listing roles. Defaults to "role" (standard for most auth methods). Use "users" for userpass, "groups" or "users" for ldap.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (e.g., "admin/"). If not specified, uses root namespace context.',
                    },
                },
                required: ['mount'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_auth_role',
            description: 'Read complete configuration of a specific role in a Vault auth method. Returns role details including assigned policies (token_policies), token TTL settings, CIDR restrictions, and auth method-specific configuration. Use this to examine what permissions and constraints a role has. Works for approle, jwt, oidc, kubernetes, aws, gcp, azure, userpass (path_suffix="users"), ldap (path_suffix="groups" or "users").',
            parameters: {
                type: 'object',
                properties: {
                    mount: {
                        type: 'string',
                        description: 'Auth method mount path (e.g., "approle", "jwt", "kubernetes"). Do not include trailing slash.',
                    },
                    role_name: {
                        type: 'string',
                        description: 'Name of the role to read (for userpass this is username, for ldap this is group/user name).',
                    },
                    path_suffix: {
                        type: 'string',
                        description: 'Path suffix for reading roles. Defaults to "role" (standard for most auth methods). Use "users" for userpass, "groups" or "users" for ldap.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (e.g., "admin/"). If not specified, uses root namespace context.',
                    },
                },
                required: ['mount', 'role_name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'analyze_secret_access',
            description: 'Analyze which auth roles can access a Vault API path. Supports conditional evaluation for policy templates and optional KV v2 path expansion.',
            parameters: {
                type: 'object',
                properties: {
                    target_path: {
                        type: 'string',
                        description: 'Vault API path to analyze (for example "sys/mounts" or "kv/tenant-2/secret").',
                    },
                    required_capabilities: {
                        type: 'string',
                        description: 'Comma-separated capabilities required on target_path (for example "read" or "update,read").',
                    },
                    include_kv_v2_paths: {
                        type: 'boolean',
                        description: 'When true, expands KV v2 shorthand/related paths to include data/metadata ACL checks.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                    template_values: {
                        type: 'object',
                        description: 'Optional map used to resolve policy template tokens.',
                    },
                },
                required: ['target_path'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_entities',
            description: 'List Vault identity entities by id or name.',
            parameters: {
                type: 'object',
                properties: {
                    list_by: {
                        type: 'string',
                        enum: ['id', 'name'],
                        description: 'List entities by "id" (default) or "name".',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_entity',
            description: 'Read a Vault identity entity by id or name, including entity metadata and aliases.',
            parameters: {
                type: 'object',
                properties: {
                    entity_id: {
                        type: 'string',
                        description: 'Entity ID to read. Provide either entity_id or entity_name.',
                    },
                    entity_name: {
                        type: 'string',
                        description: 'Entity name to read. Provide either entity_id or entity_name.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_entity_aliases',
            description: 'List Vault identity entity aliases by id.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_entity_alias',
            description: 'Read a Vault identity entity alias by id, including alias metadata and mount accessor.',
            parameters: {
                type: 'object',
                properties: {
                    alias_id: {
                        type: 'string',
                        description: 'Entity alias ID to read.',
                    },
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
                required: ['alias_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'lookup_self',
            description: 'Look up details about the current Vault token (auth/token/lookup-self), including policies, entity_id, display_name, TTL, and metadata.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_entity_self',
            description: 'Read the Vault identity entity associated with the current token by resolving entity_id from auth/token/lookup-self. Includes entity metadata and aliases.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'introspect_self',
            description: 'Introspect current Vault identity by combining auth/token/lookup-self and identity/entity/id/:entity_id (when present). Useful for policy/template-aware access analysis.',
            parameters: {
                type: 'object',
                properties: {
                    namespace: {
                        type: 'string',
                        description: 'Namespace path (for example "admin/"). If not specified, uses root namespace context.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_replication_status',
            description: 'Get detailed replication status for Performance and DR replication. Returns cluster IDs, replication modes (primary/secondary/disabled), connection states, WAL indexes, merkle tree status, and known secondaries. Use for diagnosing replication health, checking lag, or understanding cluster topology.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_metrics',
            description: 'Read Vault telemetry metrics from sys/metrics endpoint. Returns performance metrics, counters, gauges, and summaries including operations/sec, storage metrics, token operations, secret engine activity, system resource usage, and lease information. Use for performance monitoring, capacity planning, troubleshooting slow operations, checking lease counts, and operational diagnostics.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_host_info',
            description: 'Read detailed host information from Vault sys/host-info endpoint, including OS, runtime, memory, CPU, and host-level characteristics useful for diagnostics and capacity analysis.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_leases',
            description: 'List leases in Vault at a specific prefix path. Returns keys/paths containing leases. Omit prefix to list top-level lease paths. Use this to discover what lease paths exist before reading specific lease details. Useful for exploring lease hierarchy and finding active leases.',
            parameters: {
                type: 'object',
                properties: {
                    prefix: {
                        type: 'string',
                        description: 'Lease path prefix to list under (e.g., "database/creds", "pki/issue"). Omit to list top-level lease paths.',
                    },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_lease',
            description: 'Read detailed information about a specific Vault lease by lease ID. Returns lease metadata including issue time, expire time, TTL, renewable status, and associated secret data. Use this to inspect individual lease details, check expiration times, or troubleshoot lease-related issues.',
            parameters: {
                type: 'object',
                properties: {
                    lease_id: {
                        type: 'string',
                        description: 'The lease ID to retrieve details for (e.g., "database/creds/readonly/abc123", "pki/issue/server-cert/xyz789").',
                    },
                },
                required: ['lease_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'read_cluster_health',
            description: 'Read comprehensive cluster health information including HA status (nodes, leader), Raft autopilot state (server health, failure tolerance, redundancy zones, node lifecycle), autopilot configuration (cleanup settings, thresholds), and seal backend status (KMS/HSM health). Provides detailed insights beyond basic sys/health endpoint for monitoring cluster quorum and external dependency health. Use when you need to know cluster node count, health status, or raft configuration.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'suggest_documentation',
            description: 'Suggest relevant HashiCorp Vault documentation for the user to reference. Use this tool to provide helpful documentation links WITHOUT including them in your conversational response. The suggestions will appear in a separate panel. Call this tool when you mention Vault concepts, features, or configurations that have official documentation. Do NOT mention that you are suggesting documentation in your response text - the suggestions appear automatically in a separate area.',
            parameters: {
                type: 'object',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Clear, concise title for the documentation (e.g., "Vault Token Lifecycle", "AppRole Authentication")',
                    },
                    url: {
                        type: 'string',
                        description: 'Full URL to the HashiCorp Vault documentation page (e.g., "https://developer.hashicorp.com/vault/docs/concepts/tokens")',
                    },
                    description: {
                        type: 'string',
                        description: 'Brief description of what the documentation covers and why it\'s relevant (1-2 sentences)',
                    },
                    context: {
                        type: 'string',
                        description: 'Optional context about why this documentation is being suggested for this specific query',
                    },
                },
                required: ['title', 'url', 'description'],
            },
        },
    },
]

export class OpenAILLMService extends BaseLLMService {
    private client: OpenAI

    constructor(executionEngine: ExecutionEngine) {
        super(executionEngine)
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        })
    }

    /**
     * Execute a query using OpenAI with agentic loop
     */
    async executeQuery(query: string, context?: ConversationContext): Promise<QueryResult> {
        console.log(`[OpenAI Agent] Processing query: ${query}`)

        // Get current timestamp and add it to the query for context
        const now = new Date();
        const timestamp = now.toISOString();
        const contextualQuery = `[Current date/time: ${timestamp}]\n\nUser Query: ${query}`;

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: contextualQuery,
        })

        const toolCalls: ToolCall[] = []
        const toolResults: ToolResult[] = []
        let reasoning = ''

        try {
            // Step 1: Call OpenAI to decide what tools to call
            // For OpenAI, prepend system context to conversation
            let messages: OpenAI.Chat.ChatCompletionMessageParam[] = this.conversationHistory.map(
                (msg) => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                })
            )

            // On first call, prepend system prompt to user's first message
            if (messages.length === 1 && messages[0].role === 'user') {
                messages[0] = {
                    role: 'user',
                    content: `${getSystemPrompt()}\n\nUser Query: ${messages[0].content}`,
                }
            }

            console.log('[OpenAI Agent] Calling OpenAI to plan execution...')
            let response = await this.client.chat.completions.create({
                model: OPENAI_MODEL,
                max_completion_tokens: 4096,
                tools: TOOLS,
                messages,
            })

            reasoning = this.extractTextFromResponse(response)

            // Step 2: Process tool calls in an agentic loop
            while (response.choices[0].finish_reason === 'tool_calls') {
                const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
                    role: 'assistant',
                    content: response.choices[0].message.content || '',
                }
                if (response.choices[0].message.tool_calls) {
                    ; (assistantMessage as OpenAI.Chat.ChatCompletionAssistantMessageParam).tool_calls =
                        response.choices[0].message.tool_calls
                }

                this.conversationHistory.push({
                    role: 'assistant',
                    content: typeof assistantMessage.content === 'string' ? assistantMessage.content : '',
                })
                messages.push(assistantMessage)

                const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = []

                // Execute all tool calls in this response
                if (response.choices[0].message.tool_calls) {
                    for (const toolCallBlock of response.choices[0].message.tool_calls) {
                        if (toolCallBlock.type === 'function') {
                            const toolCall = this.toolCallToToolCall(
                                toolCallBlock.function.name,
                                toolCallBlock.function.arguments
                            )
                            toolCalls.push(toolCall)

                            console.log(
                                `[OpenAI Agent] Executing tool: ${toolCallBlock.function.name}`
                            )
                            const result = await this.executionEngine.executeTool(toolCall)
                            toolResults.push(result)

                            toolResultMessages.push({
                                role: 'tool',
                                tool_call_id: toolCallBlock.id,
                                content: JSON.stringify(result),
                            })
                        }
                    }
                }

                // Send tool results back to OpenAI
                messages.push(...toolResultMessages)

                // Get next response
                response = await this.client.chat.completions.create({
                    model: OPENAI_MODEL,
                    max_completion_tokens: 4096,
                    tools: TOOLS,
                    messages,
                })
            }

            // Step 3: Extract final response
            const finalResponse = this.extractTextFromResponse(response)

            // Log raw markdown response for debugging
            console.log('[OpenAI Agent] Raw markdown response:')
            console.log('='.repeat(80))
            console.log(finalResponse)
            console.log('='.repeat(80))

            // Add OpenAI's final response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: finalResponse,
            })

            const result: QueryResult = {
                query,
                response: finalResponse,
                toolCalls,
                toolResults,
                reasoning,
                timestamp: new Date().toISOString(),
            }

            this.queryHistory.push(result)
            console.log('[OpenAI Agent] Query complete')

            return result
        } catch (error) {
            console.error('[OpenAI Agent] Error:', error)
            throw error
        }
    }

    async *executeQueryStream(
        query: string,
        context?: ConversationContext
    ): AsyncGenerator<StreamChunk, void, unknown> {
        console.log(`[OpenAI Agent] Processing streaming query: ${query}`)

        // Get current timestamp and add it to the query for context
        const now = new Date()
        const timestamp = now.toISOString()
        const contextualQuery = `[Current date/time: ${timestamp}]\n\nUser Query: ${query}`

        // Add user message to history
        this.conversationHistory.push({
            role: 'user',
            content: contextualQuery,
        })

        const toolCalls: ToolCall[] = []
        const toolResults: ToolResult[] = []
        let reasoning = ''
        let fullResponse = ''

        try {
            // Step 1: Stream OpenAI's response
            let messages: OpenAI.Chat.ChatCompletionMessageParam[] = this.conversationHistory.map(
                (msg) => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                })
            )

            // On first call, prepend system prompt to user's first message
            if (messages.length === 1 && messages[0].role === 'user') {
                messages[0] = {
                    role: 'user',
                    content: `${getSystemPrompt()}\n\nUser Query: ${messages[0].content}`,
                }
            }

            console.log('[OpenAI Agent] Starting OpenAI stream...')
            let stream = await this.client.chat.completions.create({
                model: OPENAI_MODEL,
                max_completion_tokens: 4096,
                tools: TOOLS,
                messages,
                stream: true,
            })

            // Step 2: Process stream with agentic loop for tool calls
            let needsMoreIterations = true
            while (needsMoreIterations) {
                needsMoreIterations = false
                fullResponse = ''
                let currentToolCalls: OpenAI.Chat.ChatCompletionChunk.Choice.Delta.ToolCall[] = []

                for await (const chunk of stream) {
                    const delta = chunk.choices[0]?.delta

                    if (delta?.content) {
                        fullResponse += delta.content
                        yield { type: 'text', content: delta.content }
                    }

                    // Collect tool calls from the stream
                    if (delta?.tool_calls) {
                        for (const toolCallChunk of delta.tool_calls) {
                            const index = toolCallChunk.index
                            if (!currentToolCalls[index]) {
                                currentToolCalls[index] = {
                                    index,
                                    id: toolCallChunk.id || '',
                                    type: 'function',
                                    function: { name: '', arguments: '' },
                                }
                            }
                            if (toolCallChunk.function?.name) {
                                currentToolCalls[index].function!.name += toolCallChunk.function.name
                            }
                            if (toolCallChunk.function?.arguments) {
                                currentToolCalls[index].function!.arguments +=
                                    toolCallChunk.function.arguments
                            }
                        }
                    }

                    // Check if streaming finished
                    if (chunk.choices[0]?.finish_reason === 'tool_calls') {
                        needsMoreIterations = true
                    }
                }

                // Execute tool calls if any
                if (currentToolCalls.length > 0) {
                    const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
                        role: 'assistant',
                        content: fullResponse || null,
                        tool_calls: currentToolCalls.map((tc) => ({
                            id: tc.id || '',
                            type: 'function' as const,
                            function: {
                                name: tc.function?.name || '',
                                arguments: tc.function?.arguments || '',
                            },
                        })),
                    }

                    this.conversationHistory.push({
                        role: 'assistant',
                        content: fullResponse || '',
                    })
                    messages.push(assistantMessage)

                    const toolResultMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = []

                    // Execute all tool calls
                    for (const toolCallBlock of currentToolCalls) {
                        const toolCall = this.toolCallToToolCall(
                            toolCallBlock.function?.name || '',
                            toolCallBlock.function?.arguments || ''
                        )
                        toolCalls.push(toolCall)

                        yield { type: 'tool_call', toolCall }

                        console.log(`[OpenAI Agent] Executing tool: ${toolCallBlock.function!.name}`)
                        const result = await this.executionEngine.executeTool(toolCall)
                        toolResults.push(result)

                        yield { type: 'tool_result', toolResult: result }

                        toolResultMessages.push({
                            role: 'tool',
                            tool_call_id: toolCallBlock.id!,
                            content: JSON.stringify(result),
                        })
                    }

                    // Send tool results back to OpenAI
                    messages.push(...toolResultMessages)

                    // Start new stream with tool results
                    stream = await this.client.chat.completions.create({
                        model: OPENAI_MODEL,
                        max_completion_tokens: 4096,
                        tools: TOOLS,
                        messages,
                        stream: true,
                    })
                }
            }

            // Add OpenAI's final response to history
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse,
            })

            const result: QueryResult = {
                query,
                response: fullResponse,
                toolCalls,
                toolResults,
                reasoning,
                timestamp: new Date().toISOString(),
            }

            this.queryHistory.push(result)
            console.log('[OpenAI Agent] Streaming query complete')

            yield { type: 'done', result }
        } catch (error) {
            console.error('[OpenAI Agent] Streaming error:', error)
            throw error
        }
    }

    /**
     * Convert OpenAI's tool call to our ToolCall format
     */
    private toolCallToToolCall(toolName: string, args: string | Record<string, unknown>): ToolCall {
        const input = typeof args === 'string' ? JSON.parse(args) : args

        // Map LLM tool names to actual MCP server tool names
        if (toolName === 'search_audit_events') {
            return {
                type: 'audit',
                tool: 'audit.search_events', // vault-audit-mcp tool name
                arguments: input,
            }
        } else if (toolName === 'aggregate_audit_events') {
            return {
                type: 'audit',
                tool: 'audit.aggregate', // vault-audit-mcp tool name
                arguments: input,
            }
        } else if (toolName === 'trace_request') {
            return {
                type: 'audit',
                tool: 'audit.trace', // vault-audit-mcp tool name
                arguments: input,
            }
        } else if (toolName === 'get_event_details') {
            return {
                type: 'audit',
                tool: 'audit.get_event_details', // vault-audit-mcp tool name
                arguments: input,
            }
        } else if (toolName === 'list_namespaces' || toolName === 'list_mounts' || toolName === 'list_secrets' || toolName === 'read_secret' || toolName === 'list_policies' || toolName === 'read_policy' || toolName === 'list_auth_methods' || toolName === 'read_auth_method' || toolName === 'list_auth_roles' || toolName === 'read_auth_role' || toolName === 'analyze_secret_access' || toolName === 'list_entities' || toolName === 'read_entity' || toolName === 'list_entity_aliases' || toolName === 'read_entity_alias' || toolName === 'lookup_self' || toolName === 'read_entity_self' || toolName === 'introspect_self' || toolName === 'read_replication_status' || toolName === 'read_metrics' || toolName === 'read_host_info' || toolName === 'list_leases' || toolName === 'read_lease' || toolName === 'read_cluster_health') {
            return {
                type: 'vault',
                tool: toolName, // vault-mcp-server tool name
                arguments: input,
            }
        } else if (toolName === 'suggest_documentation') {
            return {
                type: 'system',
                tool: 'suggest_documentation',
                arguments: input,
            }
        }
        throw new Error(`Unknown tool: ${toolName}`)
    }

    /**
     * Extract text from OpenAI's response
     */
    private extractTextFromResponse(response: OpenAI.Chat.ChatCompletion): string {
        return response.choices[0].message.content || ''
    }
}
