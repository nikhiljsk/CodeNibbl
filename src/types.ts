/**
 * ============================================================================
 * CodeNibbl 🐹🌶️ — Core Type Contracts (`src/types.ts`)
 * ============================================================================
 * Single source of truth for all data structures across the Harvester,
 * Anti-Repetition Engine, Universal LLM Router, Security Layer, and Webview UI.
 */

export type LLMProviderType =
  | 'vscode-lm'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'xai'
  | 'custom';

export type VibeMode =
  | 'genz_hype'      // 🌶️ Default: High energy, glazes smart code, punchy slang & memes
  | 'chaos_gremlin'  // 🕵️ Witty playful roast, hunts TODOs, magic numbers & plot twists
  | 'chill_mentor';  // ☕ Warm, funny everyday analogies, zero corporate jargon

export type MascotMood =
  | 'cooking'
  | 'chef_kiss'
  | 'mind_blown'
  | 'detective'
  | 'spicy_sweat'
  | 'chill'
  | 'hyped';

/**
 * The 10 Rotating GenZ Card Archetypes
 */
export type NibblArchetype =
  | 'GLAZE_THE_DEV'       // 👑 Hypes up a smart edge-case guard or clean optimization
  | 'DID_YOU_KNOW'        // 🤯 Uncovers hidden codebase lore or sneaky side-effects
  | 'CAUGHT_IN_4K'        // 📸 Playfully spotlights a funny TODO, HACK, or magic number
  | 'PLOT_TWIST_QUIZ'     // 🕵️ 1-tap interactive edge-case brain teaser
  | 'EXPLAIN_LIKE_IM_5'   // 🧃 Translates gnarly code into an everyday analogy
  | 'BLACK_MAGIC_DECODED' // 🧙‍♂️ Demystifies regex, bitwise ops, or dense one-liners
  | 'MAIN_CHARACTER'      // 💅 Profiles a high-traffic hub function with a Mermaid map
  | 'DOMINO_EFFECT'       // 🧨 Shows downstream blast radius via Mermaid diagram
  | 'GIT_TIME_CAPSULE'    // 🦖 Connects weird code to the commit that birthed it
  | 'AI_VIBE_AUDIT';      // 🤖 10-second vibe check on freshly edited code

/**
 * The 12 Deterministic Spice Signals mined by `spiceHarvester.ts`
 */
export type SpiceSignalType =
  | 'EDGE_CASE_ARMOR'
  | 'BLACK_MAGIC_WIZARDRY'
  | 'CONCURRENCY_TIME_TRAVEL'
  | 'DEV_CONFESSION_COMMENT'
  | 'MAIN_CHARACTER_HUB'
  | 'BOUNDARY_NINJA'
  | 'LATE_NIGHT_GIT_DRAMA'
  | 'HIGH_STAKES_DANGER_ZONE'
  | 'SECRET_SWITCH_FLAG'
  | 'STATE_MACHINE_PLOT_TWIST'
  | 'TYPE_VALIDATION_GYMNASTICS'
  | 'FRESH_OUT_THE_OVEN';

export type ScovilleTier =
  | '🟢 Mild'
  | '🌶️ Jalapeño'
  | '🔥 Habanero'
  | '💀 Ghost Pepper'
  | '☢️ Carolina Reaper';

export interface CandidateSymbol {
  /** Workspace-relative POSIX path, e.g. "src/auth/verify.ts" */
  filePath: string;
  /** Symbol name, e.g. "verifyTokenWithRetry" */
  symbolName: string;
  /** 1-based start line in the file */
  startLine: number;
  /** 1-based end line in the file */
  endLine: number;
  /** Language identifier, e.g. "typescript", "python" */
  language: string;
  /** Secret-scrubbed source code of the symbol */
  code: string;
  /** Deterministic SHA-256 hash of whitespace-normalized `code` */
  codeHash: string;
  /** Calculated Scoville score (0 - 200+) */
  scovilleScore: number;
  /** Human-readable Scoville tier badge */
  scovilleTier: ScovilleTier;
  /** Detected spice signals explaining WHY this code is interesting */
  spiceSignals: SpiceSignalType[];
  /** Specific 1-based line numbers where spicy patterns were detected */
  spicyLineNumbers: number[];
  /** Optional recent git commit message & author context */
  gitContext?: {
    commitHash: string;
    subject: string;
    authorTimeIso: string;
    isLateNightCommit: boolean;
  };
  /** Neighbouring symbols / imports for Mermaid diagram accuracy */
  relatedSymbols: string[];
}

