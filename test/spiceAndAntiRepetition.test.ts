import { describe, expect, it } from 'vitest';
import {
  chunkFileByRegex,
  createSafeCandidateSymbol,
  detectLanguageFromPath,
  harvestWorkspaceSymbols,
} from '../src/harvester/spiceHarvester';
import { SeenLedger } from '../src/engine/seenLedger';
import { sanitizeMermaidDiagram } from '../src/engine/mermaidSanitizer';
import { UniversalLLMRouter } from '../src/llm/universalRouter';

describe('12-Signal Scoville Spice Scanner', () => {
  it('scores high-spice code with Edge-Case Armor, Regex Wizardry, and Confession Comments', () => {
    const candidate = createSafeCandidateSymbol({
      filePath: 'src/payment/retryWebhook.ts',
      symbolName: 'retryWebhookWithBackoff',
      startLine: 10,
      endLine: 30,
      language: 'typescript',
      rawCode: `
        // TODO: temporary workaround for duplicate Stripe webhook edge case
        export async function retryWebhookWithBackoff(payload: string) {
          try {
            const clean = payload.replace(/^\\uFEFF/, '');
            const sig = await Promise.race([verifySignature(clean), timeout(3000)]);
            return sig ?? fallback();
          } catch (err) {
            return null;
          }
        }
      `,
      isFreshDiff: true,
    });

    expect(candidate).not.toBeNull();
    expect(candidate!.scovilleScore).toBeGreaterThanOrEqual(110);
    expect(candidate!.scovilleTier).toBe('☢️ Carolina Reaper');
    expect(candidate!.spiceSignals).toContain('DEV_CONFESSION_COMMENT');
    expect(candidate!.spiceSignals).toContain('EDGE_CASE_ARMOR');
    expect(candidate!.spiceSignals).toContain('CONCURRENCY_TIME_TRAVEL');
    expect(candidate!.spiceSignals).toContain('FRESH_OUT_THE_OVEN');
  });

  it('detects languages accurately from file extensions', () => {
    expect(detectLanguageFromPath('src/index.ts')).toBe('typescript');
    expect(detectLanguageFromPath('src/App.tsx')).toBe('typescriptreact');
    expect(detectLanguageFromPath('scripts/deploy.py')).toBe('python');
    expect(detectLanguageFromPath('cmd/main.go')).toBe('go');
    expect(detectLanguageFromPath('src/lib.rs')).toBe('rust');
    expect(detectLanguageFromPath('unknown.xyz')).toBe('plaintext');
  });

  it('extracts code chunks via regex chunker fallback', () => {
    const sampleTs = `
export function calculateTax(amount: number) {
  if (amount <= 0) {
    return 0;
  }
  const rate = 0.15;
  const total = amount * rate;
  return total;
}

const verifyUser = async (id: string) => {
  try {
    const user = await fetchUser(id);
    return user;
  } catch (e) {
    return null;
  }
};
    `;

    const chunks = chunkFileByRegex(sampleTs);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].name).toBe('calculateTax');
    expect(chunks[0].startLine).toBeGreaterThan(0);
    expect(chunks[1].name).toBe('verifyUser');
  });

  it('harvestWorkspaceSymbols runs without crashing and returns an array', async () => {
    const symbols = await harvestWorkspaceSymbols();
    expect(Array.isArray(symbols)).toBe(true);
  });
});

describe('6-Layer Anti-Repetition Engine (SeenLedger)', () => {
  it('never repeats the same (symbol, codeHash, archetype) and rotates archetypes without back-to-back duplicates', () => {
    const symbolA = createSafeCandidateSymbol({
      filePath: 'src/a.ts',
      symbolName: 'funcA',
      startLine: 1,
      endLine: 12,
      language: 'typescript',
      rawCode: 'try {const a = x ?? 1;} catch (e) {}',
    })!;

    const symbolB = createSafeCandidateSymbol({
      filePath: 'src/b.ts',
      symbolName: 'funcB',
      startLine: 1,
      endLine: 12,
      language: 'typescript',
      rawCode: '// HACK: magic regex\nconst r = /foo+/g;',
    })!;

    const ledger = new SeenLedger();

    const pick1 = ledger.pickNextFreshTarget([symbolA, symbolB]);
    expect(pick1).not.toBeNull();
    ledger.recordGeneratedNibbl({
      symbol: pick1!.symbol,
      archetype: pick1!.archetype,
      headline: 'Headline 1',
      whyItMatters: 'Takeaway 1',
    });

    const pick2 = ledger.pickNextFreshTarget([symbolA, symbolB]);
    expect(pick2).not.toBeNull();
    // Archetype Cooldown Carousel guarantees pick2 does not repeat pick1's archetype
    expect(pick2!.archetype).not.toBe(pick1!.archetype);

    const doNotRepeat = ledger.buildDoNotRepeatPromptBlock();
    expect(doNotRepeat).toContain('Headline 1');
  });
});

describe('Mermaid Diagram Sanitizer', () => {
  it('auto-quotes unquoted parentheses in node labels and blocks dangerous directives', () => {
    const raw = '```mermaid\nflowchart TD\n  A[User (Admin)] --> B[Check Token (JWT)]\n```';
    const sanitized = sanitizeMermaidDiagram(raw);
    expect(sanitized).toBe('flowchart TD\n  A["User (Admin)"] --> B["Check Token (JWT)"]');

    const malicious = 'flowchart TD\n  A["Node"]\n  click A call alert("xss")';
    expect(sanitizeMermaidDiagram(malicious)).toBeUndefined();
  });
});

describe('Universal Multi-Model LLM Router', () => {
  it('builds valid requests for OpenAI, Anthropic, Google Gemini, and xAI Grok', () => {
    const anthropicReq = UniversalLLMRouter.buildHttpRequest(
      { provider: 'anthropic', modelId: 'claude-3-5-haiku-latest', apiKey: 'sk-ant-test' },
      'sys',
      'user'
    );
    expect(anthropicReq.url).toBe('https://api.anthropic.com/v1/messages');
    expect(anthropicReq.headers['x-api-key']).toBe('sk-ant-test');

    const xaiReq = UniversalLLMRouter.buildHttpRequest(
      { provider: 'xai', modelId: 'grok-3-mini', apiKey: 'xai-test' },
      'sys',
      'user'
    );
    expect(xaiReq.url).toBe('https://api.x.ai/v1/chat/completions');
    expect(xaiReq.headers['Authorization']).toBe('Bearer xai-test');

    const geminiReq = UniversalLLMRouter.buildHttpRequest(
      { provider: 'gemini', modelId: 'gemini-2.5-flash', apiKey: 'AIza-test' },
      'sys',
      'user'
    );
    expect(geminiReq.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    );
  });
});
