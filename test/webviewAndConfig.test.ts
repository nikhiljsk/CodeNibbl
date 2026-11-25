import { describe, expect, it, vi } from 'vitest';
import { buildWebviewHtml } from '../src/webview/webviewHtml';
import { renderMermaidToSvg } from '../src/webview/mermaidRenderer';
import { SecretManager } from '../src/config/secretManager';
import { NibblCard } from '../src/types';
import { getRecentlyModifiedFiles } from '../src/harvester/gitHelper';

describe('Webview HTML Builder & Mascot Assets', () => {
  const sampleCard: NibblCard = {
    id: 'test-card-1',
    archetype: 'GLAZE_THE_DEV',
    mascotMood: 'chef_kiss',
    scovilleScore: 85,
    scovilleTier: '🔥 Habanero',
    badgeText: '👑 CERTIFIED GENIUS',
    headline: 'You handled the edge case!',
    laymanBody: 'This function prevents null pointer exceptions.',
    whyItMatters: '💡 Keeps prod running smoothly.',
    codeSnippet: {
      filePath: 'src/util.ts',
      startLine: 10,
      endLine: 20,
      language: 'typescript',
      code: 'function test() {\n  return 42;\n}',
      highlightLines: [11],
    },
    codeLinks: [
      {
        label: 'test() • src/util.ts:10',
        filePath: 'src/util.ts',
        line: 10,
      },
    ],
    createdAt: Date.now(),
  };

  it('injects CSP nonces, confetti canvas, and reaction buttons', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      initialCard: sampleCard,
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 5, quizzesSolved: 2 },
    });

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-');
    expect(html).toContain('<canvas id="confetti-canvas">');
    expect(html).toContain('id="btn-cooked"');
    expect(html).toContain('id="btn-flex"');
    expect(html).toContain('id="btn-sponsors"');
    expect(html).toContain('id="btn-coffee"');
    expect(html.indexOf('id="btn-sponsors"')).toBeLessThan(html.indexOf('id="btn-coffee"'));
    expect(html).toContain('👑 CERTIFIED GENIUS');
    expect(html).toContain('You handled the edge case!');
  });

  it('renders custom mascot <img> when customMascotUri is provided', () => {
    const htmlWithCustomMascot = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      initialCard: sampleCard,
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 5, quizzesSolved: 2 },
      customMascotUri: 'vscode-webview://test/media/mascot/chef_kiss.svg',
    });

    expect(htmlWithCustomMascot).toContain('<img src="vscode-webview://test/media/mascot/chef_kiss.svg"');
  });

  it('produces 100% syntactically valid JavaScript in <script> even with backticks and </script> in card text', () => {
    const nastyCard: NibblCard = {
      ...sampleCard,
      headline: 'Check `backticks` and </script><script>alert(1)</script>',
      laymanBody: 'Uses `scrubSecrets()` and "quotes" + \'single quotes\'',
      codeSnippet: {
        ...sampleCard.codeSnippet!,
        code: 'const s = `hello ${name}`;\nreturn "</script>";',
      },
      interactiveQuiz: {
        question: 'Does `this` work?',
        options: ['Yes `100%`', 'No'],
        correctIndex: 0,
        ahaExplanation: 'Safely escaped `</script>`!',
      },
    };

    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      initialCard: nastyCard,
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 1, quizzesSolved: 0 },
    });

    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const scriptBody = match![1];

    // Must not contain raw </script> inside the script body
    expect(scriptBody).not.toContain('</script>');

    // Must parse cleanly as valid JavaScript (throws SyntaxError if broken)
    expect(() => new Function(scriptBody)).not.toThrow();
  });

  it('renders clean No Project Open empty state when no workspace is open', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      initialCard: null,
      emptyState: 'no_workspace',
      vibeMode: 'genz_hype',
      providerLabel: 'vscode-lm',
      stats: { nibblsMunched: 0, quizzesSolved: 0 },
    });

    expect(html).toContain('No Project Open Yet');
    expect(html).toContain('id="btn-open-folder"');
    expect(html).not.toContain('scrubSecretsFromText');

    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match![1])).not.toThrow();
  });

  it('escapes and renders suggestedFix on MISSED_EDGE_CASE cards', () => {
    const cardWithFix: NibblCard = {
      ...sampleCard,
      archetype: 'MISSED_EDGE_CASE',
      badgeText: '🚨 BLIND SPOT SPOTTED',
      suggestedFix: 'if (!items?.length) return []; <script>alert(1)</script>',
    };

    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      initialCard: cardWithFix,
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 1, quizzesSolved: 0 },
    });

    expect(html).toContain('🛠️ Quick Fix Idea');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('alert(1)</script>');
  });

  it('renders shimmer Cooking loader instead of Connect Model screen while cooking', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      cards: [],
      isCooking: true,
      emptyState: 'cooking',
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 0, quizzesSolved: 0 },
    });

    expect(html).toContain('spinner-ring');
    expect(html).toContain('shimmer-line');
    expect(html).not.toContain('Connect a Model to Start');
  });

  it('renders strictly ONE card on stage while keeping pre-cooked cards ready in memory, with Light Mode rules and valid JS', () => {
    const secondCard: NibblCard = {
      ...sampleCard,
      id: 'test-card-2',
      headline: 'Second pre-cooked card buffered in memory!',
    };

    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://test',
      cards: [sampleCard, secondCard],
      isCooking: true,
      vibeMode: 'genz_hype',
      providerLabel: 'openai',
      stats: { nibblsMunched: 2, quizzesSolved: 1 },
    });

    // Strictly ONE `<h2 class="headline">` mounted in the DOM (not a multi-card blog!)
    const renderedHeadlines = html.match(/<h2 class="headline">/g) ?? [];
    expect(renderedHeadlines).toHaveLength(1);
    expect(html).toContain('body.vscode-light');
    expect(html).toContain('1 / 2 Ready');
    expect(html).toContain('Next Nibbl (1 ready)');
    // Second card is buffered in STATE.deck JSON for 0ms instant transition
    expect(html).toContain('Second pre-cooked card buffered in memory!');
    // Scrolling stays inside the active card (no wheel-to-next-card listener)
    expect(html).not.toContain("addEventListener(\n          'wheel'");
    expect(html).not.toContain('lastWheelStepAt');

    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(() => new Function(match![1])).not.toThrow();
  });
});

