/**
 * ============================================================================
 * CodeNibbl — Zero-Dependency Secure Mermaid SVG Renderer (`src/webview/mermaidRenderer.ts`)
 * ============================================================================
 * Renders sanitized Mermaid `flowchart` / `graph` (TD, TB, LR, RL) and
 * `sequenceDiagram` blocks directly into crisp, theme-adaptive inline SVG.
 *
 * SECURITY INVARIANTS:
 * 1. Always runs `sanitizeMermaidDiagram()` first to block unsafe directives.
 * 2. Every label is escaped via `escapeHtml()` before entering SVG markup.
 * 3. Zero external scripts or CDN calls — 100% compatible with `connect-src 'none'`.
 */

import { escapeHtml } from '../security/csp';
import { sanitizeMermaidDiagram } from '../engine/mermaidSanitizer';

interface FlowNode {
  id: string;
  label: string;
  shape: 'rect' | 'round' | 'diamond';
}

interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  dashed: boolean;
}

const LAYER_ACCENTS = ['#00f5d4', '#ff9f1c', '#9b5de5', '#ff4d6d', '#fee440'];

/**
 * Parses a single node token like `A["Raw Repo Code"]`, `B("Check")`, `C{"Valid?"}`, or `D`.
 */
function parseNodeToken(token: string): FlowNode | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }

  // Match ID + optional bracketed/parenthesized/braced label
  const match = /^([A-Za-z0-9_]+)(?:\s*(?:\[\s*"?([^"\]]*)"?\s*\]|\(\s*"?([^")]*)"?\s*\)|\{\s*"?([^"}]*)?"?\s*\}))?$/.exec(
    trimmed
  );
  if (!match) {
    return null;
  }

  const id = match[1];
  if (match[2] !== undefined) {
    return { id, label: match[2].trim() || id, shape: 'rect' };
  }
  if (match[3] !== undefined) {
    return { id, label: match[3].trim() || id, shape: 'round' };
  }
  if (match[4] !== undefined) {
    return { id, label: match[4].trim() || id, shape: 'diamond' };
  }
  return { id, label: id, shape: 'rect' };
}

/**
 * Splits a flowchart edge line into segments and edge operators.
 */
