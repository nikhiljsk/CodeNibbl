# CodeNibbl 🐹🌶️⚡
> **Snack on your codebase while your AI cooks.**
> *100% Free & Open-Source VS Code Extension • Connect Any LLM • Zero Doomscrolling*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-%F0%9F%92%96%20Sponsor-EA4AAA)](https://github.com/sponsors/nikhiljsk)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-%E2%98%95%20Sponsor-FFDD00)](https://buymeacoffee.com/nikhiljsk)

---

## 🤯 Why CodeNibbl?

Waiting 30 seconds to 5 minutes for AI coding agents (Claude Code, Cursor, Copilot, Windsurf) creates an awkward trap: it's too short to start a second task, so you open X/Reddit/TikTok—and 15 minutes later your focus is gone.

**CodeNibbl** turns dead waiting time into **bite-sized, GenZ-styled codebase micro-learning**:
- 👑 **Glazes Your Smart Code**: Spots gnarly edge-case guards you handled (`try/catch`, race-condition checks, boundary clamps) and hypes you up (*"Ah, turns out you are brilliant—look how line 42 saves prod!"*).
- 🤯 **"Did You Know?" Codebase Lore**: Reveals hidden connections, sneaky helpers, and architectural secrets in plain layman English.
- 📸 **Caught in 4K**: Playfully spotlights old `// temporary fix` comments, magic numbers, and late-night commits.
- 🗺️ **Rich Visual Cards**: Renders **Layman Stories**, **Hero-Highlighted Code Snippets**, **Inline SVG Architecture Flow Maps**, **1-Tap Edge-Case Quizzes with Confetti 🎉**, and **1-Click Teleport Links** straight to the actual code line.

---

## 🌶️ Key Features

1. **12-Signal Scoville Spice Scanner (`🟢 Mild` → `☢️ Carolina Reaper`)**
   Automatically hunts down the juiciest functions in your repo—regex wizardry, concurrency locks, boundary checks, `// HACK` confessions, and fresh AI diffs.
2. **6-Layer Anti-Repetition Engine**
   Uses normalized SHA-256 code hashing, a 10-Archetype Cooldown Carousel, an 8-style Opening Hook Rotator, and a rolling `<do_not_repeat>` memory buffer so you **never see the same snippet insight twice**.
3. **Connect to Any Model in 10 Seconds**
   - **VS Code Built-in (`vscode.lm`)**: Works out-of-the-box with your existing GitHub Copilot / IDE model (**Zero API key needed!**)
   - **Bring Your Own Key (BYOK)**: Native support for **OpenAI**, **Anthropic (Claude)**, **Google Gemini**, **xAI (Grok)**, and **Local Ollama / OpenRouter**.
4. **100% Hardened Security**
   - **OS Keychain Storage**: API keys are stored strictly in `vscode.SecretStorage` (never in plaintext files).
   - **Pre-LLM Secret Scrubber (DLP)**: Automatically blocks `.env` / key files and redacts tokens/passwords before any snippet leaves your machine.
   - **Strict Nonce CSP & Path Guards**: Locked-down Webview (`connect-src 'none'`) and workspace-bounded code links.

---

## ⚡ Quick Commands (`Ctrl+Shift+P` / `Cmd+Shift+P`)

| Command | Shortcut / Action |
| :--- | :--- |
| `CodeNibbl: Open Spicy Feed 🌶️` | `Ctrl+Shift+N` (`Cmd+Shift+N`) |
| `CodeNibbl: 🎲 Spin a Fresh Nibbl Now` | Pulls the next pre-cooked card in `0ms` |
| `CodeNibbl: 🔑 Connect Model & Set API Key` | Choose OpenAI, Anthropic, Gemini, xAI, Ollama, or VS Code Native |
| `CodeNibbl: 🎛️ Switch Vibe Dial` | Toggle between `🌶️ GenZ Hype`, `🕵️ Chaos Gremlin`, and `☕ Chill Mentor` |
| `CodeNibbl: 💖 Sponsor on GitHub` | Support open-source development (0% fee) |
| `CodeNibbl: ☕ Buy Nibbl a Coffee` | Fuel CodeNibbl with a coffee |

---

## 🛠️ Contributing & Local Development

CodeNibbl is built to be super easy to read, test, and extend. Check out:
- **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** — Local setup, testing, and custom mascot guide.
- **[`SECURITY.md`](./SECURITY.md)** — Threat model and 6 mandatory security guardrails.
- **[`AGENTS.md`](./AGENTS.md)** — Architecture map and security invariants for contributors & AI coding tools.

```bash
npm install
npm test          # Runs Vitest unit & security guardrail suite
npm run compile   # Bundles extension via esbuild
```

---

## ☕ Support Open Source

CodeNibbl is **100% free forever** with zero paywalls, zero telemetry, and zero cloud lock-in. If CodeNibbl saved your brain cells during AI agent waits, consider supporting it on **[GitHub Sponsors 💖](https://github.com/sponsors/nikhiljsk)** or **[Buy Me a Coffee ☕](https://buymeacoffee.com/nikhiljsk)**!