describe('SecretManager & Keychain Storage', () => {
  it('stores, retrieves, and deletes API keys in SecretStorage', async () => {
    const memorySecrets = new Map<string, string>();
    const mockSecretStorage: any = {
      get: vi.fn(async (key: string) => memorySecrets.get(key)),
      store: vi.fn(async (key: string, value: string) => {
        memorySecrets.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        memorySecrets.delete(key);
      }),
    };

    const secretManager = new SecretManager(mockSecretStorage);

    await secretManager.storeApiKey('openai', 'sk-test-12345');
    const key = await secretManager.getApiKey('openai');
    expect(key).toBe('sk-test-12345');

    await secretManager.deleteApiKey('openai');
    const deletedKey = await secretManager.getApiKey('openai');
    expect(deletedKey).toBeUndefined();
  });
});

describe('GitHelper', () => {
  it('getRecentlyModifiedFiles executes safely and returns string array', async () => {
    const files = await getRecentlyModifiedFiles(process.cwd());
    expect(Array.isArray(files)).toBe(true);
  });
});

describe('Mermaid SVG Renderer', () => {
  it('renders flowchart TD diagrams into inline SVG with nodes and arrows', () => {
    const dsl = [
      'flowchart TD',
      '  A["Raw Repo Code"] --> B["12-Signal Scoville Scanner"]',
      '  B --> C["Secret Scrubber DLP"]',
    ].join('\n');

    const svg = renderMermaidToSvg(dsl);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg class="nibbl-mermaid-svg"');
    expect(svg).toContain('Raw Repo Code');
    expect(svg).toContain('12-Signal Scoville Scanner');
    expect(svg).toContain('marker-end="url(#nibbl-arrow)"');
  });

  it('renders sequenceDiagram into inline SVG with participants and messages', () => {
    const dsl = [
      'sequenceDiagram',
      '  Client->>API: POST /charge',
      '  API-->>Client: 200 OK',
    ].join('\n');

    const svg = renderMermaidToSvg(dsl);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg class="nibbl-mermaid-svg"');
    expect(svg).toContain('Client');
    expect(svg).toContain('POST /charge');
  });

  it('blocks malicious Mermaid directives and escapes HTML in node labels', () => {
    expect(renderMermaidToSvg('flowchart TD\n  A["ok"]\n  click A call alert(1)')).toBeNull();
    const xssSvg = renderMermaidToSvg('flowchart TD\n  A["<b>Hi</b>"] --> B["Next"]');
    expect(xssSvg).not.toBeNull();
    expect(xssSvg).not.toContain('<b>Hi</b>');
    expect(xssSvg).toContain('&lt;b&gt;Hi&lt;/b&gt;');
  });
});
