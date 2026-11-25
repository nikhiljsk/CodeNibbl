/**
 * ============================================================================
 * CodeNibbl — 6-Layer Anti-Repetition Engine (`src/engine/seenLedger.ts`)
 * ============================================================================
 * Guarantees that CodeNibbl NEVER generates the same snippet insight twice over
 * time, rotates card archetypes smoothly, and feeds a rolling `<do_not_repeat>`
 * memory window into every LLM prompt.
 */

import {
  CandidateSymbol,
  NibblArchetype,
  SeenLedgerState,
} from '../types';

export const ALL_ARCHETYPES: NibblArchetype[] = [
  'MISSED_EDGE_CASE',
  'GLAZE_THE_DEV',
  'DID_YOU_KNOW',
  'CAUGHT_IN_4K',
  'PLOT_TWIST_QUIZ',
  'EXPLAIN_LIKE_IM_5',
  'BLACK_MAGIC_DECODED',
  'MAIN_CHARACTER',
  'DOMINO_EFFECT',
  'GIT_TIME_CAPSULE',
  'AI_VIBE_AUDIT',
];

export const OPENING_HOOK_STYLES: string[] = [
  'STYLE 1 (Shameless Glaze): Start by hyping the developer ("Ah, turns out you are brilliant...", "Wait—you actually thought of this?!")',
  'STYLE 2 (Suspenseful Plot Twist): Start like a thriller ("Everything looks completely innocent on line X until...")',
  'STYLE 3 (Wild Real-World Analogy): Compare the code to a nightclub bouncer, heist crew, pizza kitchen, or air-traffic controller.',
  'STYLE 4 (Mind-Blown Trivia): Start with a surprising "Did you know?" or hidden superpower lurking in this function.',
  'STYLE 5 (Caught in 4K): Playfully spotlight a sneaky workaround, magic constant, or developer comment with loving banter.',
  'STYLE 6 (High-Stakes Hero): Frame a specific guard clause as the unsung hero saving production from chaos.',
  'STYLE 7 (Wait, What Happens If...): Open with a brain-tickling edge-case scenario before revealing how the code handles it.',
  'STYLE 8 (Zero-Jargon Speedrun): Explain what looks intimidating in the most ridiculously simple, punchy 1-liner possible.',
];

const MAX_RECENT_HEADLINES = 20;
const ARCHETYPE_COOLDOWN_WINDOW = 3;
const MAX_LENSES_PER_SYMBOL = 1;

export class SeenLedger {
  private state: SeenLedgerState;

  constructor(initialState?: Partial<SeenLedgerState>) {
    this.state = {
      version: 1,
      seenComboKeys: initialState?.seenComboKeys ?? [],
      symbolArchetypeHistory: initialState?.symbolArchetypeHistory ?? {},
      recentHeadlines: initialState?.recentHeadlines ?? [],
      recentArchetypes: initialState?.recentArchetypes ?? [],
      hookCadenceIndex: initialState?.hookCadenceIndex ?? 0,
      stats: initialState?.stats ?? { nibblsMunched: 0, quizzesSolved: 0 },
    };
  }

  public getState(): SeenLedgerState {
    return this.state;
  }

  public reset(): void {
    this.state = {
      version: 1,
      seenComboKeys: [],
      symbolArchetypeHistory: {},
      recentHeadlines: [],
      recentArchetypes: [],
      hookCadenceIndex: 0,
      stats: this.state.stats,
    };
  }

  public static buildComboKey(
    symbol: Pick<CandidateSymbol, 'filePath' | 'symbolName' | 'codeHash'>,
    archetype: NibblArchetype
  ): string {
    return `${symbol.filePath}::${symbol.symbolName}::${symbol.codeHash}::${archetype}`;
  }

  public static buildSymbolKey(
    symbol: Pick<CandidateSymbol, 'filePath' | 'symbolName'>
  ): string {
    return `${symbol.filePath}::${symbol.symbolName}`;
  }

  /**
   * Checks whether this exact (symbol, codeHash, archetype) has already been generated.
   */
  public hasSeenCombo(
    symbol: Pick<CandidateSymbol, 'filePath' | 'symbolName' | 'codeHash'>,
    archetype: NibblArchetype
  ): boolean {
    const key = SeenLedger.buildComboKey(symbol, archetype);
    return this.state.seenComboKeys.includes(key);
  }

