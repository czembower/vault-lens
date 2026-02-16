/**
 * Agent Service
 *
 * ⚠️ DEPRECATED: This module is kept for backward compatibility.
 * New code should import from './llm/base' and use createLLMService() from './llm-factory'
 *
 * This module now re-exports from the new modular LLM architecture
 * that supports multiple LLM providers (Anthropic, OpenAI, etc.)
 */

export { BaseLLMService as AgentService, QueryResult, ConversationContext } from './llm/base'
export { AnthropicLLMService } from './llm/anthropic'
export { OpenAILLMService } from './llm/openai'

