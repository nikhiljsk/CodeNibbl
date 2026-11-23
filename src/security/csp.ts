/**
 * ============================================================================
 * CodeNibbl Security Layer 3: Webview CSP, XSS Escaper & Prompt Isolation (`src/security/csp.ts`)
 * ============================================================================
 * 100% IMPLEMENTED — DO NOT WEAKEN OR BYPASS.
 *
 * Guarantees that:
 * 1. Every Webview render uses a fresh 256-bit cryptographic nonce.
 * 2. Webview `connect-src` is locked to `'none'` (preventing Webview network exfiltration).
 * 3. All LLM-generated strings are HTML-escaped before DOM insertion.
 * 4. Untrusted repository code is wrapped in randomized boundary tags to defend
 *    against Indirect Prompt Injection.
 */

import * as crypto from 'crypto';

/**
 * Generates a 256-bit cryptographically random base64 nonce for Webview CSP.
 */
export function generateCspNonce(): string {
  return crypto.randomBytes(32).toString('base64');
}

/**
 * Builds the strict Content-Security-Policy meta tag content for the Webview.
 * Note: `connect-src 'none'` ensures the Webview cannot make outbound network calls.
 */
export function buildStrictCspHeader(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${cspSource}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/**
 * Escapes untrusted strings (e.g., LLM output or source code) for safe HTML rendering.
 */
export function escapeHtml(unsafe: string): string {
  if (!unsafe) {
    return '';
  }
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Wraps untrusted repository code or commit messages in randomized XML boundaries
 * so malicious comments inside code (`// IGNORE PREVIOUS INSTRUCTIONS...`) cannot
 * break out of the data block in the LLM prompt.
 */
export function wrapUntrustedCodeBlock(code: string): {
  boundaryTag: string;
  wrappedBlock: string;
} {
  const randomSuffix = crypto.randomBytes(8).toString('hex');
  const boundaryTag = `untrusted_repo_data_${randomSuffix}`;
  // Strip any accidental occurrence of the random boundary tag inside the code
  const safeCode = code.split(boundaryTag).join('redacted_tag');
  return {
    boundaryTag,
    wrappedBlock: `<${boundaryTag}>\n${safeCode}\n</${boundaryTag}>`,
  };
}
