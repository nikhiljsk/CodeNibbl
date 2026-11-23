/**
 * ============================================================================
 * CodeNibbl — Async Background Nibbl Generator (`src/engine/nibblGenerator.ts`)
 * ============================================================================
 * Maintains a pre-cooked local queue of spicy `NibblCard` items asynchronously
 * so opening the sidebar or clicking "🎲 Spin Random" renders in 0ms!
 *
 * Also includes built-in Demo/Starter cards so new users and open-source
 * contributors can experience the full UI before connecting an API key.
 */

import * as crypto from 'crypto';
import {
  CandidateSymbol,
  NibblArchetype,
  NibblCard,
  VibeMode,
} from '../types';
import { SeenLedger } from './seenLedger';
import { ARCHETYPE_METADATA, buildNibblPrompt } from './promptBuilder';
import { sanitizeMermaidDiagram } from './mermaidSanitizer';
import { UniversalLLMRouter } from '../llm/universalRouter';

export class NibblGenerator {
  private queue: NibblCard[] = [];
  private isCooking = false;
  private demoIndex = 0;

  constructor(
    private readonly seenLedger: SeenLedger,
    private readonly llmRouter: UniversalLLMRouter
  ) {}

  public getQueueDepth(): number {
    return this.queue.length;
  }

  public getIsCooking(): boolean {
    return this.isCooking;
  }

  /**
   * Pops the next pre-cooked card from the queue (or returns a starter demo card
   * if the workspace hasn't been harvested yet).
   */
  public popNextCard(): NibblCard {
    const next = this.queue.shift();
    if (next) {
      return next;
    }
    return this.createStarterDemoCard();
  }

  /**
   * Asynchronously cooks one Nibbl card from the highest-spice unseen symbol
   * and pushes it into the local queue.
   *
   * 🤖 AGENT TODO:
   * Wire `cookNextCardAsync` to a background interval / file-save debounce in
   * `extension.ts` so `queue.length` stays topped up to `codenibbl.preCookedQueueSize` (5).
   */
  public async cookNextCardAsync(
    candidates: CandidateSymbol[],
    vibeMode: VibeMode
  ): Promise<NibblCard | null> {
    if (this.isCooking) {
      return null;
    }

    const pick = this.seenLedger.pickNextFreshTarget(candidates);
    if (!pick) {
      return null;
    }

    this.isCooking = true;
    try {
      const { systemPrompt, userPrompt } = buildNibblPrompt({
        symbol: pick.symbol,
        archetype: pick.archetype,
        vibeMode,
        hookStyle: pick.hookStyle,
        doNotRepeatBlock: this.seenLedger.buildDoNotRepeatPromptBlock(),
      });

      const rawJson = await this.llmRouter.generateJson({
        systemPrompt,
        userPrompt,
      });

      const card = this.parseAndSanitizeCard(rawJson, pick.symbol, pick.archetype);
      this.seenLedger.recordGeneratedNibbl({
        symbol: pick.symbol,
        archetype: pick.archetype,
        headline: card.headline,
        whyItMatters: card.whyItMatters,
      });

      this.queue.push(card);
      return card;
    } finally {
      this.isCooking = false;
    }
  }

  /**
   * Parses raw LLM JSON output and enforces strict bounds + Mermaid sanitization.
   */
  public parseAndSanitizeCard(
    rawJsonText: string,
    symbol: CandidateSymbol,
    archetype: NibblArchetype
  ): NibblCard {
    const cleanedJson = rawJsonText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleanedJson) as Record<string, unknown>;
    const meta = ARCHETYPE_METADATA[archetype];

    const headline =
      typeof parsed.headline === 'string' && parsed.headline.trim()
        ? parsed.headline.trim().slice(0, 140)
        : `Wait—look at what ${symbol.symbolName}() is doing here 👀`;

    const laymanBody =
      typeof parsed.laymanBody === 'string' && parsed.laymanBody.trim()
        ? parsed.laymanBody.trim().slice(0, 420)
        : `This snippet in ${symbol.filePath} handles key logic around ${symbol.symbolName}.`;

    const whyItMatters =
      typeof parsed.whyItMatters === 'string' && parsed.whyItMatters.trim()
        ? parsed.whyItMatters.trim().slice(0, 180)
        : '💡 Keeps your codebase resilient when unexpected inputs arrive.';

