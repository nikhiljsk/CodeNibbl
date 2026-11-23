# 🤖 `AGENTS.md` — Contributor & AI Coding Guidelines for CodeNibbl 🐹🌶️

This document outlines the architecture, non-negotiable security invariants, and development workflow for contributors and AI coding assistants working on **CodeNibbl**.

---

## 1. Non-Negotiable Security Invariants (100% Mandatory)

All contributions MUST preserve these 6 security boundaries in `src/security/`:

1. **Zero Plaintext API Keys (`src/config/secretManager.ts`)**
   - API keys for OpenAI, Anthropic, Google Gemini, xAI (Grok), or custom providers MUST ONLY be stored in `vscode.SecretStorage` (`context.secrets`).
   - NEVER store or log API keys in `settings.json`, `.vscode/`, or console output. Always pass thrown errors through `redactSecretsFromError(err, apiKey)`.
2. **Pre-LLM Secret & File DLP (`src/security/secretScrubber.ts`)**
   - Every file path MUST be checked with `isSensitiveFilePath(filePath)` before reading (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `*credentials*`, `*secret*`).
   - Every code snippet and git commit string MUST pass through `scrubSecretsFromText()` before entering `CandidateSymbol` or an LLM prompt.
3. **Indirect Prompt Injection Boundary (`src/security/csp.ts`)**
   - Wrap untrusted repository code and commit messages with `wrapUntrustedCodeBlock(code)` inside `src/engine/promptBuilder.ts`.
4. **Strict Webview CSP & XSS Prevention (`src/security/csp.ts` & `src/webview/webviewHtml.ts`)**
   - Generate a fresh 256-bit cryptographic nonce via `generateCspNonce()` and inject `buildStrictCspHeader(cspSource, nonce)` on every render (`connect-src 'none'`).
   - Escape all untrusted/LLM text with `escapeHtml()`, serialize script JSON with `safeJsonForScript()`, and sanitize Mermaid DSL with `sanitizeMermaidDiagram()`.
5. **Path Traversal & External URL Guard (`src/security/pathValidator.ts`)**
   - Validate all incoming Webview messages via `validateWebviewMessage(raw)`.
   - Resolve "Jump to Code" paths via `resolveSafeWorkspaceFilePath(workspaceRoot, filePath)` to block `../` traversal, absolute path escapes, and UNC paths.
   - Validate external Sponsor links via `isSafeSponsorUrl(url)` (`https://` on `buymeacoffee.com`, `github.com`, or `ko-fi.com` only).
6. **SSRF & HTTPS Endpoint Guard (`src/security/endpointValidator.ts` & `src/harvester/gitHelper.ts`)**
   - Always validate LLM URLs via `resolveAndValidateEndpoint(provider, customBaseUrl)`.
   - Always run `git` CLI commands via `execFile('git', [...args])`—NEVER `exec()` with shell string interpolation.

---

## 2. Architecture & File Map

```text
src/
├── types.ts                      # Core contracts (NibblCard, CandidateSymbol, NibblArchetype, VibeMode)
├── extension.ts                  # Extension entry point, background queue, agent watcher, & commands
├── security/                     # 🛡️ Security Core
│   ├── secretScrubber.ts         # Pre-LLM DLP secret redactor & sensitive file blocker
│   ├── pathValidator.ts          # Path traversal blocker, message validator & URL allowlist
│   ├── csp.ts                    # 256-bit Nonce CSP, HTML escaper & Prompt Injection wrapper
│   └── endpointValidator.ts      # HTTPS & SSRF guard for LLM endpoints
├── config/
│   └── secretManager.ts          # OS Keychain SecretStorage, QuickPick setup & connection ping
├── harvester/
│   ├── spiceHarvester.ts         # 12-Signal Scoville Spice Scanner + LSP/regex symbol harvester
│   └── gitHelper.ts              # Safe execFile git commit & fresh-diff helper
├── engine/
│   ├── seenLedger.ts             # 6-Layer Anti-Repetition Engine & SHA-256 history
│   ├── promptBuilder.ts          # GenZ System Prompt + Vibe Dial + Hook Rotator
│   ├── mermaidSanitizer.ts       # Auto-quotes Mermaid node labels & strips unsafe directives
│   └── nibblGenerator.ts         # Async background queue & rotating starter demo cards
├── llm/
│   └── universalRouter.ts        # Zero-SDK native fetch router (OpenAI, Anthropic, Gemini, xAI, vscode.lm)
└── webview/
    ├── mascotAssets.ts           # 7-mood reactive Mascot SVG module (drop-in ready)
    ├── mermaidRenderer.ts        # Zero-dependency CSP-safe inline SVG Mermaid renderer
    ├── webviewHtml.ts            # Neo-brutalist GenZ Webview UI (Text, Code, SVG Flow, Quiz, Confetti)
    └── nibblSidebarProvider.ts   # WebviewViewProvider controller & safe file teleport
```

---

## 3. Essential Commands

```bash
npm install        # Install dependencies
npm run typecheck  # Strict TypeScript typecheck
npm test           # Run Vitest unit & security guardrail tests
npm run compile    # Bundle extension into dist/extension.js via esbuild
npm run package    # Package into a distributable .vsix file
```
