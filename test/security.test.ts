import { describe, expect, it } from 'vitest';
import {
  isSensitiveFilePath,
  REDACTED_PLACEHOLDER,
  redactSecretsFromError,
  scrubSecretsFromText,
} from '../src/security/secretScrubber';
import {
  isSafeSponsorUrl,
  resolveSafeWorkspaceFilePath,
  validateWebviewMessage,
} from '../src/security/pathValidator';
import {
  buildStrictCspHeader,
  escapeHtml,
  generateCspNonce,
  wrapUntrustedCodeBlock,
} from '../src/security/csp';
import { resolveAndValidateEndpoint } from '../src/security/endpointValidator';

describe('Security Layer 1: Pre-LLM DLP & Secret Scrubber', () => {
  it('blocks sensitive files (.env, .pem, .key, id_rsa, credentials)', () => {
    expect(isSensitiveFilePath('.env')).toBe(true);
    expect(isSensitiveFilePath('config/.env.production')).toBe(true);
    expect(isSensitiveFilePath('certs/server.pem')).toBe(true);
    expect(isSensitiveFilePath('/home/user/.ssh/id_rsa')).toBe(true);
    expect(isSensitiveFilePath('gcp-service-account-credentials.json')).toBe(true);
    expect(isSensitiveFilePath('src/auth/tokenValidator.ts')).toBe(false);
  });

  it('scrubs OpenAI, Anthropic, Google, xAI, GitHub, and DB secrets from code', () => {
    const leakySnippet = `
      const openai = "sk-proj-1234567890abcdefghijklmnop";
      const claude = "sk-ant-api03-1234567890abcdefghijk";
      const grok = "xai-1234567890abcdefghijklmnop";
      const db = "postgres://admin:superSecretPass123@db.internal:5432/prod";
      const password = "myUltraSecretPassword99";
    `;
    const scrubbed = scrubSecretsFromText(leakySnippet);

    expect(scrubbed).not.toContain('sk-proj-1234567890');
    expect(scrubbed).not.toContain('sk-ant-api03');
    expect(scrubbed).not.toContain('xai-1234567890');
    expect(scrubbed).not.toContain('superSecretPass123');
    expect(scrubbed).not.toContain('myUltraSecretPassword99');
    expect(scrubbed).toContain(REDACTED_PLACEHOLDER);
  });

  it('redacts raw API keys from thrown error messages', () => {
    const err = new Error('Request failed with header Bearer my-custom-secret-key-9999');
    const safeMsg = redactSecretsFromError(err, 'my-custom-secret-key-9999');
    expect(safeMsg).not.toContain('my-custom-secret-key-9999');
    expect(safeMsg).toContain(REDACTED_PLACEHOLDER);
  });
});

describe('Security Layer 2: Path Traversal & Webview Message Guard', () => {
  const workspaceRoot =
    process.platform === 'win32' ? 'C:\\repo\\CodeNibbl' : '/Users/dev/CodeNibbl';

  it('allows valid workspace-relative file paths', () => {
    const resolved = resolveSafeWorkspaceFilePath(workspaceRoot, 'src/extension.ts');
    expect(resolved).toBeTruthy();
  });

  it('blocks directory traversal (../), absolute paths, and null bytes', () => {
    expect(resolveSafeWorkspaceFilePath(workspaceRoot, '../../../etc/passwd')).toBeNull();
    expect(resolveSafeWorkspaceFilePath(workspaceRoot, 'src/../../secret.txt')).toBeNull();
    expect(resolveSafeWorkspaceFilePath(workspaceRoot, 'src/file.ts\0.js')).toBeNull();
    expect(resolveSafeWorkspaceFilePath(workspaceRoot, '/etc/shadow')).toBeNull();
    expect(resolveSafeWorkspaceFilePath(workspaceRoot, '\\\\evil-server\\share\\pwn')).toBeNull();
  });

  it('strictly validates incoming Webview postMessage payloads', () => {
    expect(
      validateWebviewMessage({
        type: 'JUMP_TO_CODE',
        filePath: 'src/index.ts',
        line: 42,
      })
    ).toEqual({
      type: 'JUMP_TO_CODE',
      filePath: 'src/index.ts',
      line: 42,
      endLine: undefined,
    });

    expect(
      validateWebviewMessage({
        type: 'SWITCH_VIBE',
        vibeMode: 'malicious_mode',
      })
    ).toBeNull();

    expect(validateWebviewMessage({ type: 'UNKNOWN_COMMAND' })).toBeNull();
  });

  it('restricts Sponsor URLs to trusted HTTPS domains', () => {
    expect(isSafeSponsorUrl('https://buymeacoffee.com/codenibbl')).toBe(true);
    expect(isSafeSponsorUrl('https://github.com/sponsors/codenibbl')).toBe(true);
    expect(isSafeSponsorUrl('http://buymeacoffee.com/codenibbl')).toBe(false);
    expect(isSafeSponsorUrl('https://evil-phishing.com/coffee')).toBe(false);
    expect(isSafeSponsorUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('Security Layer 3: CSP, XSS Escaping & Indirect Prompt Injection Defense', () => {
  it('generates 256-bit nonces and locks Webview connect-src to none', () => {
    const nonce = generateCspNonce();
    expect(nonce.length).toBeGreaterThanOrEqual(40);
    const csp = buildStrictCspHeader('vscode-webview://test', nonce);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it('escapes HTML entities to prevent XSS', () => {
    const dirty = `<img src=x onerror="alert('xss')">`;
    expect(escapeHtml(dirty)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#039;xss&#039;)&quot;&gt;'
    );
  });

  it('wraps untrusted code in randomized XML boundary tags', () => {
    const { boundaryTag, wrappedBlock } = wrapUntrustedCodeBlock('const x = 1;');
    expect(boundaryTag).toMatch(/^untrusted_repo_data_[0-9a-f]{16}$/);
    expect(wrappedBlock).toContain(`<${boundaryTag}>`);
    expect(wrappedBlock).toContain(`</${boundaryTag}>`);
  });
});

describe('Security Layer 4: LLM Endpoint & SSRF Guard', () => {
  it('resolves official HTTPS endpoints for OpenAI, Anthropic, Gemini, and xAI', () => {
    expect(resolveAndValidateEndpoint('openai')).toBe(
      'https://api.openai.com/v1/chat/completions'
    );
    expect(resolveAndValidateEndpoint('anthropic')).toBe(
      'https://api.anthropic.com/v1/messages'
    );
    expect(resolveAndValidateEndpoint('gemini')).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
    expect(resolveAndValidateEndpoint('xai')).toBe(
      'https://api.x.ai/v1/chat/completions'
    );
  });

  it('blocks cloud metadata SSRF targets and non-localhost HTTP', () => {
    expect(() =>
      resolveAndValidateEndpoint('custom', 'http://169.254.169.254/latest/meta-data')
    ).toThrow(/Blocked unsafe endpoint/);

    expect(() =>
      resolveAndValidateEndpoint('custom', 'http://remote-llm.example.com/v1')
    ).toThrow(/Insecure HTTP is only allowed for localhost/);

    expect(
      resolveAndValidateEndpoint('custom', 'http://127.0.0.1:11434/v1')
    ).toBe('http://127.0.0.1:11434/v1/chat/completions');
  });
});
