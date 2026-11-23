/**
 * ============================================================================
 * CodeNibbl — Universal Multi-Model LLM Router (`src/llm/universalRouter.ts`)
 * ============================================================================
 * Connects to ANY LLM provider using zero external SDK dependencies:
 * - `vscode-lm` : Native VS Code Language Model API (Copilot / Cursor) — Free!
 * - `openai`    : OpenAI Chat Completions REST API
 * - `gemini`    : Google Gemini OpenAI-Compatible REST API
 * - `xai`       : xAI (Grok) OpenAI-Compatible REST API
 * - `anthropic` : Anthropic Claude Messages REST API (`/v1/messages`)
 * - `custom`    : Local Ollama / OpenRouter / vLLM OpenAI-Compatible endpoint
 *
 * SECURITY INVARIANTS:
 * 1. Always validate URLs via `resolveAndValidateEndpoint()` (blocks SSRF & plain HTTP).
 * 2. Always enforce `AbortSignal.timeout(20_000)` on outbound requests.
 * 3. Always wrap errors with `redactSecretsFromError(err, apiKey)` so API keys
 *    can NEVER leak into logs or error toasts.
 */

import { LLMProviderType } from '../types';
import { resolveAndValidateEndpoint } from '../security/endpointValidator';
import { redactSecretsFromError } from '../security/secretScrubber';

export interface LLMRequestConfig {
  provider: LLMProviderType;
  modelId: string;
  apiKey?: string;
  customBaseUrl?: string;
}

export class UniversalLLMRouter {
  constructor(
    private readonly getConfig: () => Promise<LLMRequestConfig>,
    private readonly vscodeLmBridge?: (
      systemPrompt: string,
      userPrompt: string
    ) => Promise<string>
  ) {}

  /**
   * Formats the outbound HTTP request payload and headers for any provider.
   * Exposed as a pure helper so unit tests can verify exact payload shapes for
   * OpenAI, Anthropic, Google Gemini, and xAI Grok!
   */
  public static buildHttpRequest(
    config: LLMRequestConfig,
    systemPrompt: string,
    userPrompt: string
  ): {
    url: string;
    headers: Record<string, string>;
    body: string;
  } {
    const url = resolveAndValidateEndpoint(config.provider, config.customBaseUrl);

    if (config.provider === 'anthropic') {
      if (!config.apiKey) {
        throw new Error('Anthropic API key is missing. Run "CodeNibbl: Connect Model & Set API Key".');
      }
      return {
        url,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.modelId || 'claude-3-5-haiku-latest',
          max_tokens: 700,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      };
    }

    // OpenAI-Compatible Standard (OpenAI, Google Gemini, xAI Grok, Ollama, OpenRouter)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else if (config.provider !== 'custom') {
      throw new Error(
        `${config.provider.toUpperCase()} API key is missing. Run "CodeNibbl: Connect Model & Set API Key".`
      );
    }

    return {
      url,
      headers,
      body: JSON.stringify({
        model: config.modelId || 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    };
  }

  /**
   * Extracts the assistant text content from either an OpenAI-compatible or
   * Anthropic JSON response body.
   */
  public static extractResponseText(
    provider: LLMProviderType,
    responseJson: Record<string, unknown>
  ): string {
    if (provider === 'anthropic') {
      const content = responseJson.content as Array<{ type?: string; text?: string }> | undefined;
      const textBlock = content?.find((item) => item.type === 'text');
      if (!textBlock?.text) {
        throw new Error('Anthropic response did not contain a text block.');
      }
      return textBlock.text;
    }

    const choices = responseJson.choices as
      | Array<{ message?: { content?: string } }>
      | undefined;
    const messageContent = choices?.[0]?.message?.content;
    if (!messageContent) {
      throw new Error(`${provider} response did not contain choices[0].message.content.`);
    }
    return messageContent;
  }

  /**
   * Executes the LLM completion and returns the raw JSON string.
   */
  public async generateJson(params: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<string> {
    const config = await this.getConfig();

    try {
      if (config.provider === 'vscode-lm') {
        if (!this.vscodeLmBridge) {
          throw new Error('VS Code Language Model API bridge is not available.');
        }
        return await this.vscodeLmBridge(params.systemPrompt, params.userPrompt);
      }

      const req = UniversalLLMRouter.buildHttpRequest(
        config,
        params.systemPrompt,
        params.userPrompt
      );

      const response = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status} from ${config.provider}: ${errBody.slice(0, 200)}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      return UniversalLLMRouter.extractResponseText(config.provider, data);
    } catch (err) {
      throw new Error(redactSecretsFromError(err, config.apiKey));
    }
  }
}
