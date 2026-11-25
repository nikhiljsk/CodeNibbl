/**
 * ============================================================================
 * CodeNibbl — Secure GenZ Webview HTML Builder (`src/webview/webviewHtml.ts`)
 * ============================================================================
 * SECURITY INVARIANTS:
 * 1. Uses a fresh 256-bit cryptographic `nonce` via `generateCspNonce()`.
 * 2. Applies `buildStrictCspHeader()` (`default-src 'none'; connect-src 'none'`).
 * 3. NEVER uses `innerHTML` with unescaped LLM strings; all text is sanitized
 *    via `escapeHtml()` or rendered via `textContent`.
 * 4. Safely encodes embedded JSON via `safeJsonForScript()` to prevent
 *    `</script>` breakout or JS syntax errors.
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
    parts.push('', '**🛠️ Quick Fix Idea:**', '```' + (card.codeSnippet?.language || 'ts'), card.suggestedFix, '```');
  }

  parts.push('', '*Snacked via [CodeNibbl](https://github.com/nikhiljsk/CodeNibbl) 🌶️*');
  return parts.join('\n');
}

export type WebviewEmptyState = 'no_workspace' | 'cooking' | 'needs_model';

export function buildWebviewHtml(params: {
  cspSource: string;
  initialCard: NibblCard | null;
  emptyState?: WebviewEmptyState;
  vibeMode: VibeMode;
  providerLabel: string;
  stats: { nibblsMunched: number; quizzesSolved: number };
  customMascotUri?: string;
}): string {
  const nonce = generateCspNonce();
  const cspHeader = buildStrictCspHeader(params.cspSource, nonce);
  const card = params.initialCard;
  const emptyState: WebviewEmptyState = params.emptyState ?? 'no_workspace';

  const activeMood = card
    ? card.mascotMood
    : emptyState === 'cooking'
      ? 'cooking'
      : emptyState === 'needs_model'
        ? 'hyped'
        : 'chill';

  const mascotSvg = params.customMascotUri
    ? `<img src="${escapeHtml(params.customMascotUri)}" width="44" height="44" alt="Nibbl Mascot" class="custom-mascot-img" />`
    : MASCOT_SVG_BY_MOOD[activeMood] ?? MASCOT_SVG_BY_MOOD.chill;

  const mascotLabel = card
    ? MASCOT_LABELS_BY_MOOD[card.mascotMood] ?? ''
    : emptyState === 'no_workspace'
      ? '📂 Open a project folder to begin'
      : emptyState === 'cooking'
        ? '🍳 Scanning & cooking from your repo...'
        : '🔑 Connect a model to cook Nibbls';

  const flexMarkdown = card ? formatFlexCardMarkdown(card) : '';

  const codeRowsHtml = card?.codeSnippet
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

  const linksHtml = card
    ? card.codeLinks
        .map(
          (link) =>
            `<button type="button" class="code-link-pill" data-file="${escapeHtml(link.filePath)}" data-line="${link.line}" data-end="${link.endLine ?? link.line}">
              📍 ${escapeHtml(link.label)}
            </button>`
        )
        .join('')
    : '';

  const quizHtml = card?.interactiveQuiz
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

  const renderedSvg = card?.mermaidDiagram ? renderMermaidToSvg(card.mermaidDiagram) : null;
  const mermaidHtml = card?.mermaidDiagram
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

  const suggestedFixHtml = card?.suggestedFix
    ? `<details class="mermaid-details">
        <summary class="mermaid-summary">🛠️ Quick Fix Idea</summary>
        <div class="mermaid-box">
          <div class="mermaid-raw">${escapeHtml(card.suggestedFix)}</div>
        </div>
      </details>`
    : '';

  const emptyCardHtml =
    emptyState === 'no_workspace'
      ? `<div class="card empty-card">
          <h2 class="headline">📂 No Project Open Yet</h2>
          <p class="layman-body">Open a project folder or repository in VS Code, and CodeNibbl will generate bite-sized insights, quizzes, and flow diagrams directly from your actual code.</p>
          <button type="button" id="btn-open-folder" class="action-btn primary">📂 Open Folder</button>
        </div>`
      : emptyState === 'cooking'
        ? `<div class="card empty-card">
            <h2 class="headline">🍳 Cooking Fresh Nibbls...</h2>
            <p class="layman-body">Scanning your open repository and brewing insights from your actual code. This only takes a few seconds!</p>
            <button type="button" id="btn-spin-empty" class="action-btn primary">🎲 Check Ready Cards</button>
          </div>`
        : `<div class="card empty-card">
            <h2 class="headline">🔑 Connect a Model to Start</h2>
            <p class="layman-body">Your project is ready! Connect OpenAI, Anthropic, Gemini, Grok, Ollama, or use VS Code's built-in model to generate Nibbls from this codebase.</p>
            <button type="button" id="btn-model-empty" class="action-btn primary">🔑 Connect Model & API Key</button>
          </div>`;

  const mainCardHtml = card
    ? `<div class="card">
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
          <button type="button" id="btn-cooked" class="action-btn cooked-btn">🔥 You Cooked</button>
          <button type="button" id="btn-flex" class="action-btn flex-btn">📸 Flex Card</button>
        </div>
      </div>`
    : emptyCardHtml;

  const clientData = {
    cardId: card?.id ?? '',
    vibeMode: params.vibeMode,
    flexMarkdown,
    quizAha: card?.interactiveQuiz?.ahaExplanation ?? '',
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
      --bg-card: rgba(255, 255, 255, 0.04);
      --border-neon: #ff9f1c;
      --accent-pink: #ff4d6d;
      --accent-mint: #00f5d4;
      --accent-yellow: #fee440;
      --accent-purple: #9b5de5;
    }
    body {
      font-family: var(--vscode-font-family, system-ui, sans-serif);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      margin: 0;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-x: hidden;
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
      gap: 8px;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--bg-card);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .mascot-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mascot-avatar {
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
      font-size: 11px;
    }
    .mascot-title {
      font-weight: 800;
      font-size: 12px;
      letter-spacing: 0.3px;
    }
    .card {
      border-radius: 16px;
      padding: 14px;
      background: var(--bg-card);
      border: 2px solid var(--border-neon);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      gap: 12px;
      position: relative;
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
      color: #fff;
      font-weight: 800;
      font-size: 10px;
      padding: 4px 8px;
      border-radius: 999px;
      letter-spacing: 0.5px;
    }
    .scoville-pill {
      background: rgba(254, 228, 64, 0.15);
      color: var(--accent-yellow);
      border: 1px solid var(--accent-yellow);
      font-weight: 700;
      font-size: 10px;
      padding: 3px 8px;
      border-radius: 999px;
    }
    .headline {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.35;
      margin: 0;
    }
    .layman-body {
      font-size: 13px;
      line-height: 1.55;
      opacity: 0.92;
      margin: 0;
    }
    .tldr-box {
      padding: 9px 11px;
      border-radius: 10px;
      background: rgba(0, 245, 212, 0.1);
      border-left: 3px solid var(--accent-mint);
      font-size: 12px;
      font-weight: 600;
    }
    .code-box {
      background: var(--vscode-editor-background);
      border-radius: 10px;
      padding: 8px 0;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11.5px;
      overflow-x: auto;
      border: 1px solid rgba(255,255,255,0.08);
    }
    .code-line {
      display: flex;
      padding: 1px 10px;
      white-space: pre;
    }
    .code-line.hero-line {
      background: rgba(255, 159, 28, 0.2);
      border-left: 3px solid var(--border-neon);
    }
    .line-num {
      width: 30px;
      opacity: 0.45;
      user-select: none;
      flex-shrink: 0;
    }
    .mermaid-details {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      padding: 8px 10px;
    }
    .mermaid-summary {
      cursor: pointer;
      font-size: 11.5px;
      font-weight: 700;
      user-select: none;
      color: var(--accent-mint);
    }
    .mermaid-box {
      margin-top: 8px;
      padding: 8px;
      border-radius: 8px;
      background: var(--vscode-editor-background);
      border: 1px dashed rgba(255,255,255,0.16);
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
      background: rgba(155, 93, 229, 0.12);
      border: 1px solid rgba(155, 93, 229, 0.4);
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
      background: rgba(0, 245, 212, 0.22);
      border-color: var(--accent-mint);
      color: var(--vscode-foreground);
    }
    .quiz-opt.is-wrong {
      background: rgba(255, 77, 109, 0.22);
      border-color: var(--accent-pink);
      color: var(--vscode-foreground);
    }
    .quiz-feedback {
      font-size: 12px;
      font-weight: 700;
      color: var(--accent-mint);
      padding: 4px 6px;
    }
    .quiz-feedback.wrong-msg {
      color: var(--accent-pink);
    }
    .card-actions-bar {
      display: flex;
      gap: 8px;
    }
    .quiz-opt, .code-link-pill, .action-btn {
      cursor: pointer;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.16);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 7px 10px;
      font-size: 11.5px;
      font-weight: 600;
      text-align: left;
      transition: transform 0.1s ease, background 0.15s ease;
    }
    .quiz-opt:hover, .code-link-pill:hover, .action-btn:hover {
      transform: translateY(-1px);
    }
    .action-btn.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      text-align: center;
      font-weight: 800;
    }
    .action-btn.flex-btn {
      flex: 1;
      text-align: center;
      background: rgba(155, 93, 229, 0.2);
      border: 1px solid var(--accent-purple);
      color: #fff;
    }
    .action-btn.cooked-btn {
      flex: 1;
      text-align: center;
      background: rgba(255, 159, 28, 0.2);
      border: 1px solid var(--border-neon);
      color: var(--accent-yellow);
    }
    .links-wrap {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .footer-bar {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .sponsor-btn {
      text-align: center;
      background: rgba(255, 77, 109, 0.14);
      color: var(--accent-pink);
      border: 1px solid rgba(255, 77, 109, 0.45);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .coffee-btn {
      text-align: center;
      background: rgba(254, 228, 64, 0.14);
      color: var(--accent-yellow);
      border: 1px solid rgba(254, 228, 64, 0.4);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <canvas id="confetti-canvas"></canvas>

  <div class="topbar">
    <div class="mascot-row">
      <div id="mascot-avatar" class="mascot-avatar">${mascotSvg}</div>
      <div class="mascot-meta">
        <span class="mascot-title">CodeNibbl 🌶️ (${escapeHtml(params.providerLabel)})</span>
        <span>${escapeHtml(mascotLabel)}</span>
      </div>
    </div>
    <button type="button" id="btn-model" class="action-btn" title="Connect Model & API Key">🔑 Model</button>
  </div>

  ${mainCardHtml}

  <div class="footer-bar">
    ${
      card
        ? `<button type="button" id="btn-spin" class="action-btn primary">🎲 Spin Fresh Nibbl</button>
           <button type="button" id="btn-vibe" class="action-btn">🎛️ Vibe: ${escapeHtml(params.vibeMode)}</button>`
        : ''
    }
    <button type="button" id="btn-sponsors" class="action-btn sponsor-btn" title="Sponsor CodeNibbl on GitHub (0% fee)">💖 GitHub Sponsors</button>
    <button type="button" id="btn-coffee" class="action-btn coffee-btn" title="Buy Nibbl a Coffee">☕ Buy Me a Coffee</button>
  </div>

  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const CARD_DATA = ${safeJsonForScript(clientData)};

      // Canvas Confetti Burst Engine
      function fireConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#ff4d6d', '#00f5d4', '#fee440', '#9b5de5', '#ff9f1c', '#ffffff'];
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

      const btnCooked = document.getElementById('btn-cooked');
      if (btnCooked) {
        btnCooked.addEventListener('click', () => {
          fireConfetti();
          btnCooked.textContent = '🔥 Certified Chef! 🤌';
          const avatar = document.getElementById('mascot-avatar');
          if (avatar) {
            avatar.classList.add('bounce');
            setTimeout(() => avatar.classList.remove('bounce'), 600);
          }
        });
      }

      const btnFlex = document.getElementById('btn-flex');
      if (btnFlex) {
        btnFlex.addEventListener('click', () => {
          vscode.postMessage({ type: 'FLEX_CARD_COPY', markdown: CARD_DATA.flexMarkdown });
          btnFlex.textContent = '✅ Copied to Clipboard!';
          setTimeout(() => {
            btnFlex.textContent = '📸 Flex Card';
          }, 2000);
        });
      }

      const btnOpenFolder = document.getElementById('btn-open-folder');
      if (btnOpenFolder) {
        btnOpenFolder.addEventListener('click', () => {
          vscode.postMessage({ type: 'OPEN_FOLDER' });
        });
      }

      const btnSpinEmpty = document.getElementById('btn-spin-empty');
      if (btnSpinEmpty) {
        btnSpinEmpty.addEventListener('click', () => {
          vscode.postMessage({ type: 'SPIN_NEXT_NIBBL' });
        });
      }

      const btnModelEmpty = document.getElementById('btn-model-empty');
      if (btnModelEmpty) {
        btnModelEmpty.addEventListener('click', () => {
          vscode.postMessage({ type: 'CONFIGURE_MODEL' });
        });
      }

      const btnSpin = document.getElementById('btn-spin');
      if (btnSpin) {
        btnSpin.addEventListener('click', () => {
          vscode.postMessage({ type: 'SPIN_NEXT_NIBBL' });
        });
      }

      const btnModel = document.getElementById('btn-model');
      if (btnModel) {
        btnModel.addEventListener('click', () => {
          vscode.postMessage({ type: 'CONFIGURE_MODEL' });
        });
      }

      const btnVibe = document.getElementById('btn-vibe');
      if (btnVibe) {
        btnVibe.addEventListener('click', () => {
          const order = ['genz_hype', 'chaos_gremlin', 'chill_mentor'];
          const next = order[(order.indexOf(CARD_DATA.vibeMode) + 1) % order.length];
          vscode.postMessage({ type: 'SWITCH_VIBE', vibeMode: next });
        });
      }

      const btnSponsors = document.getElementById('btn-sponsors');
      if (btnSponsors) {
        btnSponsors.addEventListener('click', () => {
          vscode.postMessage({ type: 'GITHUB_SPONSORS' });
        });
      }

      const btnCoffee = document.getElementById('btn-coffee');
      if (btnCoffee) {
        btnCoffee.addEventListener('click', () => {
          vscode.postMessage({ type: 'BUY_ME_A_COFFEE' });
        });
      }

      document.querySelectorAll('.code-link-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          const filePath = btn.getAttribute('data-file') || '';
          const line = Number(btn.getAttribute('data-line') || '1');
          const endLine = Number(btn.getAttribute('data-end') || String(line));
          vscode.postMessage({ type: 'JUMP_TO_CODE', filePath, line, endLine });
        });
      });

      document.querySelectorAll('.quiz-opt').forEach((btn) => {
        btn.addEventListener('click', () => {
          const isCorrect = btn.getAttribute('data-correct') === '1';
          const fb = document.getElementById('quiz-feedback');
          if (isCorrect) {
            btn.classList.add('is-correct');
            if (fb) {
              fb.classList.remove('wrong-msg');
              fb.textContent = '🎉 ' + CARD_DATA.quizAha;
              fb.hidden = false;
            }
            fireConfetti();
            vscode.postMessage({ type: 'QUIZ_SOLVED', cardId: CARD_DATA.cardId });
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
    })();
  </script>
</body>
</html>`;
}
