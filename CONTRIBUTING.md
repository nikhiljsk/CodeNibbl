# 🤝 Contributing to CodeNibbl 🐹🌶️

First off, thank you for checking out **CodeNibbl**! This project is **100% Free & Open Source (MIT)**—built to keep developers in flow, celebrate clever code, and make learning codebases fun.

---

## 🚀 Quick Start (Under 60 Seconds)

1. **Clone & Install**
   ```bash
   git clone https://github.com/nikhiljsk/CodeNibbl.git
   cd CodeNibbl
   npm install
   ```

2. **Run Tests & Typecheck**
   ```bash
   npm run typecheck
   npm test
   ```

3. **Launch in VS Code Development Host**
   - Open this folder in VS Code.
   - Press **`F5`** (or run the **"Run CodeNibbl Extension"** debug configuration).
   - In the new Extension Development Host window, click the **CodeNibbl ⚡** icon in the Activity Bar or press `Ctrl+Shift+N` (`Cmd+Shift+N` on Mac)!

---

## 🌶️ Fun Things to Contribute

- **New Scoville Spice Rules**: Add more clever edge-case or language-specific detectors in `src/harvester/spiceHarvester.ts`.
- **Custom Mascot Art**: Drop expressive SVGs/GIFs into `media/mascot/` and wire them up in `src/webview/mascotAssets.ts`.
- **New Card Archetypes & Vibe Modes**: Expand the prompts in `src/engine/promptBuilder.ts`.

## 🛡️ Pull Request Checklist
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm test` passes all unit and security tests in `test/`.
- [ ] No security invariants in `src/security/` are weakened.