export interface NibblCodeLink {
  /** Display label, e.g. "verifyTokenWithRetry() • verify.ts:42" */
  label: string;
  /** Workspace-relative file path */
  filePath: string;
  /** 1-based line number to reveal */
  line: number;
  /** Optional 1-based end line to highlight */
  endLine?: number;
}

export interface NibblCard {
  id: string;
  archetype: NibblArchetype;
  mascotMood: MascotMood;
  scovilleScore: number;
  scovilleTier: ScovilleTier;
  badgeText: string;
  /** Catchy, funky GenZ headline (<= 16 words) */
  headline: string;
  /** Layman explanation markdown (<= 60 words) */
  laymanBody: string;
  /** 1-line punchy takeaway ("💡 Why This Slaps: ...") */
  whyItMatters: string;
  /** Primary code snippet with real file coordinates & hero line highlights */
  codeSnippet?: {
    filePath: string;
    startLine: number;
    endLine: number;
    language: string;
    code: string;
    highlightLines?: number[];
  };
  /** Pre-sanitized Mermaid flowchart TD or sequenceDiagram */
  mermaidDiagram?: string;
  /** Optional 1-tap micro-quiz for PLOT_TWIST_QUIZ */
  interactiveQuiz?: {
    question: string;
    options: string[];
    correctIndex: number;
    ahaExplanation: string;
  };
  /** Clickable deep-links to teleport straight to the code */
  codeLinks: NibblCodeLink[];
  createdAt: number;
}

/**
 * Persistent state for the 6-Layer Anti-Repetition Engine
 */
export interface SeenLedgerState {
  version: 1;
  /** Set of "${filePath}::${symbolName}::${codeHash}::${archetype}" */
  seenComboKeys: string[];
  /** Map of "${filePath}::${symbolName}" -> list of used archetypes */
  symbolArchetypeHistory: Record<string, NibblArchetype[]>;
  /** Rolling ring buffer of the last 20 generated headlines + takeaways */
  recentHeadlines: Array<{
    archetype: NibblArchetype;
    headline: string;
    whyItMatters: string;
    timestamp: number;
  }>;
  /** Last 3 used archetypes (to enforce no back-to-back repeats) */
  recentArchetypes: NibblArchetype[];
  /** Rotating index (0..7) for opening hook cadence */
  hookCadenceIndex: number;
  /** Fun user stats ("Nibbls Munched", "Quizzes Solved") */
  stats: {
    nibblsMunched: number;
    quizzesSolved: number;
  };
}

/**
 * Strict Message Contracts between Webview and Extension Host
 */
export type WebviewIncomingMessage =
  | { type: 'READY' }
  | { type: 'SPIN_NEXT_NIBBL' }
  | { type: 'JUMP_TO_CODE'; filePath: string; line: number; endLine?: number }
  | { type: 'SWITCH_VIBE'; vibeMode: VibeMode }
  | { type: 'QUIZ_SOLVED'; cardId: string }
  | { type: 'FLEX_CARD_COPY'; markdown: string }
  | { type: 'CONFIGURE_MODEL' }
  | { type: 'GITHUB_SPONSORS' }
  | { type: 'BUY_ME_A_COFFEE' };

export type WebviewOutgoingMessage =
  | {
      type: 'STATE_UPDATE';
      currentCard: NibblCard | null;
      queueDepth: number;
      isCooking: boolean;
      vibeMode: VibeMode;
      stats: { nibblsMunched: number; quizzesSolved: number };
      providerLabel: string;
    };
