/**
 * LLM Factory
 *
 * Factory pattern for creating the appropriate LLM service instance
 * based on the LLM_PROVIDER environment variable
 */

import { ExecutionEngine } from './execution-engine'
import { BaseLLMService } from './llm/base'
import { AnthropicLLMService } from './llm/anthropic'
import { OpenAILLMService } from './llm/openai'

export type LLMProvider = 'anthropic' | 'openai'

/**
 * Create an LLM service instance based on the configured provider
 *
 * @param executionEngine - The execution engine to pass to the service
 * @returns An instance of the appropriate LLM service
 * @throws Error if the provider is not configured or is invalid
 */
export function createLLMService(executionEngine: ExecutionEngine): BaseLLMService {
    const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase() as LLMProvider

    console.log(`[LLM Factory] Creating ${provider} LLM service`)

    switch (provider) {
        case 'anthropic':
            if (!process.env.ANTHROPIC_API_KEY) {
                throw new Error('ANTHROPIC_API_KEY environment variable is not set')
            }
            return new AnthropicLLMService(executionEngine)

        case 'openai':
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OPENAI_API_KEY environment variable is not set')
            }
            return new OpenAILLMService(executionEngine)

        default:
            throw new Error(
                `Unknown LLM provider: ${provider}. Supported providers: anthropic, openai`
            )
    }
}
