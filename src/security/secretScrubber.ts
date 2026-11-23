/**
 * ============================================================================
 * CodeNibbl Security Layer 1: Pre-LLM DLP & Secret Scrubber (`src/security/secretScrubber.ts`)
 * ============================================================================
 * 100% IMPLEMENTED — DO NOT WEAKEN OR BYPASS.
 *
 * Guarantees that:
 * 1. Sensitive files (.env, .pem, .key, credentials, secrets) are NEVER harvested.
 * 2. Hardcoded API keys, tokens, private keys, and connection strings inside source
 *    code are scrubbed BEFORE any prompt is constructed or sent to an LLM.
 * 3. API keys are redacted from all error messages and logs.
 */

import * as path from 'path';

const BLOCKED_FILE_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env(\..+)?$/i,
  /\.(pem|key|pfx|p12|cert|crt|der|jks|keystore)$/i,
  /(^|[\\/])(\.npmrc|\.pypirc|\.netrc|\.htpasswd|\.aws|\.ssh)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(secret|credential|passwd|shadow|token-store|service-account).*\.json$/i,
  /(^|[\\/])(node_modules|dist|out|build|coverage|\.git|\.vscode)([\\/]|$)/i,
  /(\.min\.(js|css)|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i,
];

/**
 * High-confidence secret patterns scrubbed from outbound code & commit messages.
 */
const SECRET_REGEX_RULES: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'PrivateKeyBlock',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
  {
    name: 'AnthropicKey',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{16,}\b/g,
  },
  {
    name: 'OpenAIKey',
    pattern: /\bsk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{20,}\b/g,
  },
  {
    name: 'xAIKey',
    pattern: /\bxai-[a-zA-Z0-9_-]{20,}\b/g,
  },
  {
    name: 'GoogleAIKey',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: 'GitHubToken',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[a-zA-Z0-9_]{20,}\b/g,
  },
  {
    name: 'AWSAccessKey',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: 'SlackToken',
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g,
  },
  {
    name: 'StripeKey',
    pattern: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b/g,
  },
  {
    name: 'JWTToken',
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    name: 'DatabaseUrlWithPassword',
    pattern: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:[^@\s/]+@[^\s"']+/gi,
  },
  {
    name: 'GenericSecretAssignment',
    pattern: /((?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|client[_-]?secret)\s*[:=]\s*['"`])([^'"`\s]{8,})(['"`])/gi,
  },
];

export const REDACTED_PLACEHOLDER = '[REDACTED_BY_CODENIBBL_SECURITY]';

/**
 * Checks if a file path is forbidden from being read or sent to an LLM.
 */
export function isSensitiveFilePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const base = path.basename(normalized);
  if (base.startsWith('.env')) {
    return true;
  }
  return BLOCKED_FILE_PATTERNS.some((regex) => regex.test(normalized));
}

/**
 * Scrubs any known secret patterns or credentials from code snippets or git commit text
 * BEFORE building an LLM prompt.
 */
export function scrubSecretsFromText(input: string): string {
  if (!input) {
    return '';
  }
  let sanitized = input;
  for (const rule of SECRET_REGEX_RULES) {
    if (rule.name === 'GenericSecretAssignment') {
      sanitized = sanitized.replace(rule.pattern, `$1${REDACTED_PLACEHOLDER}$3`);
    } else {
      sanitized = sanitized.replace(rule.pattern, REDACTED_PLACEHOLDER);
    }
  }
  return sanitized;
}

/**
 * Ensures API keys or tokens never leak into VS Code Output logs or UI notifications.
 */
export function redactSecretsFromError(err: unknown, knownKey?: string): string {
  const rawMessage = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  let safeMessage = scrubSecretsFromText(rawMessage);
  if (knownKey && knownKey.trim().length >= 6) {
    safeMessage = safeMessage.split(knownKey.trim()).join(REDACTED_PLACEHOLDER);
  }
  return safeMessage;
}
