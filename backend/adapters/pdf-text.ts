import { getDocumentProxy } from "unpdf";

export type PdfLine = { x: number; text: string };

const MAX_PAGES = 500; // far above a real invoice
const parsed = new WeakMap<Uint8Array, Promise<PdfLine[]>>(); // detect and the adapter read the same bytes: parse once

/**
 * Deterministic text lines: items grouped by baseline, left to right. Touching items are joined
 * directly (AWS splits words around "fi" ligatures), near ones with a space, columns with two spaces.
 */
export function pdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  let lines = parsed.get(bytes);
  if (!lines) parsed.set(bytes, (lines = readLines(bytes)));
  return lines;
}

async function readLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const pdf = await getDocumentProxy(bytes.slice());
  if (pdf.numPages > MAX_PAGES) throw new Error(`too many pages: ${pdf.numPages}`);
  const out: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; w: number; str: string }[]>();
    for (const it of items as { str: string; transform: number[]; width: number }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]!);
      const row = byY.get(y) ?? [];
      row.push({ x: it.transform[4]!, w: it.width ?? 0, str: it.str });
      byY.set(y, row);
    }
    for (const [, parts] of [...byY].sort((a, b) => b[0] - a[0])) {
      parts.sort((a, b) => a.x - b.x);
      let text = "";
      parts.forEach((part, i) => {
        if (i > 0) {
          const prev = parts[i - 1]!;
          const gap = part.x - (prev.x + prev.w);
          text = gap < 1 ? text : gap < 4 ? text.trimEnd() + " " : text.trimEnd() + "  ";
        }
        text += i === 0 ? part.str.trimStart() : part.str;
      });
      out.push({ x: Math.round(parts[0]!.x), text: text.trim().replace(/ {3,}/g, "  ") });
    }
  }
  return out;
}
