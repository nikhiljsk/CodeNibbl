# 🤖 `AGENTS.md` — Downstream AI Agent Master Playbook for CodeNibbl 🐹🌶️

Welcome, AI Coding Agent! This repository is a security-hardened, well-architected scaffold for **CodeNibbl**—a trendy, GenZ-styled, 100% Free & Open-Source VS Code extension that turns AI coding wait-times into an addictive feed of spicy codebase micro-insights ("Nibbls").

Read this playbook completely before modifying any code.

---

## 1. Non-Negotiable Security Invariants (100% Mandatory)

The `src/security/` layer is **already 100% implemented and unit-tested**. You **MUST NEVER** weaken, bypass, or remove any of these 6 security boundaries:

1. **Zero Plaintext API Keys (`src/config/secretManager.ts`)**
   - API keys for OpenAI, Anthropic, Google Gemini, xAI (Grok), or custom providers **MUST ONLY** be read/written via `vscode.SecretStorage` (`context.secrets`).
   - **NEVER** store or log API keys in `settings.json`, `.vscode/`, or console output. Always pass thrown errors through `redactSecretsFromError(err, apiKey)`.
2. **Pre-LLM Secret & File DLP (`src/security/secretScrubber.ts`)**
   - Every file path MUST be checked with `isSensitiveFilePath(filePath)` before reading. Never read `.env*`, `*.pem`, `*.key`, `id_rsa*`, `*credentials*`, or `*secret*`.
   - Every code snippet and git commit string MUST be passed through `scrubSecretsFromText()` before entering `CandidateSymbol` or an LLM prompt.
3. **Indirect Prompt Injection Boundary (`src/security/csp.ts`)**
   - Repository source code and commit messages are untrusted input (a cloned repo could contain `// IGNORE ALL PREVIOUS INSTRUCTIONS`).
   - Always wrap code snippets using `wrapUntrustedCodeBlock(code)` inside `src/engine/promptBuilder.ts`.
4. **Strict Webview CSP & XSS Prevention (`src/security/csp.ts` & `src/webview/webviewHtml.ts`)**
   - Every Webview HTML render MUST generate a fresh 256-bit cryptographic nonce via `generateCspNonce()` and inject `buildStrictCspHeader(cspSource, nonce)`.
   - Notice `connect-src 'none'` in the Webview CSP: the Webview is forbidden from making network calls. All LLM network calls happen in the Extension Host.
   - Always escape untrusted/LLM text with `escapeHtml()` before placing it into HTML templates, and sanitize Mermaid DSL with `sanitizeMermaidDiagram()`.
5. **Path Traversal & External URL Guard (`src/security/pathValidator.ts`)**
   - Every incoming Webview message MUST be validated via `validateWebviewMessage(raw)`.
   - Every "Jump to Code" action MUST resolve paths via `resolveSafeWorkspaceFilePath(workspaceRoot, filePath)` to block `../` traversal, absolute path escapes, and UNC paths.
   - Every external Sponsor link MUST pass `isSafeSponsorUrl(url)` (`https://` on `buymeacoffee.com`, `github.com`, or `ko-fi.com` only).
6. **SSRF & HTTPS Endpoint Guard (`src/security/endpointValidator.ts` & `src/harvester/gitHelper.ts`)**
   - Always validate LLM URLs via `resolveAndValidateEndpoint(provider, customBaseUrl)`.
   - Always run `git` CLI commands via `execFile('git', [...args])`—**NEVER** `exec()` with shell string interpolation.

---

## 2. Architecture & File Map

```text
src/
├── types.ts                      # Core contracts (NibblCard, CandidateSymbol, NibblArchetype, VibeMode)
├── extension.ts                  # Extension entry point, commands, status bar, & lifecycle
├── security/                     # 🛡️ 100% IMPLEMENTED SECURITY CORE (DO NOT WEAKEN)
│   ├── secretScrubber.ts         # Pre-LLM DLP secret redactor & sensitive file blocker
│   ├── pathValidator.ts          # Path traversal blocker, message validator & URL allowlist
│   ├── csp.ts                    # 256-bit Nonce CSP, HTML escaper & Prompt Injection wrapper
│   └── endpointValidator.ts      # HTTPS & SSRF guard for LLM endpoints
├── config/
│   └── secretManager.ts          # OS Keychain SecretStorage & interactive QuickPick setup
├── harvester/
│   ├── spiceHarvester.ts         # 12-Signal Scoville Spice Scanner + LSP symbol harvester
│   └── gitHelper.ts              # Safe execFile git commit & fresh-diff helper
├── engine/
│   ├── seenLedger.ts             # 6-Layer Anti-Repetition Engine & SHA-256 history
│   ├── promptBuilder.ts          # Funky GenZ System Prompt + Vibe Dial + Hook Rotator
│   ├── mermaidSanitizer.ts       # Auto-quotes Mermaid node labels & strips unsafe directives
│   └── nibblGenerator.ts         # Async background queue & starter demo cards
├── llm/
│   └── universalRouter.ts        # Zero-SDK native fetch router (OpenAI, Anthropic, Gemini, xAI, vscode.lm)
└── webview/
    ├── mascotAssets.ts           # 7-mood reactive Mascot SVG module (drop-in ready)
    ├── webviewHtml.ts            # Neo-brutalist GenZ Webview UI (Text, Code, Mermaid, Quiz, Links)
    └── nibblSidebarProvider.ts   # WebviewViewProvider controller & safe file teleport
```

