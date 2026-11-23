/**
 * ============================================================================
 * CodeNibbl — Reactive Mascot Assets Module (`src/webview/mascotAssets.ts`)
 * ============================================================================
 * Renders the Nibbl Mascot ("Nibbl the Cyber-Hamster 🐹⚡") across 7 moods.
 *
 * 🎨 HOW TO PLUG IN YOUR CUSTOM MASCOT LATER:
 * Simply replace the SVG strings in `MASCOT_SVG_BY_MOOD` below or load custom
 * image URIs from `media/mascot/<mood>.svg`!
 */

import { MascotMood } from '../types';

export const MASCOT_LABELS_BY_MOOD: Record<MascotMood, string> = {
  cooking: '🍳 Nibbl is cooking fresh lore...',
  chef_kiss: '🤌 Certified Chef’s Kiss!',
  mind_blown: '🤯 Mind = Blown',
  detective: '🕵️ Nibbl P.I. on the case',
  spicy_sweat: '🌶️ Whoa, high Scoville zone!',
  chill: '🎧 Just vibing in the codebase',
  hyped: '⚡ MAXIMUM HYPE!',
};

export const MASCOT_SVG_BY_MOOD: Record<MascotMood, string> = {
  cooking: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="34" r="22" fill="#FFB703" stroke="#111" stroke-width="3"/>
    <path d="M18 18C18 11 46 11 46 18L42 24H22L18 18Z" fill="#FFF" stroke="#111" stroke-width="2.5"/>
    <circle cx="25" cy="33" r="3" fill="#111"/>
    <circle cx="39" cy="33" r="3" fill="#111"/>
    <path d="M27 42Q32 46 37 42" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  chef_kiss: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="34" r="22" fill="#FF9F1C" stroke="#111" stroke-width="3"/>
    <path d="M21 31Q25 27 29 31" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M35 31Q39 27 43 31" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M28 41Q32 45 36 41" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
    <text x="44" y="22" font-size="14">✨</text>
  </svg>`,
  mind_blown: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="36" r="21" fill="#FF595E" stroke="#111" stroke-width="3"/>
    <circle cx="24" cy="33" r="4" fill="#FFF" stroke="#111" stroke-width="2"/>
    <circle cx="40" cy="33" r="4" fill="#FFF" stroke="#111" stroke-width="2"/>
    <circle cx="32" cy="44" r="4" fill="#111"/>
    <path d="M20 12L26 20M32 8L32 18M44 12L38 20" stroke="#FFCA3A" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  detective: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="35" r="21" fill="#8AC926" stroke="#111" stroke-width="3"/>
    <circle cx="25" cy="34" r="5" stroke="#111" stroke-width="2.5"/>
    <circle cx="39" cy="34" r="5" stroke="#111" stroke-width="2.5"/>
    <line x1="30" y1="34" x2="34" y2="34" stroke="#111" stroke-width="2.5"/>
    <path d="M27 44H37" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  spicy_sweat: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="35" r="21" fill="#FF4D6D" stroke="#111" stroke-width="3"/>
    <circle cx="24" cy="33" r="3" fill="#111"/>
    <circle cx="40" cy="33" r="3" fill="#111"/>
    <path d="M25 44Q32 40 39 44" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M48 20C48 20 53 26 50 29C47 32 45 27 48 20Z" fill="#00BBF9"/>
  </svg>`,
  chill: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="35" r="21" fill="#00F5D4" stroke="#111" stroke-width="3"/>
    <rect x="19" y="29" width="11" height="7" rx="2" fill="#111"/>
    <rect x="34" y="29" width="11" height="7" rx="2" fill="#111"/>
    <line x1="30" y1="32" x2="34" y2="32" stroke="#111" stroke-width="2.5"/>
    <path d="M26 43Q32 47 38 43" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,
  hyped: `<svg viewBox="0 0 64 64" width="44" height="44" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="35" r="21" fill="#9B5DE5" stroke="#111" stroke-width="3"/>
    <path d="M21 32L27 29L25 35Z" fill="#FEE440"/>
    <path d="M43 32L37 29L39 35Z" fill="#FEE440"/>
    <path d="M24 41Q32 49 40 41Z" fill="#FFF" stroke="#111" stroke-width="2"/>
  </svg>`,
};