  /**
   * Checks whether ANY Nibbl has already been generated for this function/symbol.
   * Once a function produces a Nibbl, it is remembered and skipped completely
   * until the user resets their seen history.
   */
  public hasSeenSymbol(
    symbol: Pick<CandidateSymbol, 'filePath' | 'symbolName'>
  ): boolean {
    const symbolKey = SeenLedger.buildSymbolKey(symbol);
    const history = this.state.symbolArchetypeHistory[symbolKey];
    if (history && history.length >= MAX_LENSES_PER_SYMBOL) {
      return true;
    }
    const prefix = `${symbolKey}::`;
    return this.state.seenComboKeys.some((k) => k.startsWith(prefix));
  }

  /**
   * Selects the best next (CandidateSymbol, NibblArchetype) pair for an unseen function:
   * 1. Skips any function where `hasSeenSymbol(symbol)` is true (1 function = 1 Nibbl!)
   * 2. Does NOT repeat any of the last `ARCHETYPE_COOLDOWN_WINDOW` archetypes
   * 3. Matches the symbol's detected `SpiceSignals`
   */
  public pickNextFreshTarget(
    candidates: CandidateSymbol[]
  ): { symbol: CandidateSymbol; archetype: NibblArchetype; hookStyle: string } | null {
    if (candidates.length === 0) {
      return null;
    }

    const cooldownSet = new Set(this.state.recentArchetypes.slice(-ARCHETYPE_COOLDOWN_WINDOW));

    for (const symbol of candidates) {
      if (this.hasSeenSymbol(symbol)) {
        continue;
      }

      const preferredOrder = this.rankArchetypesForSymbol(symbol);
      for (const archetype of preferredOrder) {
        if (cooldownSet.has(archetype)) {
          continue;
        }
        if (!this.hasSeenCombo(symbol, archetype)) {
          const hookStyle =
            OPENING_HOOK_STYLES[this.state.hookCadenceIndex % OPENING_HOOK_STYLES.length];
          return { symbol, archetype, hookStyle };
        }
      }
    }

    // Fallback: relax archetype cooldown window ONLY for still-unseen functions
    for (const symbol of candidates) {
      if (this.hasSeenSymbol(symbol)) {
        continue;
      }
      for (const archetype of ALL_ARCHETYPES) {
        if (!this.hasSeenCombo(symbol, archetype)) {
          const hookStyle =
            OPENING_HOOK_STYLES[this.state.hookCadenceIndex % OPENING_HOOK_STYLES.length];
          return { symbol, archetype, hookStyle };
        }
      }
    }

    return null;
  }

  /**
   * Selects a diverse batch of up to `batchSize` (default 5) completely unseen
   * functions for the "Tournament of 5" LLM curation prompt.
   *
   * Prioritizes:
   * 1. Strictly unseen functions (`!hasSeenSymbol(symbol)` — never repeats a function!).
   * 2. Distinct file paths so the LLM compares genuinely different parts of the repo.
   * 3. Non-cooldown archetypes so the feed stays varied.
   */
  public pickTournamentBatch(
    candidates: CandidateSymbol[],
    batchSize = 5
  ): {
    batch: CandidateSymbol[];
    allowedArchetypes: NibblArchetype[];
    hookStyle: string;
  } | null {
    if (candidates.length === 0) {
      return null;
    }

    const cooldownSet = new Set(this.state.recentArchetypes.slice(-ARCHETYPE_COOLDOWN_WINDOW));
    const allowedArchetypes = ALL_ARCHETYPES.filter((a) => !cooldownSet.has(a));
    const effectiveAllowed = allowedArchetypes.length > 0 ? allowedArchetypes : [...ALL_ARCHETYPES];

    const selected: CandidateSymbol[] = [];
    const seenFiles = new Set<string>();
    const selectedKeys = new Set<string>();

    const isEligible = (symbol: CandidateSymbol): boolean => {
      if (this.hasSeenSymbol(symbol)) {
        return false;
      }
      return effectiveAllowed.some((arch) => !this.hasSeenCombo(symbol, arch));
    };

    // Pass 1: Pick highest-ranked eligible symbols from distinct files
    for (const symbol of candidates) {
      if (selected.length >= batchSize) {
        break;
      }
      if (seenFiles.has(symbol.filePath) || !isEligible(symbol)) {
        continue;
      }
      selected.push(symbol);
      seenFiles.add(symbol.filePath);
      selectedKeys.add(`${symbol.filePath}::${symbol.symbolName}`);
    }

    // Pass 2: Top up remaining slots from same files if repo has fewer than `batchSize` files
    if (selected.length < batchSize) {
      for (const symbol of candidates) {
        if (selected.length >= batchSize) {
          break;
        }
        const key = `${symbol.filePath}::${symbol.symbolName}`;
        if (selectedKeys.has(key) || !isEligible(symbol)) {
          continue;
        }
        selected.push(symbol);
        selectedKeys.add(key);
      }
    }

    if (selected.length === 0) {
      // Fallback: relax lens cap if all symbols have been visited
      const fallback = this.pickNextFreshTarget(candidates);
      if (!fallback) {
        return null;
      }
      return {
        batch: [fallback.symbol],
        allowedArchetypes: [fallback.archetype],
        hookStyle: fallback.hookStyle,
      };
    }

    const hookStyle =
      OPENING_HOOK_STYLES[this.state.hookCadenceIndex % OPENING_HOOK_STYLES.length];
    return {
      batch: selected,
      allowedArchetypes: effectiveAllowed,
      hookStyle,
    };
  }

