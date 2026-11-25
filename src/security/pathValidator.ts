/**
 * ============================================================================
 * CodeNibbl Security Layer 2: Path Traversal & Message Guard (`src/security/pathValidator.ts`)
 * ============================================================================
 * 100% IMPLEMENTED — DO NOT WEAKEN OR BYPASS.
 *
 * Guarantees that:
 * 1. "Jump to Code" file paths returned by an LLM or Webview message CANNOT escape
 *    the active workspace root via `../`, absolute paths, or null bytes.
 * 2. Webview incoming messages are strictly validated at runtime.
 * 3. External URLs opened via `vscode.env.openExternal` are restricted to HTTPS
 *    sponsor domains.
 */

import * as path from 'path';
import { VibeMode, WebviewIncomingMessage } from '../types';

const ALLOWED_VIBE_MODES: Set<VibeMode> = new Set([
  'genz_hype',
  'chaos_gremlin',
  'chill_mentor',
]);

const ALLOWED_SPONSOR_HOSTS: Set<string> = new Set([
  'buymeacoffee.com',
  'www.buymeacoffee.com',
  'github.com',
  'ko-fi.com',
  'www.ko-fi.com',
]);

/**
 * Safely resolves a relative file path against the workspace root.
 * Returns `null` if the path attempts directory traversal (`..`), contains null bytes,
 * or resolves outside `workspaceRoot`.
 */
export function resolveSafeWorkspaceFilePath(
  workspaceRoot: string,
  candidateRelativePath: string
): string | null {
  if (!workspaceRoot || !candidateRelativePath || typeof candidateRelativePath !== 'string') {
    return null;
  }

  // Block null bytes and protocol schemes
  if (candidateRelativePath.includes('\0') || /^[a-zA-Z]{2,}:\/\//.test(candidateRelativePath)) {
    return null;
  }

  // Block explicit Windows UNC paths or absolute root paths
  const trimmed = candidateRelativePath.trim();
  if (trimmed.startsWith('\\\\') || path.isAbsolute(trimmed)) {
    return null;
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedRoot, trimmed);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (
    !relative ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  return resolvedTarget;
}

/**
 * Clamps 1-based line numbers to safe positive integers.
 */
export function sanitizeLineNumber(line: unknown, fallback = 1): number {
  const num = typeof line === 'number' ? Math.floor(line) : Number.parseInt(String(line), 10);
  if (!Number.isFinite(num) || num < 1) {
    return fallback;
  }
  return Math.min(num, 1_000_000);
}

/**
 * Validates and sanitizes incoming Webview postMessage payloads.
 * Returns `null` if the message is malformed or unexpected.
 */
export function validateWebviewMessage(raw: unknown): WebviewIncomingMessage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const msg = raw as Record<string, unknown>;

  switch (msg.type) {
    case 'READY':
    case 'SPIN_NEXT_NIBBL':
    case 'CONFIGURE_MODEL':
    case 'OPEN_FOLDER':
    case 'GITHUB_SPONSORS':
    case 'BUY_ME_A_COFFEE':
      return { type: msg.type };

    case 'JUMP_TO_CODE': {
      if (typeof msg.filePath !== 'string' || msg.filePath.length > 512) {
        return null;
      }
      return {
        type: 'JUMP_TO_CODE',
        filePath: msg.filePath,
        line: sanitizeLineNumber(msg.line, 1),
        endLine: msg.endLine !== undefined ? sanitizeLineNumber(msg.endLine, 1) : undefined,
      };
    }

    case 'SWITCH_VIBE': {
      if (typeof msg.vibeMode !== 'string' || !ALLOWED_VIBE_MODES.has(msg.vibeMode as VibeMode)) {
        return null;
      }
      return {
        type: 'SWITCH_VIBE',
        vibeMode: msg.vibeMode as VibeMode,
      };
    }

    case 'QUIZ_SOLVED': {
      if (typeof msg.cardId !== 'string' || msg.cardId.length > 128) {
        return null;
      }
      return {
        type: 'QUIZ_SOLVED',
        cardId: msg.cardId,
      };
    }

    case 'FLEX_CARD_COPY': {
      if (typeof msg.markdown !== 'string' || msg.markdown.length > 10_000) {
        return null;
      }
      return {
        type: 'FLEX_CARD_COPY',
        markdown: msg.markdown,
      };
    }

    default:
      return null;
  }
}

/**
 * Validates that a sponsor URL uses HTTPS and points to a trusted sponsorship platform.
 */
export function isSafeSponsorUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return ALLOWED_SPONSOR_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}
