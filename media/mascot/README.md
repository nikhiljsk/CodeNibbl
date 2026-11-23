# 🐹 CodeNibbl Mascot Assets (`media/mascot/`)

Drop your custom mascot artwork (`.svg`, `.png`, `.webp`, or `.gif`) in this folder whenever your mascot design is ready!

## Supported Mascot Mood States
The Webview mascot module (`src/webview/mascotAssets.ts`) supports **6 reactive moods** that automatically change based on the active Nibbl Card Archetype and background queue state:

1. `cooking.svg` — Shown when the AI agent or background queue is cooking up fresh snippets.
2. `chef_kiss.svg` — Shown for `GLAZE_THE_DEV` (`👑 CERTIFIED GENIUS`) when glazing your smart edge-case handling.
3. `mind_blown.svg` — Shown for `DID_YOU_KNOW` (`🤯 CODEBASE LORE`) and `BLACK_MAGIC_DECODED` (`🧙‍♂️ SPELL DECODED`).
4. `detective.svg` — Shown for `PLOT_TWIST_QUIZ` (`🕵️ WAIT... WHAT IF?`) and `GIT_TIME_CAPSULE` (`🦖 GIT ARCHAEOLOGY`).
5. `spicy_sweat.svg` — Shown for `CAUGHT_IN_4K` (`📸 CAUGHT IN 4K`) and `DOMINO_EFFECT` (`🧨 BLAST RADIUS`).
6. `chill.svg` — Shown for `EXPLAIN_LIKE_IM_5` (`🧃 ZERO-JARGON MODE`) and idle vibes.
7. `hyped.svg` — Shown for `MAIN_CHARACTER` (`💅 MAIN CHARACTER`) and confetti celebration bursts!

Until custom files are placed here, `src/webview/mascotAssets.ts` renders expressive built-in inline SVGs out of the box.
