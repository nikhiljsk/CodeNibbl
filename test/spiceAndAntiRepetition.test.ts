import { describe, expect, it, vi } from 'vitest';
import {
  chunkFileByRegex,
  computeCognitiveComplexity,
  createSafeCandidateSymbol,
  detectLanguageFromPath,
  harvestWorkspaceSymbols,
  isMundaneBoilerplate,
  linkSymbolCallGraph,
} from '../src/harvester/spiceHarvester';
import { SeenLedger } from '../src/engine/seenLedger';
import { NibblGenerator } from '../src/engine/nibblGenerator';
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

  it('filters out mundane env-var readers, config getters, and flat plumbing', () => {
    const envReader = `
      export function getPort() {
        return process.env.PORT ?? '3000';
      }
    `;
    const simpleGetter = `
      getUserName() {
        return this.userName;
      }
    `;
    const realBusinessLogic = `
      export async function processRefund(orderId: string, amount: number) {
        if (!orderId || amount <= 0) {
          throw new Error('Invalid refund');
        }
        if (this.inFlight.has(orderId)) {
          return { status: 'duplicate' };
        }
        this.inFlight.add(orderId);
        const result = await gateway.refund(orderId, amount);
        return result;
      }
    `;

    expect(isMundaneBoilerplate('getPort', envReader)).toBe(true);
    expect(isMundaneBoilerplate('getUserName', simpleGetter)).toBe(true);
    expect(isMundaneBoilerplate('processRefund', realBusinessLogic)).toBe(false);
    expect(computeCognitiveComplexity(realBusinessLogic)).toBeGreaterThanOrEqual(40);
  });

  it('links cross-function callsTo and calledBy relationships', () => {
    const helper = createSafeCandidateSymbol({
      filePath: 'src/auth/verify.ts',
      symbolName: 'verifySignature',
      startLine: 1,
      endLine: 10,
      language: 'typescript',
      rawCode: 'if (!sig && !secret) { return false; } return true;',
    })!;

    const caller1 = createSafeCandidateSymbol({
      filePath: 'src/api/webhook.ts',
      symbolName: 'handleWebhook',
      startLine: 1,
      endLine: 12,
      language: 'typescript',
      rawCode: 'if (!verifySignature(req)) { return 401; }',
    })!;

    const caller2 = createSafeCandidateSymbol({
      filePath: 'src/api/admin.ts',
      symbolName: 'handleAdminHook',
      startLine: 1,
      endLine: 12,
      language: 'typescript',
      rawCode: 'if (!verifySignature(req)) { return 403; }',
    })!;

    linkSymbolCallGraph([helper, caller1, caller2]);
    expect(caller1.callsTo).toContain('verifySignature');
    expect(helper.calledBy).toEqual(['handleWebhook', 'handleAdminHook']);
    expect(helper.spiceSignals).toContain('MAIN_CHARACTER_HUB');
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

  it('selects a diverse Tournament of 5 batch across distinct files and records only the winner', async () => {
    const candidates = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'].map((file, idx) =>
      createSafeCandidateSymbol({
        filePath: `src/${file}`,
        symbolName: `processItem${idx}`,
        startLine: 10,
        endLine: 25,
        language: 'typescript',
        rawCode: `if (x > ${idx} && y < 10) { return x + y; } return 0;`,
      })!
    );

    const ledger = new SeenLedger();
    const tournament = ledger.pickTournamentBatch(candidates, 5);
    expect(tournament).not.toBeNull();
    expect(tournament!.batch).toHaveLength(5);

    const mockRouter = {
      generateJson: vi.fn(async () =>
        JSON.stringify({
          winningCandidateIndex: 2,
          selectedArchetype: 'MISSED_EDGE_CASE',
          headline: 'Watch out: processItem2() silently drops negative inputs 🚨',
          laymanBody: 'If `x` is negative, line 10 skips validation and returns 0.',
          whyItMatters: '💡 Negative quantities can look like zero-cost orders.',
          suggestedFix: 'if (x < 0) throw new Error("Negative input");',
        })
      ),
    } as unknown as UniversalLLMRouter;

    const generator = new NibblGenerator(ledger, mockRouter);
    const card = await generator.cookNextCardAsync(candidates, 'genz_hype');

    expect(card).not.toBeNull();
    expect(card!.archetype).toBe('MISSED_EDGE_CASE');
    expect(card!.badgeText).toBe('🚨 BLIND SPOT SPOTTED');
    expect(card!.codeSnippet?.filePath).toBe('src/c.ts');
    expect(card!.suggestedFix).toContain('Negative input');
    expect(ledger.hasSeenCombo(candidates[2], 'MISSED_EDGE_CASE')).toBe(true);
    expect(ledger.hasSeenCombo(candidates[0], 'MISSED_EDGE_CASE')).toBe(false);
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
