/**
 * ============================================================================
 * CodeNibbl — 12-Signal Scoville Spice Scanner (`src/harvester/spiceHarvester.ts`)
 * ============================================================================
 * Evaluates source code blocks using the 12 Scoville Spice Signals and extracts
 * candidate symbols from the workspace.
 *
 * SECURITY INVARIANTS:
 * 1. MUST check `isSensitiveFilePath(filePath)` before reading any file.
 * 2. MUST run `scrubSecretsFromText(code)` before storing or returning any snippet.
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  CandidateSymbol,
  ScovilleTier,
  SpiceSignalType,
} from '../types';
import {
  isSensitiveFilePath,
  scrubSecretsFromText,
} from '../security/secretScrubber';
import {
  getLatestCommitForFile,
  getRecentlyModifiedFiles,
} from './gitHelper';

interface SpiceRule {
  signal: SpiceSignalType;
  points: number;
  regex: RegExp;
}

/**
 * Deterministic 12-Signal Scoville Rules
 */
export const SPICE_DETECTION_RULES: SpiceRule[] = [
  {
    signal: 'DEV_CONFESSION_COMMENT',
    points: 40,
    regex: /\/\/.*\b(TODO|FIXME|HACK|WTF|NOTE|XXX|workaround|temporary|magic|do not touch|edge case)\b/i,
  },
  {
    signal: 'EDGE_CASE_ARMOR',
    points: 35,
    regex: /\b(try\s*\{|catch\s*\(|finally\s*\{|Number\.isFinite|Number\.isNaN|Array\.isArray)\b/,
  },
  {
    signal: 'BLACK_MAGIC_WIZARDRY',
    points: 35,
    regex: /(\/[^/\n]+\/[gimsuy]{1,6}|<<|>>|\b0x[0-9a-fA-F]+\b|\.reduce\s*\()/,
  },
  {
    signal: 'CONCURRENCY_TIME_TRAVEL',
    points: 30,
    regex: /\b(Promise\.(race|allSettled|all)|AbortController|setTimeout|debounce|throttle|queueMicrotask|mutex|inFlight)\b/,
  },
  {
    signal: 'HIGH_STAKES_DANGER_ZONE',
    points: 30,
    regex: /\b(jwt|crypto|webhook|stripe|sanitize|escapeHtml|verifySignature|SecretStorage|rateLimit)\b/i,
  },
  {
    signal: 'BOUNDARY_NINJA',
    points: 25,
    regex: /(\bMath\.(min|max|clamp)\b|\.length\s*-\s*1|<=\s*0|>=\s*max)/,
  },
  {
    signal: 'STATE_MACHINE_PLOT_TWIST',
    points: 25,
    regex: /\bswitch\s*\([^)]+\)\s*\{[\s\S]*?case\s+/,
  },
  {
    signal: 'SECRET_SWITCH_FLAG',
    points: 20,
    regex: /\b(FEATURE_|ENABLE_|debugMode|experimental)\b/i,
  },
  {
    signal: 'TYPE_VALIDATION_GYMNASTICS',
    points: 20,
    regex: /\b(is\s+[A-Z][A-Za-z0-9_]+|z\.object|valibot|schema\.parse)\b/,
  },
];

/**
 * Computes a deterministic SHA-256 hash over whitespace-normalized code.
 * Formatting tweaks or shifting line numbers above a function will NOT change its hash!
 */
export function computeNormalizedCodeHash(code: string): string {
  const normalized = code.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Maps numeric Scoville points to a fun Scoville Tier badge.
 */
export function getScovilleTier(score: number): ScovilleTier {
  if (score >= 110) {
    return '☢️ Carolina Reaper';
  }
  if (score >= 80) {
    return '💀 Ghost Pepper';
  }
  if (score >= 55) {
    return '🔥 Habanero';
  }
  if (score >= 30) {
    return '🌶️ Jalapeño';
  }
  return '🟢 Mild';
}

/**
 * Pass 1: Hard Boilerplate Kill-List.
 * Rejects env-var readers, config getters, trivial getters/setters, type-only blocks,
 * and flat plumbing functions with fewer than 2 control-flow decisions.
 */
export function isMundaneBoilerplate(symbolName: string, rawCode: string): boolean {
  const trimmed = rawCode.trim();
  if (!trimmed) {
    return true;
  }

  // Pure type/interface declarations have no runtime logic or edge cases
  if (/^(?:export\s+)?(?:interface|type)\s+/m.test(trimmed) && !/\b(?:function|=>)\b/.test(trimmed)) {
    return true;
  }

  const branchMatches = trimmed.match(
    /\b(?:if|else\s+if|for|while|switch|case|catch)\b|&&|\|\||\.(?:reduce|filter|some|every)\s*\(/g
  );
  const branchCount = branchMatches ? branchMatches.length : 0;

  // Env-var / config plumbing (e.g. `process.env.X ?? 'default'`, `getConfiguration`)
  const envConfigHits = (
    trimmed.match(/\b(?:process\.env|import\.meta\.env|getConfiguration|dotenv)\b/g) ?? []
  ).length;
  if (envConfigHits >= 1 && branchCount < 3) {
    return true;
  }

  // Trivial getters/setters/constructors with < 2 decisions
  if (/^(?:get|set)[A-Z_]|^constructor$/.test(symbolName) && branchCount < 2) {
    return true;
  }

  // Any flat function with < 2 control-flow decisions is plumbing, not interesting business logic
  const hasAsync = /\bawait\b/.test(trimmed);
  if (branchCount < 2 && !(hasAsync && branchCount >= 1)) {
    return true;
  }

  return false;
}

/**
 * Pass 2: Structural Cognitive Complexity Scorer.
 * Rewards nested branching, async state mutations, and compound decision density.
 */
export function computeCognitiveComplexity(rawCode: string): number {
  const lines = rawCode.split(/\r?\n/);
  let score = 0;
  let braceDepth = 0;
  let hasAwait = false;
  let hasStateMutation = false;

  for (const line of lines) {
    const isControlFlow = /\b(?:if|else\s+if|for|while|switch|catch)\b/.test(line);
    if (isControlFlow) {
      // Deeper nesting adds exponentially more cognitive load
      const nestingLevel = Math.max(0, braceDepth - 1);
      score += 10 + nestingLevel * 20;
    }

    const compoundOps = line.match(/&&|\|\||\.(?:reduce|filter)\s*\(/g);
    if (compoundOps) {
      score += compoundOps.length * 10;
    }

    if (/\bawait\b/.test(line)) {
      hasAwait = true;
    }
    if (/(?:\.[a-zA-Z0-9_]+\s*=|\.(?:push|pop|set|add|delete|clear|splice|update)\s*\(|\+\+|--)/.test(line)) {
      hasStateMutation = true;
    }

    for (const ch of line) {
      if (ch === '{') {
        braceDepth++;
      } else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }

  // Async + state mutation is where race conditions and partial-failure bugs live
  if (hasAwait && hasStateMutation) {
    score += 30;
  }

  return score;
}

/**
 * Pass 3: Lightweight Cross-Function Caller/Callee Linker.
 * Populates `callsTo` and `calledBy` across harvested candidates and awards
 * a Hub Bonus to central orchestrator functions.
 */
export function linkSymbolCallGraph(candidates: CandidateSymbol[]): CandidateSymbol[] {
  const byName = new Map<string, CandidateSymbol[]>();
  for (const c of candidates) {
    if (c.symbolName.length < 4) {
      continue;
    }
    const list = byName.get(c.symbolName) ?? [];
    list.push(c);
    byName.set(c.symbolName, list);
  }

  for (const caller of candidates) {
    const callsTo = new Set<string>();
    for (const [targetName, targets] of byName.entries()) {
      if (targetName === caller.symbolName) {
        continue;
      }
      const callRegex = new RegExp(`\\b${targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
      if (callRegex.test(caller.code)) {
        callsTo.add(targetName);
        for (const t of targets) {
          if (!t.calledBy.includes(caller.symbolName)) {
            t.calledBy.push(caller.symbolName);
          }
        }
      }
    }
    caller.callsTo = Array.from(callsTo).slice(0, 6);
  }

  for (const c of candidates) {
    c.calledBy = c.calledBy.slice(0, 6);
    c.relatedSymbols = Array.from(new Set([...c.callsTo, ...c.calledBy]));
    if (c.calledBy.length >= 2 || c.callsTo.length >= 3) {
      if (!c.spiceSignals.includes('MAIN_CHARACTER_HUB')) {
        c.spiceSignals.push('MAIN_CHARACTER_HUB');
        c.scovilleScore += 25;
        c.scovilleTier = getScovilleTier(c.scovilleScore);
      }
    }
  }

  return candidates;
}

/**
 * Analyzes a raw code block and returns its Scoville score, tier, detected signals,
 * cognitive complexity, and 1-based spicy line numbers.
 */
export function scoreCodeSpice(
  rawCode: string,
  startLineOffset = 1,
  options?: { isFreshDiff?: boolean; isLateNightCommit?: boolean; callCount?: number }
): {
  scovilleScore: number;
  scovilleTier: ScovilleTier;
  spiceSignals: SpiceSignalType[];
  spicyLineNumbers: number[];
  cognitiveComplexity: number;
} {
  const signals = new Set<SpiceSignalType>();
  const spicyLines = new Set<number>();
  const cognitiveComplexity = computeCognitiveComplexity(rawCode);
  let score = Math.min(80, Math.floor(cognitiveComplexity * 0.6));

  const lines = rawCode.split(/\r?\n/);

  for (const rule of SPICE_DETECTION_RULES) {
    if (rule.regex.test(rawCode)) {
      signals.add(rule.signal);
      score += rule.points;

      lines.forEach((lineText, idx) => {
        if (rule.regex.test(lineText)) {
          spicyLines.add(startLineOffset + idx);
        }
      });
    }
  }

  if (options?.isFreshDiff) {
    signals.add('FRESH_OUT_THE_OVEN');
    score += 50;
  }
  if (options?.isLateNightCommit) {
    signals.add('LATE_NIGHT_GIT_DRAMA');
    score += 30;
  }
  if ((options?.callCount ?? 0) >= 4) {
    signals.add('MAIN_CHARACTER_HUB');
    score += 25;
  }

  return {
    scovilleScore: score,
    scovilleTier: getScovilleTier(score),
    spiceSignals: Array.from(signals),
    spicyLineNumbers: Array.from(spicyLines).slice(0, 4),
    cognitiveComplexity,
  };
}

/**
 * Builds a safe, secret-scrubbed `CandidateSymbol` from a file snippet.
 * Returns `null` if the file path is on the security blocklist.
 */
export function createSafeCandidateSymbol(params: {
  filePath: string;
  symbolName: string;
  startLine: number;
  endLine: number;
  language: string;
  rawCode: string;
  isFreshDiff?: boolean;
  isLateNightCommit?: boolean;
  relatedSymbols?: string[];
}): CandidateSymbol | null {
  if (isSensitiveFilePath(params.filePath)) {
    return null;
  }

  const scrubbedCode = scrubSecretsFromText(params.rawCode);
  const codeHash = computeNormalizedCodeHash(scrubbedCode);
  const spice = scoreCodeSpice(scrubbedCode, params.startLine, {
    isFreshDiff: params.isFreshDiff,
    isLateNightCommit: params.isLateNightCommit,
    callCount: params.relatedSymbols?.length ?? 0,
  });

  return {
    filePath: params.filePath.replace(/\\/g, '/'),
    symbolName: params.symbolName,
    startLine: params.startLine,
    endLine: params.endLine,
    language: params.language,
    code: scrubbedCode,
    codeHash,
    scovilleScore: spice.scovilleScore,
    scovilleTier: spice.scovilleTier,
    spiceSignals: spice.spiceSignals,
    spicyLineNumbers: spice.spicyLineNumbers,
    relatedSymbols: params.relatedSymbols ?? [],
    cognitiveComplexity: spice.cognitiveComplexity,
    callsTo: [],
    calledBy: [],
  };
}

/**
 * Maps a file path or extension to a standard language identifier.
 */
export function detectLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
      return 'typescript';
    case '.tsx':
      return 'typescriptreact';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'javascriptreact';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    case '.cs':
      return 'csharp';
    default:
      return 'plaintext';
  }
}

export interface RawSymbolChunk {
  name: string;
  startLine: number; // 1-based
  endLine: number;   // 1-based
  rawCode: string;
}

/**
 * Lightweight regex chunker for when LSP symbols are not available or not yet warm.
 * Extracts function, method, and class chunks of 6–65 lines.
 */
export function chunkFileByRegex(fileContent: string): RawSymbolChunk[] {
  const lines = fileContent.split(/\r?\n/);
  const chunks: RawSymbolChunk[] = [];
  const totalLines = lines.length;

  if (totalLines < 6) {
    return chunks;
  }

  const DECLARATION_REGEX =
    /(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+([A-Za-z0-9_$]+)|\s*\())|(?:(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>)|(?:(?:public|private|protected|static|async|\s)+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*(?::\s*[^;{]+)?\s*\{)|(?:def\s+([A-Za-z0-9_]+)\s*\()|(?:func\s+(?:\([^)]+\)\s*)?([A-Za-z0-9_]+)\s*\()|(?:(?:pub\s+)?fn\s+([A-Za-z0-9_]+)\s*)|(?:(?:class|interface)\s+([A-Za-z0-9_$]+))/;

  for (let i = 0; i < totalLines; i++) {
    const line = lines[i];
    const match = DECLARATION_REGEX.exec(line);
    if (!match) {
      continue;
    }

    const symbolName =
      match[1] ||
      match[2] ||
      match[3] ||
      match[4] ||
      match[5] ||
      match[6] ||
      match[7] ||
      'anonymousBlock';

    const startLine = i + 1;
    // Determine end line by scanning for matching braces or indentation
    let braceCount = 0;
    let foundOpenBrace = false;
    let endLine = Math.min(totalLines, startLine + 40);

    for (let j = i; j < Math.min(totalLines, i + 65); j++) {
      const curLine = lines[j];
      for (const char of curLine) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === '}') {
          braceCount--;
        }
      }

      if (foundOpenBrace && braceCount <= 0 && j > i) {
        endLine = j + 1;
        break;
      }
    }

    const lineSpan = endLine - startLine + 1;
    if (lineSpan >= 6 && lineSpan <= 65) {
      const chunkCode = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push({
        name: symbolName,
        startLine,
        endLine,
        rawCode: chunkCode,
      });
      // Skip ahead to avoid overlapping chunks
      i = endLine - 1;
    }
  }

  return chunks;
}

/**
 * Recursively extracts suitable symbols (Function, Method, Class, etc.) from LSP DocumentSymbols.
 */
function extractLspSymbols(
  docSymbols: vscode.DocumentSymbol[],
  fileLines: string[]
): RawSymbolChunk[] {
  const result: RawSymbolChunk[] = [];

  function visit(sym: vscode.DocumentSymbol) {
    const startLine = sym.range.start.line + 1;
    const endLine = sym.range.end.line + 1;
    const lineCount = endLine - startLine + 1;

    // Check if symbol matches function, method, constructor, or class
    const isTargetKind =
      sym.kind === vscode.SymbolKind.Function ||
      sym.kind === vscode.SymbolKind.Method ||
      sym.kind === vscode.SymbolKind.Constructor ||
      sym.kind === vscode.SymbolKind.Class ||
      sym.kind === vscode.SymbolKind.Interface;

    if (isTargetKind && lineCount >= 6 && lineCount <= 65) {
      const rawCode = fileLines.slice(startLine - 1, endLine).join('\n');
      result.push({
        name: sym.name,
        startLine,
        endLine,
        rawCode,
      });
    }

    // Always inspect child symbols (e.g. methods inside a large class)
    if (sym.children && sym.children.length > 0) {
      for (const child of sym.children) {
        visit(child);
      }
    }
  }

  for (const sym of docSymbols) {
    visit(sym);
  }

  return result;
}

/**
 * Harvests workspace symbols using VS Code LSP document symbol provider with a
 * regex chunker fallback, enriches with git history & fresh diff status, and returns
 * candidate symbols sorted descending by Scoville score.
 */
export async function harvestWorkspaceSymbols(): Promise<CandidateSymbol[]> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

  // 1. Locate source files in workspace
  let uris: vscode.Uri[] = [];
  try {
    uris = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,py,go,rs,java,cs}',
      '**/{node_modules,dist,out,build,.git,.vscode}/**',
      60
    );
  } catch {
    uris = [];
  }

  if (uris.length === 0) {
    return [];
  }

  // 2. Discover recently modified files for fresh diff boost
  const recentFiles = await getRecentlyModifiedFiles(workspaceRoot);
  const recentFileSet = new Set(recentFiles);

  const candidates: CandidateSymbol[] = [];

  for (const uri of uris) {
    // 3. Security invariant: verify file is not sensitive before reading
    if (isSensitiveFilePath(uri.fsPath)) {
      continue;
    }

    const relPath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/')
      : path.basename(uri.fsPath);

    const isFreshDiff = recentFileSet.has(relPath);
    const language = detectLanguageFromPath(uri.fsPath);

    let fileContent = '';
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      fileContent = doc.getText();
    } catch {
      continue;
    }

    if (!fileContent.trim()) {
      continue;
    }

    const fileLines = fileContent.split(/\r?\n/);
    let chunks: RawSymbolChunk[] = [];

    // 4. Try LSP Document Symbol Provider
    try {
      const lspSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );
      if (lspSymbols && lspSymbols.length > 0) {
        chunks = extractLspSymbols(lspSymbols, fileLines);
      }
    } catch {
      chunks = [];
    }

    // 5. Fallback to lightweight regex chunker if LSP returned no chunks
    if (chunks.length === 0) {
      chunks = chunkFileByRegex(fileContent);
    }

    // 6. Filter out mundane boilerplate and create safe candidate symbols
    for (const chunk of chunks) {
      if (isMundaneBoilerplate(chunk.name, chunk.rawCode)) {
        continue;
      }

      const candidate = createSafeCandidateSymbol({
        filePath: relPath,
        symbolName: chunk.name,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language,
        rawCode: chunk.rawCode,
        isFreshDiff,
      });

      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  // 7. Link cross-function caller/callee relationships and sort descending
  linkSymbolCallGraph(candidates);
  candidates.sort((a, b) => b.scovilleScore - a.scovilleScore);

  // 8. Enrich top 10 candidates with git context
  const topSlice = candidates.slice(0, 10);
  await Promise.all(
    topSlice.map(async (c) => {
      try {
        const gitCtx = await getLatestCommitForFile(workspaceRoot, c.filePath);
        if (gitCtx) {
          c.gitContext = gitCtx;
          if (gitCtx.isLateNightCommit) {
            c.scovilleScore += 30;
            c.scovilleTier = getScovilleTier(c.scovilleScore);
            c.spiceSignals.push('LATE_NIGHT_GIT_DRAMA');
          }
        }
      } catch {
        // Continue gracefully if git log is not available
      }
    })
  );

  // Re-sort after git enrichment
  candidates.sort((a, b) => b.scovilleScore - a.scovilleScore);

  return candidates;
}