function parseFlowchart(dsl: string): {
  direction: 'TD' | 'LR';
  nodes: FlowNode[];
  edges: FlowEdge[];
} | null {
  const lines = dsl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (lines.length === 0) {
    return null;
  }

  const headerMatch = /^(?:flowchart|graph)\s+(TD|TB|LR|RL)\b/i.exec(lines[0]);
  if (!headerMatch) {
    return null;
  }

  const dirToken = headerMatch[1].toUpperCase();
  const direction: 'TD' | 'LR' = dirToken === 'LR' || dirToken === 'RL' ? 'LR' : 'TD';

  const nodeMap = new Map<string, FlowNode>();
  const edges: FlowEdge[] = [];

  const upsertNode = (n: FlowNode): void => {
    const existing = nodeMap.get(n.id);
    if (!existing) {
      nodeMap.set(n.id, n);
    } else if (existing.label === existing.id && n.label !== n.id) {
      // Upgrade bare ID reference with full label
      nodeMap.set(n.id, n);
    }
  };

  // Edge operator regex: `-->|label|`, `-.->|label|`, `==>|label|`, `-- label -->`, `-->`, `-.->`, `==>`
  const edgeSplitRegex =
    /\s*(-->|-.->|==>)(?:\|([^|]+)\|)?\s*|\s*--\s+([^-\n]+?)\s+-->\s*/g;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/;$/, '').trim();
    if (!line || /^subgraph\b|^end\b|^style\b|^classDef\b|^class\b/i.test(line)) {
      continue;
    }

    const parts: string[] = [];
    const operators: Array<{ label?: string; dashed: boolean }> = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    edgeSplitRegex.lastIndex = 0;

    while ((m = edgeSplitRegex.exec(line)) !== null) {
      parts.push(line.slice(lastIndex, m.index));
      const op = m[1] || '-->';
      const label = (m[2] || m[3] || '').trim() || undefined;
      operators.push({ label, dashed: op === '-.->' });
      lastIndex = edgeSplitRegex.lastIndex;
    }
    parts.push(line.slice(lastIndex));

    if (operators.length === 0) {
      const single = parseNodeToken(line);
      if (single) {
        upsertNode(single);
      }
      continue;
    }

    const parsedNodes = parts.map((p) => parseNodeToken(p));
    for (let j = 0; j < operators.length; j++) {
      const fromNode = parsedNodes[j];
      const toNode = parsedNodes[j + 1];
      if (!fromNode || !toNode) {
        continue;
      }
      upsertNode(fromNode);
      upsertNode(toNode);
      edges.push({
        from: fromNode.id,
        to: toNode.id,
        label: operators[j].label,
        dashed: operators[j].dashed,
      });
    }
  }

  if (nodeMap.size === 0) {
    return null;
  }

  return {
    direction,
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/**
 * Truncates long labels gracefully so SVG boxes stay crisp in narrow sidebars.
 */
function truncateLabel(label: string, maxChars = 30): string {
  if (label.length <= maxChars) {
    return label;
  }
  return `${label.slice(0, maxChars - 1)}…`;
}

/**
 * Renders a parsed flowchart into a clean, responsive inline SVG.
 */
function renderFlowchartSvg(
  direction: 'TD' | 'LR',
  nodes: FlowNode[],
  edges: FlowEdge[]
): string {
  // Assign layers via topological BFS (cycle-safe)
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    outgoing.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const layerMap = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      layerMap.set(n.id, 0);
      queue.push(n.id);
    }
  }
  if (queue.length === 0 && nodes.length > 0) {
    layerMap.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  let safety = 0;
  while (queue.length > 0 && safety < nodes.length * 4) {
    safety++;
    const current = queue.shift()!;
    const currentLayer = layerMap.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const prevLayer = layerMap.get(next);
      const candidateLayer = currentLayer + 1;
      if (prevLayer === undefined || (candidateLayer > prevLayer && candidateLayer < nodes.length)) {
        layerMap.set(next, candidateLayer);
        queue.push(next);
      }
    }
  }

  for (const n of nodes) {
    if (!layerMap.has(n.id)) {
      layerMap.set(n.id, 0);
    }
  }

  // Group nodes by layer
  const layers = new Map<number, FlowNode[]>();
  for (const n of nodes) {
    const l = layerMap.get(n.id) ?? 0;
    const list = layers.get(l) ?? [];
    list.push(n);
    layers.set(l, list);
  }

  const sortedLayerKeys = Array.from(layers.keys()).sort((a, b) => a - b);

  // Compute coordinates
  interface BoxPos {
    node: FlowNode;
    x: number;
    y: number;
    w: number;
    h: number;
    layer: number;
  }

  const positions = new Map<string, BoxPos>();
  const padX = 16;
  const padY = 16;
  const nodeH = 38;
  const gapY = 34;
  const gapX = 18;

  let totalWidth = 280;
  let totalHeight = 100;

  if (direction === 'TD') {
    const rowWidths = sortedLayerKeys.map((k) => {
      const row = layers.get(k) ?? [];
      const widths = row.map((n) =>
        Math.min(250, Math.max(120, truncateLabel(n.label).length * 7.2 + 28))
      );
      return widths.reduce((a, b) => a + b, 0) + Math.max(0, row.length - 1) * gapX;
    });
    const maxRowW = Math.max(240, ...rowWidths);
    totalWidth = maxRowW + padX * 2;
    totalHeight =
      padY * 2 +
      sortedLayerKeys.length * nodeH +
      Math.max(0, sortedLayerKeys.length - 1) * gapY;

    sortedLayerKeys.forEach((k, rowIdx) => {
      const row = layers.get(k) ?? [];
      const widths = row.map((n) =>
        Math.min(250, Math.max(120, truncateLabel(n.label).length * 7.2 + 28))
      );
      const rowW = widths.reduce((a, b) => a + b, 0) + Math.max(0, row.length - 1) * gapX;
      let cursorX = (totalWidth - rowW) / 2;
      const y = padY + rowIdx * (nodeH + gapY);

      row.forEach((n, idx) => {
        const w = widths[idx];
        positions.set(n.id, { node: n, x: cursorX, y, w, h: nodeH, layer: rowIdx });
        cursorX += w + gapX;
      });
    });
  } else {
    // LR horizontal layout
    const colWidths = sortedLayerKeys.map((k) => {
      const col = layers.get(k) ?? [];
      return Math.max(
        110,
        ...col.map((n) => Math.min(210, Math.max(110, truncateLabel(n.label, 24).length * 7 + 24)))
      );
    });
    const maxColCount = Math.max(1, ...sortedLayerKeys.map((k) => (layers.get(k) ?? []).length));
    totalWidth =
      padX * 2 +
      colWidths.reduce((a, b) => a + b, 0) +
      Math.max(0, sortedLayerKeys.length - 1) * 38;
    totalHeight = padY * 2 + maxColCount * nodeH + Math.max(0, maxColCount - 1) * 20;

    let cursorX = padX;
    sortedLayerKeys.forEach((k, colIdx) => {
      const col = layers.get(k) ?? [];
      const colW = colWidths[colIdx];
      const colH = col.length * nodeH + Math.max(0, col.length - 1) * 20;
      let cursorY = (totalHeight - colH) / 2;

      col.forEach((n) => {
        positions.set(n.id, { node: n, x: cursorX, y: cursorY, w: colW, h: nodeH, layer: colIdx });
        cursorY += nodeH + 20;
      });
      cursorX += colW + 38;
    });
  }

  // Build SVG edges
  const edgeSvgs = edges
    .map((e) => {
      const src = positions.get(e.from);
      const dst = positions.get(e.to);
      if (!src || !dst) {
        return '';
      }

      let x1: number;
      let y1: number;
      let x2: number;
      let y2: number;
      let pathD: string;

      if (direction === 'TD') {
        x1 = src.x + src.w / 2;
        y1 = src.y + src.h;
        x2 = dst.x + dst.w / 2;
        y2 = dst.y - 2;
        const midY = (y1 + y2) / 2;
        pathD = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      } else {
        x1 = src.x + src.w;
        y1 = src.y + src.h / 2;
        x2 = dst.x - 2;
        y2 = dst.y + dst.h / 2;
        const midX = (x1 + x2) / 2;
        pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
      }

      const dashAttr = e.dashed ? ' stroke-dasharray="5,4"' : '';
      const labelSvg = e.label
        ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 4}" text-anchor="middle" fill="var(--vscode-foreground, #e5e5e5)" font-size="10" font-weight="700">${escapeHtml(truncateLabel(e.label, 18))}</text>`
        : '';

      return `<path d="${pathD}" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="2"${dashAttr} marker-end="url(#nibbl-arrow)" />${labelSvg}`;
    })
    .join('\n    ');

  // Build SVG nodes
  const nodeSvgs = Array.from(positions.values())
    .map((pos) => {
      const accent = LAYER_ACCENTS[pos.layer % LAYER_ACCENTS.length];
      const rx = pos.node.shape === 'round' ? 19 : 9;
      const safeLabel = escapeHtml(truncateLabel(pos.node.label, direction === 'TD' ? 30 : 24));
      const cx = pos.x + pos.w / 2;
      const cy = pos.y + pos.h / 2;

      return `<g>
      <rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="${rx}" fill="rgba(255,255,255,0.06)" stroke="${accent}" stroke-width="2" />
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="var(--vscode-foreground, #f5f5f5)" font-size="11.5" font-weight="700">${safeLabel}</text>
    </g>`;
    })
    .join('\n    ');

  return `<svg class="nibbl-mermaid-svg" viewBox="0 0 ${Math.ceil(totalWidth)} ${Math.ceil(totalHeight)}" width="100%" role="img" aria-label="Architecture Flow Diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="nibbl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(255,255,255,0.65)" />
      </marker>
    </defs>
    ${edgeSvgs}
    ${nodeSvgs}
  </svg>`;
}

