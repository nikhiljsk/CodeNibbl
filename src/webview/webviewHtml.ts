/**
 * ============================================================================
 * CodeNibbl — Single-Card TikTok Stage Webview Builder (`src/webview/webviewHtml.ts`)
 * ============================================================================
 * UX & SECURITY INVARIANTS:
 * 1. Strictly ONE card is displayed on stage at a time (never a stacked blog!).
 * 2. Pre-cooked cards are buffered in memory (`STATE.cards`) and streamed via
 *    `postMessage` (`APPEND_CARD`), so advancing to Next/Prev is instant (0ms)
 *    with a smooth vertical TikTok slide animation!
 * 3. Uses a fresh 256-bit cryptographic `nonce` via `generateCspNonce()` and
 *    `buildStrictCspHeader()` (`default-src 'none'; connect-src 'none'`).
 * 4. NEVER uses `innerHTML` with untrusted strings; server HTML uses `escapeHtml()`
 *    and client card swaps use `document.createElement` + `textContent`
 *    (plus `image/svg+xml` DOMParser for sanitized Mermaid SVGs).
 */

import {
  buildStrictCspHeader,
  escapeHtml,
  generateCspNonce,
} from '../security/csp';
import {
  MASCOT_LABELS_BY_MOOD,
  MASCOT_SVG_BY_MOOD,
} from './mascotAssets';
import { renderMermaidToSvg } from './mermaidRenderer';
import { NibblCard, VibeMode } from '../types';

/**
 * Safely serializes a value for embedding inside a `<script>` tag so characters
 * like `<`, `>`, `&`, U+2028, or U+2029 can never break out of `<script>`.
 */
function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Formats a `NibblCard` as shareable Markdown for the "📸 Flex Card" button.
 */
export function formatFlexCardMarkdown(card: NibblCard): string {
  const parts: string[] = [
    `### 🐹 CodeNibbl: ${card.headline}`,
    `> **${card.badgeText}** • \`${card.scovilleTier} (${card.scovilleScore} SHU)\``,
    '',
    card.laymanBody,
    '',
    card.whyItMatters,
  ];

  if (card.codeSnippet?.code) {
    const lang = card.codeSnippet.language || 'ts';
    const filePath = card.codeSnippet.filePath || '';
    const startLine = card.codeSnippet.startLine ?? 1;
    parts.push(
      '',
      '```' + lang,
      `// ${filePath}:${startLine}`,
      card.codeSnippet.code,
      '```'
    );
  }

  if (card.suggestedFix) {
    parts.push(
      '',
      '**🛠️ Quick Fix Idea:**',
      '```' + (card.codeSnippet?.language || 'ts'),
      card.suggestedFix,
      '```'
    );
  }

  parts.push('', '*Snacked via [CodeNibbl](https://github.com/nikhiljsk/CodeNibbl) 🌶️*');
  return parts.join('\n');
}

export type WebviewEmptyState = 'no_workspace' | 'cooking' | 'needs_model' | 'all_seen';

export interface SerializedDeckCard {
  card: NibblCard;
  renderedMermaidSvg: string | null;
  flexMarkdown: string;
  mascotLabel: string;
}

function renderActiveCardHtml(card: NibblCard, renderedSvg: string | null): string {
  const codeRowsHtml = card.codeSnippet
    ? card.codeSnippet.code
        .split(/\r?\n/)
        .map((lineText, idx) => {
          const lineNum = (card.codeSnippet?.startLine ?? 1) + idx;
          const isHero = card.codeSnippet?.highlightLines?.includes(lineNum);
          return `<div class="code-line ${isHero ? 'hero-line' : ''}">
            <span class="line-num">${lineNum}</span>
            <span class="line-text">${escapeHtml(lineText)}</span>
          </div>`;
        })
        .join('')
    : '';

  const linksHtml = card.codeLinks
    .map(
      (link) =>
        `<button type="button" class="code-link-pill" data-file="${escapeHtml(link.filePath)}" data-line="${link.line}" data-end="${link.endLine ?? link.line}">
          📍 ${escapeHtml(link.label)}
        </button>`
    )
    .join('');

  const quizHtml = card.interactiveQuiz
    ? `<div class="quiz-box">
        <div class="quiz-q">🕵️ ${escapeHtml(card.interactiveQuiz.question)}</div>
        <div class="quiz-options">
          ${card.interactiveQuiz.options
            .map(
              (opt, idx) =>
                `<button type="button" class="quiz-opt" data-idx="${idx}" data-correct="${card.interactiveQuiz?.correctIndex === idx ? '1' : '0'}">${escapeHtml(opt)}</button>`
            )
            .join('')}
        </div>
        <div id="quiz-feedback" class="quiz-feedback" hidden>
          🎉 ${escapeHtml(card.interactiveQuiz.ahaExplanation)}
        </div>
      </div>`
    : '';

  const mermaidHtml = card.mermaidDiagram
    ? `<details class="mermaid-details" open>
        <summary class="mermaid-summary">🗺️ Architecture Flow Map</summary>
        <div class="mermaid-box">
          ${
            renderedSvg
              ? `<div class="mermaid-svg-wrap">${renderedSvg}</div>`
              : `<div class="mermaid-raw">${escapeHtml(card.mermaidDiagram)}</div>`
          }
        </div>
      </details>`
    : '';

  const suggestedFixHtml = card.suggestedFix
    ? `<details class="mermaid-details">
        <summary class="mermaid-summary">🛠️ Quick Fix Idea</summary>
        <div class="mermaid-box">
          <div class="mermaid-raw">${escapeHtml(card.suggestedFix)}</div>
        </div>
      </details>`
    : '';

  return `<div class="card slide-anim-next" data-card-id="${escapeHtml(card.id)}">
    <div class="badge-row">
      <span class="archetype-pill">${escapeHtml(card.badgeText)}</span>
      <span class="scoville-pill">${escapeHtml(card.scovilleTier)} • ${card.scovilleScore} SHU</span>
    </div>

    <h2 class="headline">${escapeHtml(card.headline)}</h2>
    <p class="layman-body">${escapeHtml(card.laymanBody)}</p>

    <div class="tldr-box">${escapeHtml(card.whyItMatters)}</div>

    ${card.codeSnippet ? `<div class="code-box">${codeRowsHtml}</div>` : ''}

    ${mermaidHtml}

    ${suggestedFixHtml}

    ${quizHtml}

    <div class="links-wrap">${linksHtml}</div>

    <div class="card-actions-bar">
      <button type="button" id="btn-cooked" class="action-btn cooked-btn js-cooked-btn" data-card-id="${escapeHtml(card.id)}">🔥 You Cooked</button>
      <button type="button" id="btn-flex" class="action-btn flex-btn js-flex-btn" data-card-id="${escapeHtml(card.id)}">📸 Flex Card</button>
    </div>
  </div>`;
}

