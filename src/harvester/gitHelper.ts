/**
 * ============================================================================
 * CodeNibbl — Safe Git Archaeology Helper (`src/harvester/gitHelper.ts`)
 * ============================================================================
 * SECURITY INVARIANT:
 * - ALWAYS use `child_process.execFile('git', args, ...)` with an array of
 *   arguments. NEVER use `exec()` or shell interpolation, which could allow
 *   command injection via malicious file paths or branch names.
 * - ALWAYS pass commit messages through `scrubSecretsFromText()` before returning.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { scrubSecretsFromText } from '../security/secretScrubber';
import { resolveSafeWorkspaceFilePath } from '../security/pathValidator';

const execFileAsync = promisify(execFile);

export interface GitCommitContext {
  commitHash: string;
  subject: string;
  authorTimeIso: string;
  isLateNightCommit: boolean;
}

/**
 * Retrieves the latest commit metadata for a specific line range or file.
 */
export async function getLatestCommitForFile(
  workspaceRoot: string,
  relativePath: string
): Promise<GitCommitContext | undefined> {
  const safePath = resolveSafeWorkspaceFilePath(workspaceRoot, relativePath);
  if (!safePath) {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['log', '-n', '1', '--format=%h|%cI|%s', '--', relativePath],
      {
        cwd: workspaceRoot,
        timeout: 3000,
        windowsHide: true,
      }
    );

    const line = stdout.trim();
    if (!line) {
      return undefined;
    }

    const [commitHash, authorTimeIso, ...subjectParts] = line.split('|');
    const rawSubject = subjectParts.join('|').trim();
    const hour = new Date(authorTimeIso).getHours();
    const isLateNightCommit = hour >= 23 || hour <= 4;

    return {
      commitHash: commitHash.trim(),
      subject: scrubSecretsFromText(rawSubject).slice(0, 140),
      authorTimeIso: authorTimeIso.trim(),
      isLateNightCommit,
    };
  } catch {
    return undefined;
  }
}

/**
 * Retrieves workspace-relative paths of recently modified files (from git diff or git status)
 * so the Spice Harvester can automatically boost files that received fresh edits (+50 Scoville).
 */
export async function getRecentlyModifiedFiles(workspaceRoot: string): Promise<string[]> {
  try {
    const { stdout: diffOut } = await execFileAsync(
      'git',
      ['diff', '--name-only', 'HEAD~3'],
      {
        cwd: workspaceRoot,
        timeout: 3000,
        windowsHide: true,
      }
    );
    const files = diffOut
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter(Boolean);
    if (files.length > 0) {
      return files;
    }
  } catch {
    // If HEAD~3 fails (e.g. repo has fewer commits), fall back to git status
  }

  try {
    const { stdout: statusOut } = await execFileAsync(
      'git',
      ['status', '--porcelain'],
      {
        cwd: workspaceRoot,
        timeout: 3000,
        windowsHide: true,
      }
    );
    return statusOut
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch {
    return [];
  }
}