---

## 3. Step-by-Step Implementation Tasks for the Downstream Agent

Follow these tasks in exact order. Run `npm test` and `npm run typecheck` after every step!

### Task 1: Complete `harvestWorkspaceSymbols()` in `src/harvester/spiceHarvester.ts`
- Use `vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,py,go,rs,java,cs}', '**/{node_modules,dist,out,build,.git,.vscode}/**', 60)` to locate source files.
- Filter every file with `isSensitiveFilePath(uri.fsPath)` before opening.
- Execute `vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', uri)` to extract functions, methods, and classes with exact 1-based `startLine` and `endLine`.
- If LSP symbols are not yet warm for a file, fall back to a lightweight function/class regex chunker (6–60 lines per chunk).
- Enrich top candidates with `getLatestCommitForFile()` from `src/harvester/gitHelper.ts`.
- Pass each candidate through `createSafeCandidateSymbol()` and sort descending by `scovilleScore`.

### Task 2: Wire Async Background Queue & Agent Wait-Time Watcher in `src/extension.ts`
- Add a non-blocking background loop (`topUpQueueAsync()`) that calls `harvestWorkspaceSymbols()` and `generator.cookNextCardAsync(candidates, vibeMode)` until `generator.getQueueDepth() >= preCookedQueueSize` (default `5`).
- Listen to AI Agent / Terminal activity:
  - `vscode.window.onDidStartTerminalShellExecution`: start an `autoOpenDelaySeconds` timer (default `8s`). If the command is still running after 8 seconds and `codenibbl.autoPopupOnAgentWait` is `true`, reveal `codenibbl.feedView` so the user snacks on codebase lore instead of doomscrolling!
  - `vscode.workspace.onDidSaveTextDocument`: mark saved files as `isFreshDiff: true` (`+50 Scoville`) so `AI_VIBE_AUDIT` cards get cooked asynchronously.

### Task 3: Enhance the GenZ Webview Feed (`src/webview/webviewHtml.ts` & `src/webview/nibblSidebarProvider.ts`)
- Add client-side visual polish inside `webviewHtml.ts` (within the nonce-protected `<script>` and `<style>` tags):
  - **Lightweight Canvas Confetti Burst** when the user solves a `🕵️ PLOT_TWIST_QUIZ` or clicks a `"🔥 You Cooked"` reaction button.
  - **`📸 Flex Card` Button**: Formats the current card as shareable Markdown (Headline + Scoville Badge + Code Snippet + TL;DR) and sends `{ type: 'FLEX_CARD_COPY', markdown }` to copy to clipboard via `vscode.env.clipboard.writeText()`.
  - **Interactive Mermaid SVG Renderer** (or clean collapsible diagram view with dark/light theme adaptation).
  - **Custom Mascot Loader**: Check if custom files exist in `media/mascot/<mood>.svg`; if present, render them via `webview.asWebviewUri()`, falling back to `MASCOT_SVG_BY_MOOD`.

### Task 4: Add Connection Ping to `src/config/secretManager.ts`
- After the user enters their API key in `runInteractiveSetup()`, optionally invoke a fast test completion via `UniversalLLMRouter` and show a toast confirming the model connection.

---

## 4. Essential Commands (Build, Test, Package)

```bash
# 1. Install dependencies
npm install

# 2. Run strict TypeScript typecheck
npm run typecheck

# 3. Run unit & security guardrail tests (Vitest)
npm test

# 4. Bundle extension into dist/extension.js (<300ms via esbuild)
npm run compile

# 5. Package into a distributable .vsix file
npm run package
```
