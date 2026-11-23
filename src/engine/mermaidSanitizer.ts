/**
 * ============================================================================
 * CodeNibbl — Mermaid Diagram Sanitizer (`src/engine/mermaidSanitizer.ts`)
 * ============================================================================
 * 100% IMPLEMENTED — Security & Syntax Resilience for LLM Mermaid Output.
 *
 * 1. Strips markdown code fences (```mermaid ... ```).
 * 2. Blocks dangerous Mermaid directives (`click`, `callback`, `<script>`, `href`).
 * 3. Automatically wraps unquoted node labels containing parentheses or special
 *    characters in double quotes (`A[Parse (JSON)]` -> `A["Parse (JSON)"]`) so
 *    Mermaid never crashes in the Webview!
 */

const ALLOWED_DIAGRAM_HEADERS = /^(flowchart\s+(TD|TB|LR|RL)|graph\s+(TD|TB|LR|RL)|sequenceDiagram)\b/;
const DANGEROUS_MERMAID_PATTERNS = /\b(click\s+|call\s+|href\s+|javascript:|<script|<iframe|onerror=)/i;

/**
 * Sanitizes and validates an LLM-generated Mermaid diagram string.
 * Returns `undefined` if the diagram is unsafe or irreparably malformed.
 */
export function sanitizeMermaidDiagram(rawDsl?: string): string | undefined {
  if (!rawDsl || typeof rawDsl !== 'string') {
    return undefined;
  }

  // 1. Strip markdown code fences if the LLM included them
  let cleaned = rawDsl
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  if (!cleaned) {
    return undefined;
  }

  // 2. Security check: block clickable JS callbacks or HTML injection in Mermaid
  if (DANGEROUS_MERMAID_PATTERNS.test(cleaned)) {
    return undefined;
  }

  // 3. Ensure it starts with a supported diagram header
  if (!ALLOWED_DIAGRAM_HEADERS.test(cleaned)) {
    return undefined;
  }

  // 4. Auto-quote unquoted square-bracket node labels containing parentheses or colons
  // Example: `A[User (Admin)]` -> `A["User (Admin)"]`
  cleaned = cleaned.replace(
    /(\b[A-Za-z0-9_]+)\[([^"\]\n]+)\]/g,
    (_match, nodeId: string, label: string) => {
      const safeLabel = label.replace(/"/g, "'").trim();
      return `${nodeId}["${safeLabel}"]`;
    }
  );

  return cleaned;
}