/**
 * Renders a `sequenceDiagram` into a clean inline SVG.
 */
function renderSequenceSvg(dsl: string): string | null {
  const lines = dsl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));

  if (!/^sequenceDiagram\b/i.test(lines[0] || '')) {
    return null;
  }

  const participants: Array<{ id: string; label: string }> = [];
  const participantSet = new Set<string>();
  const messages: Array<{ from: string; to: string; text: string; dashed: boolean }> = [];

  const ensureParticipant = (id: string, label?: string): void => {
    if (!participantSet.has(id)) {
      participantSet.add(id);
      participants.push({ id, label: label || id });
    }
  };

  for (let i = 1; i < lines.length; i++) {
    const pMatch = /^(?:participant|actor)\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?$/i.exec(lines[i]);
    if (pMatch) {
      ensureParticipant(pMatch[1], pMatch[2]?.trim());
      continue;
    }

    const mMatch = /^([A-Za-z0-9_]+)\s*(-->>|->>|-->|->)\s*([A-Za-z0-9_]+)\s*:\s*(.+)$/.exec(
      lines[i]
    );
    if (mMatch) {
      const [, from, arrow, to, text] = mMatch;
      ensureParticipant(from);
      ensureParticipant(to);
      messages.push({
        from,
        to,
        text: text.trim(),
        dashed: arrow.startsWith('--'),
      });
    }
  }

  if (participants.length === 0) {
    return null;
  }

  const colW = 110;
  const padX = 16;
  const padY = 14;
  const headerH = 30;
  const msgStep = 36;
  const totalW = padX * 2 + participants.length * colW;
  const totalH = padY * 2 + headerH + Math.max(1, messages.length) * msgStep + 16;

  const xById = new Map<string, number>();
  const headerSvgs = participants
    .map((p, idx) => {
      const cx = padX + idx * colW + colW / 2;
      xById.set(p.id, cx);
      const accent = LAYER_ACCENTS[idx % LAYER_ACCENTS.length];
      return `<g>
      <line x1="${cx}" y1="${padY + headerH}" x2="${cx}" y2="${totalH - padY}" stroke="rgba(255,255,255,0.22)" stroke-width="1.5" stroke-dasharray="4,4" />
      <rect x="${cx - 46}" y="${padY}" width="92" height="${headerH}" rx="8" fill="rgba(255,255,255,0.06)" stroke="${accent}" stroke-width="2" />
      <text x="${cx}" y="${padY + 19}" text-anchor="middle" fill="var(--vscode-foreground, #f5f5f5)" font-size="11" font-weight="700">${escapeHtml(truncateLabel(p.label, 14))}</text>
    </g>`;
    })
    .join('\n    ');

  const msgSvgs = messages
    .map((m, idx) => {
      const x1 = xById.get(m.from);
      const x2 = xById.get(m.to);
      if (x1 === undefined || x2 === undefined) {
        return '';
      }
      const y = padY + headerH + 26 + idx * msgStep;
      const dash = m.dashed ? ' stroke-dasharray="5,4"' : '';
      return `<g>
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="rgba(255,255,255,0.6)" stroke-width="2"${dash} marker-end="url(#nibbl-arrow)" />
      <text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle" fill="var(--vscode-foreground, #f5f5f5)" font-size="10.5" font-weight="600">${escapeHtml(truncateLabel(m.text, 24))}</text>
    </g>`;
    })
    .join('\n    ');

  return `<svg class="nibbl-mermaid-svg" viewBox="0 0 ${totalW} ${totalH}" width="100%" role="img" aria-label="Sequence Diagram" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="nibbl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(255,255,255,0.7)" />
      </marker>
    </defs>
    ${headerSvgs}
    ${msgSvgs}
  </svg>`;
}

/**
 * Converts a Mermaid DSL string into a safe, theme-adaptive inline SVG.
 * Returns `null` if the diagram fails security checks or cannot be parsed.
 */
export function renderMermaidToSvg(rawDsl?: string): string | null {
  const safeDsl = sanitizeMermaidDiagram(rawDsl);
  if (!safeDsl) {
    return null;
  }

  if (/^sequenceDiagram\b/i.test(safeDsl)) {
    return renderSequenceSvg(safeDsl);
  }

  const parsed = parseFlowchart(safeDsl);
  if (!parsed) {
    return null;
  }

  return renderFlowchartSvg(parsed.direction, parsed.nodes, parsed.edges);
}