  /**
   * Records a newly generated Nibbl card into the 6-Layer Anti-Repetition Ledger.
   */
  public recordGeneratedNibbl(params: {
    symbol: Pick<CandidateSymbol, 'filePath' | 'symbolName' | 'codeHash'>;
    archetype: NibblArchetype;
    headline: string;
    whyItMatters: string;
  }): void {
    const comboKey = SeenLedger.buildComboKey(params.symbol, params.archetype);
    if (!this.state.seenComboKeys.includes(comboKey)) {
      this.state.seenComboKeys.push(comboKey);
    }

    const symbolKey = SeenLedger.buildSymbolKey(params.symbol);
    const history = this.state.symbolArchetypeHistory[symbolKey] ?? [];
    if (!history.includes(params.archetype)) {
      this.state.symbolArchetypeHistory[symbolKey] = [...history, params.archetype];
    }

    this.state.recentArchetypes = [
      ...this.state.recentArchetypes.slice(-(ARCHETYPE_COOLDOWN_WINDOW - 1)),
      params.archetype,
    ];

    this.state.recentHeadlines = [
      ...this.state.recentHeadlines.slice(-(MAX_RECENT_HEADLINES - 1)),
      {
        archetype: params.archetype,
        headline: params.headline,
        whyItMatters: params.whyItMatters,
        timestamp: Date.now(),
      },
    ];

    this.state.hookCadenceIndex = (this.state.hookCadenceIndex + 1) % OPENING_HOOK_STYLES.length;
    this.state.stats.nibblsMunched += 1;
  }

  public recordQuizSolved(): void {
    this.state.stats.quizzesSolved += 1;
  }

  /**
   * Formats the `<do_not_repeat>` negative memory block for the LLM prompt.
   */
  public buildDoNotRepeatPromptBlock(): string {
    if (this.state.recentHeadlines.length === 0) {
      return 'No previous Nibbls generated yet.';
    }
    return this.state.recentHeadlines
      .map(
        (item, idx) =>
          `${idx + 1}. [${item.archetype}] "${item.headline}" — (${item.whyItMatters})`
      )
      .join('\n');
  }

  /**
   * Matches the symbol's detected Scoville Spice Signals to the best-fitting Archetypes.
   */
  private rankArchetypesForSymbol(symbol: CandidateSymbol): NibblArchetype[] {
    const prioritized: NibblArchetype[] = [];
    const signals = new Set(symbol.spiceSignals);

    if (signals.has('FRESH_OUT_THE_OVEN')) {
      prioritized.push('AI_VIBE_AUDIT', 'MISSED_EDGE_CASE');
    }
    if (
      signals.has('CONCURRENCY_TIME_TRAVEL') ||
      signals.has('HIGH_STAKES_DANGER_ZONE') ||
      symbol.cognitiveComplexity >= 40
    ) {
      prioritized.push('MISSED_EDGE_CASE');
    }
    if (signals.has('EDGE_CASE_ARMOR') || signals.has('BOUNDARY_NINJA')) {
      prioritized.push('GLAZE_THE_DEV', 'PLOT_TWIST_QUIZ');
    }
    if (signals.has('DEV_CONFESSION_COMMENT')) {
      prioritized.push('CAUGHT_IN_4K');
    }
    if (signals.has('BLACK_MAGIC_WIZARDRY')) {
      prioritized.push('BLACK_MAGIC_DECODED');
    }
    if (signals.has('MAIN_CHARACTER_HUB')) {
      prioritized.push('MAIN_CHARACTER', 'DOMINO_EFFECT');
    }
    if (signals.has('LATE_NIGHT_GIT_DRAMA') || symbol.gitContext) {
      prioritized.push('GIT_TIME_CAPSULE');
    }

    prioritized.push('DID_YOU_KNOW', 'EXPLAIN_LIKE_IM_5', ...ALL_ARCHETYPES);
    return Array.from(new Set(prioritized));
  }
}