    const safeMermaid =
      typeof parsed.mermaidDiagram === 'string'
        ? sanitizeMermaidDiagram(parsed.mermaidDiagram)
        : undefined;

    let interactiveQuiz: NibblCard['interactiveQuiz'];
    if (parsed.interactiveQuiz && typeof parsed.interactiveQuiz === 'object') {
      const q = parsed.interactiveQuiz as Record<string, unknown>;
      if (
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        typeof q.correctIndex === 'number' &&
        typeof q.ahaExplanation === 'string'
      ) {
        const cleanOptions = q.options
          .filter((o): o is string => typeof o === 'string')
          .slice(0, 4)
          .map((o) => o.slice(0, 120));
        if (cleanOptions.length >= 2) {
          interactiveQuiz = {
            question: q.question.slice(0, 180),
            options: cleanOptions,
            correctIndex: Math.min(Math.max(0, Math.floor(q.correctIndex)), cleanOptions.length - 1),
            ahaExplanation: q.ahaExplanation.slice(0, 220),
          };
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      archetype,
      mascotMood: meta.mascotMood,
      scovilleScore: symbol.scovilleScore,
      scovilleTier: symbol.scovilleTier,
      badgeText: meta.badgeText,
      headline,
      laymanBody,
      whyItMatters,
      codeSnippet: {
        filePath: symbol.filePath,
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        language: symbol.language,
        code: symbol.code.split(/\r?\n/).slice(0, 14).join('\n'),
        highlightLines: symbol.spicyLineNumbers,
      },
      mermaidDiagram: safeMermaid,
      interactiveQuiz,
      codeLinks: [
        {
          label: `${symbol.symbolName}() • ${symbol.filePath}:${symbol.startLine}`,
          filePath: symbol.filePath,
          line: symbol.startLine,
          endLine: symbol.endLine,
        },
      ],
      createdAt: Date.now(),
    };
  }

  /**
   * Built-in rotating deck of spicy starter cards so the UI feels alive right
   * away—even offline or before connecting an API key!
   */
  public createStarterDemoCard(): NibblCard {
    const deck: NibblCard[] = [
      {
        id: 'demo-starter-card-1',
        archetype: 'GLAZE_THE_DEV',
        mascotMood: 'chef_kiss',
        scovilleScore: 95,
        scovilleTier: '💀 Ghost Pepper',
        badgeText: '👑 CERTIFIED GENIUS',
        headline:
          'Ah, turns out you are brilliant—our Pre-LLM Secret Scrubber catches leaked keys before they ever leave VS Code 🧠✨',
        laymanBody:
          'Think of `scrubSecretsFromText()` as an over-caffeinated TSA agent at your codebase airport. Before any snippet flies out to OpenAI, Claude, Gemini, or Grok, it confiscates `.env` files and swaps tokens with `[REDACTED]` in under 1ms.',
        whyItMatters:
          '💡 Why This Slaps: Zero accidental credential leaks, even if someone hardcoded a test token at 2 AM.',
        codeSnippet: {
          filePath: 'src/security/secretScrubber.ts',
          startLine: 86,
          endLine: 98,
          language: 'typescript',
          code: [
            'export function scrubSecretsFromText(input: string): string {',
            '  if (!input) return "";',
            '  let sanitized = input;',
            '  for (const rule of SECRET_REGEX_RULES) {',
            '    sanitized = sanitized.replace(rule.pattern, REDACTED_PLACEHOLDER);',
            '  }',
            '  return sanitized;',
            '}',
          ].join('\n'),
          highlightLines: [90, 91],
        },
        mermaidDiagram: [
          'flowchart TD',
          '  A["Raw Repo Code"] --> B["12-Signal Scoville Scanner"]',
          '  B --> C["Secret Scrubber DLP 🛡️"]',
          '  C --> D["Universal LLM Router"]',
        ].join('\n'),
        interactiveQuiz: {
          question: 'Pop quiz: Where does CodeNibbl store your LLM API keys?',
          options: [
            'In your OS Keychain via vscode.SecretStorage 🔐',
            'In plain-text settings.json',
            'Written on a sticky note',
          ],
          correctIndex: 0,
          ahaExplanation:
            'Boom! 100% OS Keychain encrypted via vscode.SecretStorage—never in plaintext files.',
        },
        codeLinks: [
          {
            label: 'scrubSecretsFromText() • src/security/secretScrubber.ts:86',
            filePath: 'src/security/secretScrubber.ts',
            line: 86,
            endLine: 98,
          },
          {
            label: 'resolveSafeWorkspaceFilePath() • src/security/pathValidator.ts:36',
            filePath: 'src/security/pathValidator.ts',
            line: 36,
            endLine: 68,
          },
        ],
        createdAt: Date.now(),
      },
      {
        id: 'demo-starter-card-2',
        archetype: 'DID_YOU_KNOW',
        mascotMood: 'mind_blown',
        scovilleScore: 85,
        scovilleTier: '💀 Ghost Pepper',
        badgeText: '🤯 CODEBASE LORE',
        headline:
          'Did you know CodeNibbl hashes your code structure so formatting tweaks never trigger duplicate cards? 🤯',
        laymanBody:
          'Instead of tracking line numbers that break the second you hit Enter, `computeNormalizedCodeHash()` collapses extra whitespace and fingerprints the actual logic using SHA-256.',
        whyItMatters:
          '💡 Why This Slaps: Auto-format your whole repo with Prettier—CodeNibbl still remembers what you already learned.',
        codeSnippet: {
          filePath: 'src/harvester/spiceHarvester.ts',
          startLine: 85,
          endLine: 90,
          language: 'typescript',
          code: [
            'export function computeNormalizedCodeHash(code: string): string {',
            '  const normalized = code.replace(/\\s+/g, " ").trim();',
            '  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);',
            '}',
          ].join('\n'),
          highlightLines: [86, 87],
        },
        interactiveQuiz: {
          question: 'What happens if you add 5 blank lines above a function you already nibbled?',
          options: [
            'Nothing! The normalized SHA-256 hash stays identical 🧠',
            'CodeNibbl forgets it and repeats the same card',
            'The universe explodes',
          ],
          correctIndex: 0,
          ahaExplanation:
            'Nailed it! Whitespace normalization keeps the fingerprint rock-solid across refactors.',
        },
        codeLinks: [
          {
            label: 'computeNormalizedCodeHash() • src/harvester/spiceHarvester.ts:85',
            filePath: 'src/harvester/spiceHarvester.ts',
            line: 85,
            endLine: 90,
          },
        ],
        createdAt: Date.now(),
      },
      {
        id: 'demo-starter-card-3',
        archetype: 'PLOT_TWIST_QUIZ',
        mascotMood: 'detective',
        scovilleScore: 115,
        scovilleTier: '☢️ Carolina Reaper',
        badgeText: '🕵️ WAIT... WHAT IF?',
        headline:
          'Plot twist: What if a sneaky repo tries to slip `../../../etc/passwd` into a Code Link? 🛑',
        laymanBody:
          'Every single "Jump to Code" click passes through `resolveSafeWorkspaceFilePath()`, a digital bouncer that checks the resolved path against your workspace root and kicks out directory traversal on sight.',
        whyItMatters:
          '💡 Why This Slaps: Even a hallucinating LLM can never trick VS Code into opening files outside your workspace.',
        codeSnippet: {
          filePath: 'src/security/pathValidator.ts',
          startLine: 52,
          endLine: 64,
          language: 'typescript',
          code: [
            'const resolvedRoot = path.resolve(workspaceRoot);',
            'const resolvedTarget = path.resolve(resolvedRoot, trimmed);',
            'const relative = path.relative(resolvedRoot, resolvedTarget);',
            'if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {',
            '  return null;',
            '}',
          ].join('\n'),
          highlightLines: [55, 56],
        },
        interactiveQuiz: {
          question: 'Which path gets instantly blocked by resolveSafeWorkspaceFilePath()?',
          options: [
            'src/webview/webviewHtml.ts',
            '../../Windows/System32/drivers/etc/hosts 🚨',
            'test/security.test.ts',
          ],
          correctIndex: 1,
          ahaExplanation:
            '100%! Anything resolving with leading ".." outside your workspace root returns null immediately.',
        },
        codeLinks: [
          {
            label: 'resolveSafeWorkspaceFilePath() • src/security/pathValidator.ts:36',
            filePath: 'src/security/pathValidator.ts',
            line: 36,
            endLine: 66,
          },
        ],
        createdAt: Date.now(),
      },
    ];

    const card = deck[this.demoIndex % deck.length];
    this.demoIndex += 1;
    return card;
  }
}
