// Interactivity markers from the precise mode: `\htmlData{lbid=N}{…}` around subterms.

const OPEN = '\\htmlData{';

export interface Marker {
  /** Index of `\htmlData`. */
  start: number;
  /** Index just after the `{` that opens the content. */
  contentStart: number;
  /** Index of the `}` that closes the content. */
  close: number;
}

/** Finds all markers (well-formed ones only), outermost first by position. */
export function findMarkers(latex: string): Marker[] {
  const markers: Marker[] = [];
  let i = latex.indexOf(OPEN);
  while (i >= 0) {
    const headerEnd = latex.indexOf('}{', i + OPEN.length);
    if (headerEnd < 0) break;
    const contentStart = headerEnd + 2;
    let depth = 1;
    let j = contentStart;
    while (j < latex.length && depth > 0) {
      if (latex[j] === '\\') {
        j += 2;
        continue;
      }
      if (latex[j] === '{') depth++;
      else if (latex[j] === '}') depth--;
      if (depth > 0) j++;
    }
    if (depth === 0) markers.push({ start: i, contentStart, close: j });
    i = latex.indexOf(OPEN, i + OPEN.length);
  }
  return markers;
}

/** Removes the given markers (keeping their contents). */
export function removeMarkers(latex: string, markers: Marker[]): string {
  const drop = new Set<number>();
  for (const m of markers) {
    for (let k = m.start; k < m.contentStart; k++) drop.add(k);
    drop.add(m.close);
  }
  let out = '';
  for (let k = 0; k < latex.length; k++) if (!drop.has(k)) out += latex[k];
  return out;
}

/** LaTeX without any interactivity markers (for copying and exporting). */
export function stripMarkers(latex: string): string {
  return latex.includes(OPEN) ? removeMarkers(latex, findMarkers(latex)) : latex;
}
