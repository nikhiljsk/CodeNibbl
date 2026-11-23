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