export function buildWebviewHtml(params: {
  cspSource: string;
  initialCard?: NibblCard | null;
  cards?: NibblCard[];
  activeIndex?: number;
  isCooking?: boolean;
  errorHint?: string;
  emptyState?: WebviewEmptyState;
  vibeMode: VibeMode;
  providerLabel: string;
  stats: { nibblsMunched: number; quizzesSolved: number };
  customMascotUri?: string;
}): string {
  const nonce = generateCspNonce();
  const cspHeader = buildStrictCspHeader(params.cspSource, nonce);

  const rawDeck: NibblCard[] =
    params.cards && params.cards.length > 0
      ? params.cards
      : params.initialCard
        ? [params.initialCard]
        : [];

  const serializedDeck: SerializedDeckCard[] = rawDeck.map((c) => ({
    card: c,
    renderedMermaidSvg: c.mermaidDiagram ? renderMermaidToSvg(c.mermaidDiagram) : null,
    flexMarkdown: formatFlexCardMarkdown(c),
    mascotLabel: MASCOT_LABELS_BY_MOOD[c.mascotMood] ?? '',
  }));

  const startIdx = Math.min(
    Math.max(0, params.activeIndex ?? 0),
    Math.max(0, serializedDeck.length - 1)
  );
  const currentEntry = serializedDeck[startIdx] ?? null;
  const currentCard = currentEntry?.card ?? null;

  const isCooking = Boolean(params.isCooking);
  const emptyState: WebviewEmptyState =
    params.emptyState ?? (isCooking ? 'cooking' : 'no_workspace');

  const activeMood = currentCard
    ? currentCard.mascotMood
    : emptyState === 'cooking' || isCooking
      ? 'cooking'
      : emptyState === 'needs_model'
        ? 'hyped'
        : 'chill';

  const mascotSvg = params.customMascotUri
    ? `<img src="${escapeHtml(params.customMascotUri)}" width="40" height="40" alt="Nibbl Mascot" class="custom-mascot-img" />`
    : MASCOT_SVG_BY_MOOD[activeMood] ?? MASCOT_SVG_BY_MOOD.chill;

  const mascotLabel = currentEntry
    ? currentEntry.mascotLabel
    : emptyState === 'no_workspace'
      ? '📂 Open a project folder to begin'
      : emptyState === 'cooking'
        ? '🍳 Cooking fresh Nibbls...'
        : emptyState === 'all_seen'
          ? '🏆 Every function nibbled!'
          : '🔑 Connect a model to cook Nibbls';

  const errorBannerHtml = params.errorHint
    ? `<div class="error-hint-box">⚠️ ${escapeHtml(params.errorHint)}</div>`
    : '';

  const emptyCardHtml =
    emptyState === 'no_workspace'
      ? `<div class="card empty-card">
          <h2 class="headline">📂 No Project Open Yet</h2>
          <p class="layman-body">Open a project folder or repository in VS Code, and CodeNibbl will generate bite-sized insights, quizzes, and flow diagrams directly from your actual code.</p>
          <button type="button" id="btn-open-folder" class="action-btn primary">📂 Open Folder</button>
        </div>`
      : emptyState === 'cooking'
        ? `<div class="card empty-card cooking-card">
            <div class="cooking-badge-row">
              <span class="spinner-ring" aria-hidden="true"></span>
              <span class="cooking-pill-label" id="empty-cooking-status">🍳 Hunting spicy functions & missed edge cases...</span>
            </div>
            <div class="shimmer-line shimmer-lg"></div>
            <div class="shimmer-line shimmer-md"></div>
            <div class="shimmer-line shimmer-code"></div>
            <p class="layman-body muted-note">Pre-cooking a stack of Nibbls in the background so you can flip through them instantly!</p>
          </div>`
        : emptyState === 'all_seen'
          ? `<div class="card empty-card">
              <h2 class="headline">🏆 You Nibbled the Whole Repo!</h2>
              <p class="layman-body">Every eligible function in this project has been covered without repeats. Edit some code or reset your seen history for a fresh run!</p>
              <button type="button" id="btn-reset-history" class="action-btn primary">🔄 Reset Seen History & Cook Again</button>
            </div>`
          : `<div class="card empty-card">
              <h2 class="headline">🔑 Connect a Model to Start</h2>
              <p class="layman-body">Your project is ready! Connect OpenAI, Anthropic, Gemini, Grok, Ollama, or use VS Code's built-in model to generate Nibbls from this codebase.</p>
              ${errorBannerHtml}
              <button type="button" id="btn-model-empty" class="action-btn primary">🔑 Connect Model & API Key</button>
            </div>`;

  // Strictly ONE card rendered inside `#single-card-stage` at any moment!
  const initialStageHtml = currentEntry
    ? renderActiveCardHtml(currentEntry.card, currentEntry.renderedMermaidSvg)
    : emptyCardHtml;

  const upNextReady = Math.max(0, serializedDeck.length - 1 - startIdx);
  const nextBtnLabel =
    upNextReady > 0
      ? `⚡ Next Nibbl (${upNextReady} ready)`
      : isCooking
        ? '⏳ Next (Cooking...)'
        : '⚡ Next Nibbl';

  const clientData = {
    vibeMode: params.vibeMode,
    initialIndex: startIdx,
    isCooking,
    allSeen: emptyState === 'all_seen',
    hasCustomMascot: Boolean(params.customMascotUri),
    deck: serializedDeck,
    mascotSvgByMood: MASCOT_SVG_BY_MOOD,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${cspHeader}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CodeNibbl</title>
  <style nonce="${nonce}">
    :root {
      --bg-card: rgba(255, 255, 255, 0.045);
      --bg-subtle: rgba(255, 255, 255, 0.03);
      --border-subtle: rgba(255, 255, 255, 0.14);
      --border-neon: #ff9f1c;
      --text-muted: rgba(255, 255, 255, 0.68);
      --accent-pink: #ff4d6d;
      --accent-mint: #00f5d4;
      --accent-mint-text: #00f5d4;
      --accent-yellow: #fee440;
      --accent-purple: #9b5de5;

      --pill-scoville-bg: rgba(254, 228, 64, 0.15);
      --pill-scoville-fg: #fee440;
      --pill-scoville-border: rgba(254, 228, 64, 0.65);

      --tldr-bg: rgba(0, 245, 212, 0.10);
      --tldr-border: #00f5d4;

      --btn-cooked-bg: rgba(255, 159, 28, 0.20);
      --btn-cooked-fg: #ffd166;
      --btn-cooked-border: #ff9f1c;

      --btn-flex-bg: rgba(155, 93, 229, 0.22);
      --btn-flex-fg: #f3e8ff;
      --btn-flex-border: #9b5de5;

      --btn-sponsor-bg: rgba(255, 77, 109, 0.15);
      --btn-sponsor-fg: #ff758f;
      --btn-sponsor-border: rgba(255, 77, 109, 0.5);

      --btn-coffee-bg: rgba(254, 228, 64, 0.14);
      --btn-coffee-fg: #fee440;
      --btn-coffee-border: rgba(254, 228, 64, 0.45);

      --quiz-correct-bg: rgba(0, 245, 212, 0.20);
      --quiz-wrong-bg: rgba(255, 77, 109, 0.20);
      --quiz-wrong-fg: #ff758f;

      --shimmer-a: rgba(255, 255, 255, 0.06);
      --shimmer-b: rgba(255, 255, 255, 0.16);
      --card-shadow: 0 6px 20px rgba(0, 0, 0, 0.26);

      --nibbl-svg-edge: rgba(255, 255, 255, 0.65);
      --nibbl-svg-node-bg: rgba(255, 255, 255, 0.06);
    }

    /* High-contrast Light Mode overrides so every button, pill, & SVG is razor-sharp! */
    body.vscode-light,
    body.vscode-high-contrast-light {
      --bg-card: #ffffff;
      --bg-subtle: rgba(15, 23, 42, 0.04);
      --border-subtle: rgba(15, 23, 42, 0.16);
      --border-neon: #ea580c;
      --text-muted: #475569;
      --accent-mint-text: #0f766e;

      --pill-scoville-bg: #fef3c7;
      --pill-scoville-fg: #92400e;
      --pill-scoville-border: #f59e0b;

      --tldr-bg: #ecfdf5;
      --tldr-border: #0d9488;

      --btn-cooked-bg: #fff7ed;
      --btn-cooked-fg: #9a3412;
      --btn-cooked-border: #ea580c;

      --btn-flex-bg: #f3e8ff;
      --btn-flex-fg: #581c87;
      --btn-flex-border: #9333ea;

      --btn-sponsor-bg: #fff1f2;
      --btn-sponsor-fg: #9f1239;
      --btn-sponsor-border: #f43f5e;

      --btn-coffee-bg: #fef9c3;
      --btn-coffee-fg: #854d0e;
      --btn-coffee-border: #eab308;

      --quiz-correct-bg: #d1fae5;
      --quiz-wrong-bg: #ffe4e6;
      --quiz-wrong-fg: #be123c;

      --shimmer-a: rgba(15, 23, 42, 0.06);
      --shimmer-b: rgba(15, 23, 42, 0.14);
      --card-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);

      --nibbl-svg-edge: rgba(15, 23, 42, 0.62);
      --nibbl-svg-node-bg: rgba(15, 23, 42, 0.05);
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      padding: 10px 10px 8px 10px;
      gap: 8px;
      overflow: hidden;
    }

    #confetti-canvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 99999;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      flex-shrink: 0;
    }

    .mascot-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .mascot-avatar {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .mascot-avatar.bounce {
      transform: scale(1.25) rotate(-6deg);
    }
    .custom-mascot-img {
      object-fit: contain;
      border-radius: 8px;
    }

    .mascot-meta {
      display: flex;
      flex-direction: column;
      font-size: 10.5px;
      min-width: 0;
    }
    .mascot-title-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .mascot-title {
      font-weight: 800;
      font-size: 12px;
      letter-spacing: 0.2px;
    }
    .deck-counter-pill {
      font-size: 10px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
    }
    .live-cooking-dot {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 700;
      color: var(--border-neon);
    }
    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--border-neon);
      animation: nibblPulse 1s infinite ease-in-out;
    }
    @keyframes nibblPulse {
      0%, 100% { opacity: 0.35; transform: scale(0.85); }
      50% { opacity: 1; transform: scale(1.2); }
    }

    /* Single-Card TikTok Stage: ONLY 1 card is ever mounted inside here! */
    .single-card-stage {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      padding-right: 2px;
    }
    .single-card-stage::-webkit-scrollbar {
      width: 5px;
    }
    .single-card-stage::-webkit-scrollbar-thumb {
      background: var(--border-subtle);
      border-radius: 999px;
    }

    /* Crisp TikTok Slide-Up / Slide-Down Transitions */
    .slide-anim-next {
      animation: tiktokSlideNext 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .slide-anim-prev {
      animation: tiktokSlidePrev 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes tiktokSlideNext {
      from { opacity: 0; transform: translateY(28px) scale(0.985); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes tiktokSlidePrev {
      from { opacity: 0; transform: translateY(-28px) scale(0.985); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .card {
      border-radius: 16px;
      padding: 13px;
      background: var(--bg-card);
      border: 2px solid var(--border-neon);
      box-shadow: var(--card-shadow);
      display: flex;
      flex-direction: column;
      gap: 10px;
      position: relative;
    }
    .empty-card {
      margin: auto 0;
    }

    .badge-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .archetype-pill {
      background: var(--accent-pink);
      color: #ffffff;
      font-weight: 800;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 999px;
      letter-spacing: 0.5px;
    }
    .scoville-pill {
      background: var(--pill-scoville-bg);
      color: var(--pill-scoville-fg);
      border: 1px solid var(--pill-scoville-border);
      font-weight: 700;
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 999px;
    }

    .headline {
      font-size: 15.5px;
      font-weight: 800;
      line-height: 1.35;
      margin: 0;
    }
    .layman-body {
      font-size: 12.8px;
      line-height: 1.52;
      opacity: 0.94;
      margin: 0;
    }
    .muted-note {
      color: var(--text-muted);
      font-size: 11.5px;
    }

    .tldr-box {
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--tldr-bg);
      border-left: 3px solid var(--tldr-border);
      font-size: 12px;
      font-weight: 600;
    }

    .code-box {
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground, var(--vscode-foreground));
      border-radius: 10px;
      padding: 8px 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
    }
    .code-line {
      display: flex;
      padding: 1px 10px;
      white-space: pre;
    }
    .code-line.hero-line {
      background: rgba(255, 159, 28, 0.18);
      border-left: 3px solid var(--border-neon);
    }
    .line-num {
      width: 30px;
      opacity: 0.5;
      user-select: none;
      flex-shrink: 0;
    }

    .mermaid-details {
      background: var(--bg-subtle);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 8px 10px;
    }
    .mermaid-summary {
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 700;
      user-select: none;
      color: var(--accent-mint-text);
    }
    .mermaid-box {
      margin-top: 8px;
      padding: 8px;
      border-radius: 8px;
      background: var(--vscode-editor-background);
      border: 1px dashed var(--border-subtle);
      overflow-x: auto;
    }
    .mermaid-svg-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
    }
    .nibbl-mermaid-svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .mermaid-raw {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      white-space: pre-wrap;
      line-height: 1.4;
    }

    .quiz-box {
      padding: 10px;
      border-radius: 12px;
      background: rgba(155, 93, 229, 0.10);
      border: 1px solid rgba(155, 93, 229, 0.38);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .quiz-q {
      font-weight: 700;
      font-size: 12px;
    }
    .quiz-options {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .quiz-opt.is-correct {
      background: var(--quiz-correct-bg);
      border-color: var(--tldr-border);
      color: var(--vscode-foreground);
    }
    .quiz-opt.is-wrong {
      background: var(--quiz-wrong-bg);
      border-color: var(--accent-pink);
      color: var(--vscode-foreground);
    }
    .quiz-feedback {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent-mint-text);
      padding: 4px 6px;
    }
    .quiz-feedback.wrong-msg {
      color: var(--quiz-wrong-fg);
    }

    .card-actions-bar {
      display: flex;
      gap: 8px;
    }

    .quiz-opt, .code-link-pill, .action-btn {
      cursor: pointer;
      border-radius: 8px;
      border: 1px solid var(--border-subtle);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 7px 10px;
      font-size: 11.5px;
      font-weight: 600;
      text-align: left;
      transition: transform 0.1s ease, background 0.15s ease, opacity 0.15s ease;
    }
    .quiz-opt:hover, .code-link-pill:hover, .action-btn:hover {
      transform: translateY(-1px);
    }
    .action-btn:disabled {
      opacity: 0.4;
      cursor: default;
      transform: none;
    }
    .action-btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      text-align: center;
      font-weight: 800;
    }
    .action-btn.cooked-btn {
      flex: 1;
      text-align: center;
      background: var(--btn-cooked-bg);
      border: 1px solid var(--btn-cooked-border);
      color: var(--btn-cooked-fg);
      font-weight: 700;
    }
    .action-btn.flex-btn {
      flex: 1;
      text-align: center;
      background: var(--btn-flex-bg);
      border: 1px solid var(--btn-flex-border);
      color: var(--btn-flex-fg);
      font-weight: 700;
    }

    .links-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    /* Shimmer Skeleton & Spinner for Clear Loading State */
    .cooking-badge-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .spinner-ring {
      width: 16px;
      height: 16px;
      border: 2.5px solid var(--border-subtle);
      border-top-color: var(--border-neon);
      border-radius: 50%;
      flex-shrink: 0;
      animation: nibblSpin 0.75s linear infinite;
    }
    @keyframes nibblSpin {
      to { transform: rotate(360deg); }
    }
    .cooking-pill-label {
      font-size: 12.5px;
      font-weight: 800;
    }
    .shimmer-line {
      border-radius: 8px;
      background: linear-gradient(90deg, var(--shimmer-a) 25%, var(--shimmer-b) 50%, var(--shimmer-a) 75%);
      background-size: 200% 100%;
      animation: nibblShimmer 1.3s infinite linear;
    }
    .shimmer-lg { height: 18px; width: 88%; }
    .shimmer-md { height: 14px; width: 68%; }
    .shimmer-code { height: 74px; width: 100%; }
    @keyframes nibblShimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .error-hint-box {
      padding: 8px 10px;
      border-radius: 8px;
      background: var(--quiz-wrong-bg);
      color: var(--quiz-wrong-fg);
      border: 1px solid var(--accent-pink);
      font-size: 11.5px;
      font-weight: 600;
    }

    /* Sticky TikTok Stepper + Sponsor Footer */
    .footer-bar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      flex-shrink: 0;
    }
    .nav-strip {
      grid-column: span 2;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 6px;
    }
    .step-btn {
      padding: 7px 11px;
      text-align: center;
      font-weight: 800;
    }
    .sponsor-btn {
      text-align: center;
      background: var(--btn-sponsor-bg);
      color: var(--btn-sponsor-fg);
      border: 1px solid var(--btn-sponsor-border);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .coffee-btn {
      text-align: center;
      background: var(--btn-coffee-bg);
      color: var(--btn-coffee-fg);
      border: 1px solid var(--btn-coffee-border);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <canvas id="confetti-canvas"></canvas>

  <div class="app-shell">
    <div class="topbar">
      <div class="mascot-row">
        <div id="mascot-avatar" class="mascot-avatar">${mascotSvg}</div>
        <div class="mascot-meta">
          <div class="mascot-title-row">
            <span class="mascot-title">CodeNibbl (${escapeHtml(params.providerLabel)})</span>
            <span id="deck-counter" class="deck-counter-pill" ${serializedDeck.length === 0 ? 'hidden' : ''}>${startIdx + 1} / ${serializedDeck.length} Ready</span>
            <span id="live-cooking-indicator" class="live-cooking-dot" ${isCooking ? '' : 'hidden'}>
              <span class="pulse-dot"></span>Cooking
            </span>
          </div>
          <span id="mascot-mood-label">${escapeHtml(mascotLabel)}</span>
        </div>
      </div>
      <button type="button" id="btn-model" class="action-btn" title="Connect Model & API Key">🔑 Model</button>
    </div>

    <div id="single-card-stage" class="single-card-stage" tabindex="0">
      ${initialStageHtml}
    </div>

    <div class="footer-bar">
      <div id="nav-strip" class="nav-strip" ${serializedDeck.length === 0 ? 'hidden' : ''}>
        <button type="button" id="btn-prev" class="action-btn step-btn" title="Previous Nibbl (↑ / K)" ${startIdx === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" id="btn-spin" class="action-btn primary" title="Next Nibbl (↓ / J)">${escapeHtml(nextBtnLabel)}</button>
        <button type="button" id="btn-vibe" class="action-btn" title="Switch Personality Vibe">🎛️ ${escapeHtml(params.vibeMode)}</button>
      </div>
      <button type="button" id="btn-sponsors" class="action-btn sponsor-btn" title="Sponsor CodeNibbl on GitHub (0% fee)">💖 GitHub Sponsors</button>
      <button type="button" id="btn-coffee" class="action-btn coffee-btn" title="Buy Nibbl a Coffee">☕ Buy Me a Coffee</button>
    </div>
  </div>

  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const STATE = ${safeJsonForScript(clientData)};
      let activeIndex = STATE.initialIndex || 0;
      let waitingForNextCard = false;

      const COOKING_MESSAGES = [
        '🍳 Hunting missed edge cases in your repo...',
        '🧠 Auditing async flows & state mutations...',
        '🕵️ Running the Tournament of 5 candidates...',
        '⚡ Pre-cooking your next stack of Nibbls...'
      ];
      let msgTick = 0;
      setInterval(() => {
        msgTick = (msgTick + 1) % COOKING_MESSAGES.length;
        const emptyLabel = document.getElementById('empty-cooking-status');
        if (emptyLabel) emptyLabel.textContent = COOKING_MESSAGES[msgTick];
      }, 2200);

      function fireConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#ff4d6d', '#00b89c', '#f59e0b', '#8b5cf6', '#ff9f1c'];
        const particles = [];
        for (let i = 0; i < 48; i++) {
          particles.push({
            x: canvas.width * 0.5,
            y: canvas.height * 0.45,
            vx: (Math.random() - 0.5) * 9,
            vy: (Math.random() - 0.75) * 11,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            vRot: (Math.random() - 0.5) * 12,
            alpha: 1,
          });
        }

        function animate() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          let alive = false;
          for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.28;
            p.rotation += p.vRot;
            p.alpha -= 0.016;
            if (p.alpha > 0) {
              alive = true;
              ctx.save();
              ctx.globalAlpha = p.alpha;
              ctx.translate(p.x, p.y);
              ctx.rotate((p.rotation * Math.PI) / 180);
              ctx.fillStyle = p.color;
              ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
              ctx.restore();
            }
          }
          if (alive) {
            requestAnimationFrame(animate);
          } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        requestAnimationFrame(animate);
      }

      function syncChromeControls() {
        const total = STATE.deck.length;
        const counter = document.getElementById('deck-counter');
        const navStrip = document.getElementById('nav-strip');
        const prevBtn = document.getElementById('btn-prev');
        const nextBtn = document.getElementById('btn-spin');
        const dot = document.getElementById('live-cooking-indicator');

        if (dot) dot.hidden = !STATE.isCooking;

        if (total > 0) {
          if (navStrip) navStrip.hidden = false;
          if (counter) {
            counter.hidden = false;
            const shownIdx = Math.min(activeIndex + 1, total);
            counter.textContent = shownIdx + ' / ' + total + ' Ready';
          }
          if (prevBtn) {
            prevBtn.disabled = activeIndex <= 0 && !waitingForNextCard;
          }
          if (nextBtn) {
            const ahead = Math.max(0, total - 1 - activeIndex);
            if (waitingForNextCard) {
              nextBtn.textContent = STATE.allSeen ? '🏆 All Seen' : '⏳ Cooking Next...';
            } else if (ahead > 0) {
              nextBtn.textContent = '⚡ Next Nibbl (' + ahead + ' ready)';
            } else if (STATE.isCooking) {
              nextBtn.textContent = '⏳ Next (Cooking...)';
            } else {
              nextBtn.textContent = '⚡ Next Nibbl';
            }
          }
        }
      }

      // Safely build a single card DOM node using createElement + textContent (zero innerHTML!)
      function buildCardDom(entry, direction) {
        const card = entry.card;
        const cardEl = document.createElement('div');
        cardEl.className = direction === 'prev' ? 'card slide-anim-prev' : 'card slide-anim-next';
        cardEl.setAttribute('data-card-id', card.id);

        const badgeRow = document.createElement('div');
        badgeRow.className = 'badge-row';
        const archPill = document.createElement('span');
        archPill.className = 'archetype-pill';
        archPill.textContent = card.badgeText;
        const scovPill = document.createElement('span');
        scovPill.className = 'scoville-pill';
        scovPill.textContent = card.scovilleTier + ' • ' + card.scovilleScore + ' SHU';
        badgeRow.appendChild(archPill);
        badgeRow.appendChild(scovPill);
        cardEl.appendChild(badgeRow);

        const h2 = document.createElement('h2');
        h2.className = 'headline';
        h2.textContent = card.headline;
        cardEl.appendChild(h2);

        const bodyP = document.createElement('p');
        bodyP.className = 'layman-body';
        bodyP.textContent = card.laymanBody;
        cardEl.appendChild(bodyP);

        const tldr = document.createElement('div');
        tldr.className = 'tldr-box';
        tldr.textContent = card.whyItMatters;
        cardEl.appendChild(tldr);

        if (card.codeSnippet && card.codeSnippet.code) {
          const codeBox = document.createElement('div');
          codeBox.className = 'code-box';
          const lines = card.codeSnippet.code.split(/\\r?\\n/);
          lines.forEach((lineText, idx) => {
            const lineNum = (card.codeSnippet.startLine || 1) + idx;
            const row = document.createElement('div');
            const isHero =
              Array.isArray(card.codeSnippet.highlightLines) &&
              card.codeSnippet.highlightLines.indexOf(lineNum) !== -1;
            row.className = isHero ? 'code-line hero-line' : 'code-line';
            const numSpan = document.createElement('span');
            numSpan.className = 'line-num';
            numSpan.textContent = String(lineNum);
            const txtSpan = document.createElement('span');
            txtSpan.className = 'line-text';
            txtSpan.textContent = lineText;
            row.appendChild(numSpan);
            row.appendChild(txtSpan);
            codeBox.appendChild(row);
          });
          cardEl.appendChild(codeBox);
        }

        if (card.mermaidDiagram) {
          const details = document.createElement('details');
          details.className = 'mermaid-details';
          details.open = true;
          const summary = document.createElement('summary');
          summary.className = 'mermaid-summary';
          summary.textContent = '🗺️ Architecture Flow Map';
          const mBox = document.createElement('div');
          mBox.className = 'mermaid-box';

          let parsedSvg = null;
          if (entry.renderedMermaidSvg) {
            const doc = new DOMParser().parseFromString(entry.renderedMermaidSvg, 'image/svg+xml');
            const svgNode = doc.querySelector('svg');
            if (svgNode && !doc.querySelector('parsererror')) {
              parsedSvg = document.importNode(svgNode, true);
            }
          }
          if (parsedSvg) {
            const wrap = document.createElement('div');
            wrap.className = 'mermaid-svg-wrap';
            wrap.appendChild(parsedSvg);
            mBox.appendChild(wrap);
          } else {
            const raw = document.createElement('div');
            raw.className = 'mermaid-raw';
            raw.textContent = card.mermaidDiagram;
            mBox.appendChild(raw);
          }
          details.appendChild(summary);
          details.appendChild(mBox);
          cardEl.appendChild(details);
        }

        if (card.suggestedFix) {
          const fixDetails = document.createElement('details');
          fixDetails.className = 'mermaid-details';
          const fixSummary = document.createElement('summary');
          fixSummary.className = 'mermaid-summary';
          fixSummary.textContent = '🛠️ Quick Fix Idea';
          const fixBox = document.createElement('div');
          fixBox.className = 'mermaid-box';
          const fixRaw = document.createElement('div');
          fixRaw.className = 'mermaid-raw';
          fixRaw.textContent = card.suggestedFix;
          fixBox.appendChild(fixRaw);
          fixDetails.appendChild(fixSummary);
          fixDetails.appendChild(fixBox);
          cardEl.appendChild(fixDetails);
        }

        if (card.interactiveQuiz && Array.isArray(card.interactiveQuiz.options)) {
          const qBox = document.createElement('div');
          qBox.className = 'quiz-box';
          const qTitle = document.createElement('div');
          qTitle.className = 'quiz-q';
          qTitle.textContent = '🕵️ ' + card.interactiveQuiz.question;
          const qOpts = document.createElement('div');
          qOpts.className = 'quiz-options';
          card.interactiveQuiz.options.forEach((opt, idx) => {
            const optBtn = document.createElement('button');
            optBtn.type = 'button';
            optBtn.className = 'quiz-opt';
            optBtn.setAttribute('data-idx', String(idx));
            optBtn.setAttribute('data-correct', card.interactiveQuiz.correctIndex === idx ? '1' : '0');
            optBtn.textContent = opt;
            qOpts.appendChild(optBtn);
          });
          const qFb = document.createElement('div');
          qFb.id = 'quiz-feedback';
          qFb.className = 'quiz-feedback';
          qFb.hidden = true;
          qBox.appendChild(qTitle);
          qBox.appendChild(qOpts);
          qBox.appendChild(qFb);
          cardEl.appendChild(qBox);
        }

        if (Array.isArray(card.codeLinks) && card.codeLinks.length > 0) {
          const linksWrap = document.createElement('div');
          linksWrap.className = 'links-wrap';
          card.codeLinks.forEach((link) => {
            const lBtn = document.createElement('button');
            lBtn.type = 'button';
            lBtn.className = 'code-link-pill';
            lBtn.setAttribute('data-file', link.filePath);
            lBtn.setAttribute('data-line', String(link.line));
            lBtn.setAttribute('data-end', String(link.endLine || link.line));
            lBtn.textContent = '📍 ' + link.label;
            linksWrap.appendChild(lBtn);
          });
          cardEl.appendChild(linksWrap);
        }

        const actionsBar = document.createElement('div');
        actionsBar.className = 'card-actions-bar';
        const cBtn = document.createElement('button');
        cBtn.type = 'button';
        cBtn.id = 'btn-cooked';
        cBtn.className = 'action-btn cooked-btn js-cooked-btn';
        cBtn.setAttribute('data-card-id', card.id);
        cBtn.textContent = '🔥 You Cooked';
        const fBtn = document.createElement('button');
        fBtn.type = 'button';
        fBtn.id = 'btn-flex';
        fBtn.className = 'action-btn flex-btn js-flex-btn';
        fBtn.setAttribute('data-card-id', card.id);
        fBtn.textContent = '📸 Flex Card';
        actionsBar.appendChild(cBtn);
        actionsBar.appendChild(fBtn);
        cardEl.appendChild(actionsBar);

        bindCardEvents(cardEl, entry);
        return cardEl;
      }

      function buildWaitingStageDom() {
        const box = document.createElement('div');
        box.className = 'card empty-card cooking-card slide-anim-next';
        if (STATE.allSeen) {
          const h2 = document.createElement('h2');
          h2.className = 'headline';
          h2.textContent = '🏆 Repo Conquered!';
          const p = document.createElement('p');
          p.className = 'layman-body';
          p.textContent =
            'Every eligible function in this project has been nibbled—zero duplicate functions! Press ↑ to revisit cards or reset history.';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'action-btn primary';
          btn.textContent = '🔄 Reset Seen History & Cook Again';
          btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'RESET_SEEN_HISTORY' });
          });
          box.appendChild(h2);
          box.appendChild(p);
          box.appendChild(btn);
          return box;
        }

        const row = document.createElement('div');
        row.className = 'cooking-badge-row';
        const ring = document.createElement('span');
        ring.className = 'spinner-ring';
        const label = document.createElement('span');
        label.id = 'empty-cooking-status';
        label.className = 'cooking-pill-label';
        label.textContent = COOKING_MESSAGES[msgTick];
        row.appendChild(ring);
        row.appendChild(label);

        const s1 = document.createElement('div');
        s1.className = 'shimmer-line shimmer-lg';
        const s2 = document.createElement('div');
        s2.className = 'shimmer-line shimmer-md';
        const s3 = document.createElement('div');
        s3.className = 'shimmer-line shimmer-code';

        const note = document.createElement('p');
        note.className = 'layman-body muted-note';
        note.textContent = 'Your next card will pop onto stage automatically the second it finishes cooking!';

        box.appendChild(row);
        box.appendChild(s1);
        box.appendChild(s2);
        box.appendChild(s3);
        box.appendChild(note);
        return box;
      }

      function mountSingleCardOnStage(index, direction) {
        const stage = document.getElementById('single-card-stage');
        if (!stage) return;

        if (index < 0) return;

        if (index >= STATE.deck.length) {
          // User moved past the last ready card: show ONLY the shimmer loader (or All Seen)!
          waitingForNextCard = true;
          stage.replaceChildren(buildWaitingStageDom());
          stage.scrollTop = 0;
          syncChromeControls();
          if (!STATE.allSeen) {
            STATE.isCooking = true;
            syncChromeControls();
            vscode.postMessage({ type: 'SPIN_NEXT_NIBBL' });
          }
          return;
        }

        waitingForNextCard = false;
        activeIndex = index;
        const entry = STATE.deck[activeIndex];
        stage.replaceChildren(buildCardDom(entry, direction));
        stage.scrollTop = 0;

        // Update mascot mood label & built-in SVG mood in header
        const moodLabelEl = document.getElementById('mascot-mood-label');
        if (moodLabelEl && entry.mascotLabel) {
          moodLabelEl.textContent = entry.mascotLabel;
        }
        if (!STATE.hasCustomMascot && STATE.mascotSvgByMood[entry.card.mascotMood]) {
          const avatar = document.getElementById('mascot-avatar');
          if (avatar) {
            const doc = new DOMParser().parseFromString(
              STATE.mascotSvgByMood[entry.card.mascotMood],
              'image/svg+xml'
            );
            const svg = doc.querySelector('svg');
            if (svg && !doc.querySelector('parsererror')) {
              avatar.replaceChildren(document.importNode(svg, true));
            }
          }
        }

        syncChromeControls();

        // Proactively pre-cook more cards in the background when <= 2 ready cards remain ahead!
        if (STATE.deck.length - 1 - activeIndex <= 2 && !STATE.allSeen) {
          vscode.postMessage({ type: 'REQUEST_MORE_CARDS' });
        }
      }

      function bindCardEvents(root, entry) {
        root.querySelectorAll('.js-cooked-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            fireConfetti();
            btn.textContent = '🔥 Certified Chef! 🤌';
            const avatar = document.getElementById('mascot-avatar');
            if (avatar) {
              avatar.classList.add('bounce');
              setTimeout(() => avatar.classList.remove('bounce'), 600);
            }
          });
        });

        root.querySelectorAll('.js-flex-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            vscode.postMessage({ type: 'FLEX_CARD_COPY', markdown: entry.flexMarkdown });
            btn.textContent = '✅ Copied!';
            setTimeout(() => {
              btn.textContent = '📸 Flex Card';
            }, 2000);
          });
        });

        root.querySelectorAll('.code-link-pill').forEach((btn) => {
          btn.addEventListener('click', () => {
            const filePath = btn.getAttribute('data-file') || '';
            const line = Number(btn.getAttribute('data-line') || '1');
            const endLine = Number(btn.getAttribute('data-end') || String(line));
            vscode.postMessage({ type: 'JUMP_TO_CODE', filePath, line, endLine });
          });
        });

        root.querySelectorAll('.quiz-opt').forEach((btn) => {
          btn.addEventListener('click', () => {
            const isCorrect = btn.getAttribute('data-correct') === '1';
            const fb = root.querySelector('.quiz-feedback');
            if (isCorrect) {
              btn.classList.add('is-correct');
              if (fb) {
                fb.classList.remove('wrong-msg');
                fb.textContent = '🎉 ' + (entry.card.interactiveQuiz ? entry.card.interactiveQuiz.ahaExplanation : '');
                fb.hidden = false;
              }
              fireConfetti();
              vscode.postMessage({ type: 'QUIZ_SOLVED', cardId: entry.card.id });
            } else {
              btn.classList.add('is-wrong');
              if (fb) {
                fb.classList.add('wrong-msg');
                fb.textContent = '👀 Not quite! Give another option a tap.';
                fb.hidden = false;
              }
            }
          });
        });
      }

      // Bind initial server-rendered card if present
      if (STATE.deck.length > 0) {
        const stage = document.getElementById('single-card-stage');
        if (stage) {
          bindCardEvents(stage, STATE.deck[activeIndex]);
        }
      }

      function stepNext() {
        if (STATE.deck.length === 0) {
          vscode.postMessage({ type: 'SPIN_NEXT_NIBBL' });
          return;
        }
        if (waitingForNextCard) return;
        mountSingleCardOnStage(activeIndex + 1, 'next');
      }

      function stepPrev() {
        if (waitingForNextCard && STATE.deck.length > 0) {
          mountSingleCardOnStage(STATE.deck.length - 1, 'prev');
          return;
        }
        if (activeIndex > 0) {
          mountSingleCardOnStage(activeIndex - 1, 'prev');
        }
      }

      // Keyboard TikTok Shortcuts: ↓ / J = Next, ↑ / K = Prev
      window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
          e.preventDefault();
          stepNext();
        } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          stepPrev();
        }
      });

      document.getElementById('btn-prev')?.addEventListener('click', stepPrev);
      document.getElementById('btn-spin')?.addEventListener('click', stepNext);

      document.getElementById('btn-reset-history')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'RESET_SEEN_HISTORY' });
      });

      document.getElementById('btn-open-folder')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'OPEN_FOLDER' });
      });

      document.getElementById('btn-model-empty')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'CONFIGURE_MODEL' });
      });

      document.getElementById('btn-model')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'CONFIGURE_MODEL' });
      });

      document.getElementById('btn-vibe')?.addEventListener('click', () => {
        const order = ['genz_hype', 'chaos_gremlin', 'chill_mentor'];
        const next = order[(order.indexOf(STATE.vibeMode) + 1) % order.length];
        vscode.postMessage({ type: 'SWITCH_VIBE', vibeMode: next });
      });

      document.getElementById('btn-sponsors')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'GITHUB_SPONSORS' });
      });

      document.getElementById('btn-coffee')?.addEventListener('click', () => {
        vscode.postMessage({ type: 'BUY_ME_A_COFFEE' });
      });

      // Live background card arrival: buffers silently in memory (or auto-mounts if user was waiting!)
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'APPEND_CARD' && msg.card) {
          const exists = STATE.deck.some((d) => d.card.id === msg.card.id);
          if (!exists) {
            STATE.deck.push({
              card: msg.card,
              renderedMermaidSvg: msg.renderedMermaidSvg || null,
              flexMarkdown: msg.flexMarkdown || '',
              mascotLabel: msg.mascotLabel || '',
            });
          }
          STATE.isCooking = Boolean(msg.isCooking);
          STATE.allSeen = false;

          if (waitingForNextCard) {
            mountSingleCardOnStage(STATE.deck.length - 1, 'next');
          } else {
            syncChromeControls();
          }
        } else if (msg.type === 'COOKING_STATUS') {
          STATE.isCooking = Boolean(msg.isCooking);
          if (msg.allSeen !== undefined) {
            STATE.allSeen = Boolean(msg.allSeen);
          }
          if (waitingForNextCard && STATE.allSeen) {
            const stage = document.getElementById('single-card-stage');
            if (stage) stage.replaceChildren(buildWaitingStageDom());
          }
          syncChromeControls();
        }
      });
    })();
  </script>
</body>
</html>`;
}
