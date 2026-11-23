/**
 * ============================================================================
 * CodeNibbl Security Layer 4: LLM Endpoint & SSRF Guard (`src/security/endpointValidator.ts`)
 * ============================================================================
 * 100% IMPLEMENTED — DO NOT WEAKEN OR BYPASS.
 *
 * Guarantees that:
 * 1. Official cloud providers strictly use their canonical HTTPS endpoints.
 * 2. Custom endpoints must use `https://` for remote servers, or `http://127.0.0.1` /
 *    `http://localhost` for local LLM servers (Ollama, LM Studio, vLLM).
 * 3. Cloud instance metadata IPs (169.254.169.254) and non-HTTP(S) schemes are blocked.
 */

import { LLMProviderType } from '../types';

export const OFFICIAL_PROVIDER_ENDPOINTS: Record<
  Exclude<LLMProviderType, 'vscode-lm' | 'custom'>,
  string
> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
};

const BLOCKED_HOSTS: Set<string> = new Set([
  '169.254.169.254', // AWS/GCP/Azure IMDS
  'metadata.google.internal',
  '100.100.100.200', // Alibaba Cloud IMDS
  '0.0.0.0',
]);

/**
 * Validates and returns the safe endpoint URL for an LLM request.
 * Throws a descriptive error if the URL violates security constraints.
 */
export function resolveAndValidateEndpoint(
  provider: LLMProviderType,
  customBaseUrl?: string
): string {
  if (provider === 'vscode-lm') {
    return 'vscode-lm://native';
  }

  if (provider !== 'custom') {
    return OFFICIAL_PROVIDER_ENDPOINTS[provider];
  }

  if (!customBaseUrl || !customBaseUrl.trim()) {
    throw new Error('Custom provider requires a valid codenibbl.customBaseUrl setting.');
  }

  let parsed: URL;
  try {
    parsed = new URL(customBaseUrl.trim());
  } catch {
    throw new Error('Invalid customBaseUrl format.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(hostname) || hostname.startsWith('169.254.')) {
    throw new Error(`Blocked unsafe endpoint host: ${hostname}`);
  }

  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (parsed.protocol === 'http:' && !isLocalhost) {
    throw new Error(
      'Insecure HTTP is only allowed for localhost (127.0.0.1 / localhost). Remote endpoints must use HTTPS.'
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  // Normalize to `/chat/completions` if the user only provided base URL like `http://127.0.0.1:11434/v1`
  const pathname = parsed.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) {
    parsed.pathname = `${pathname}/chat/completions`;
  }

  return parsed.toString();
}
