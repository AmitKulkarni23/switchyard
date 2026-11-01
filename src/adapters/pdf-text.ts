import { getDocumentProxy } from "unpdf";

export type PdfLine = { x: number; text: string };

/** Deterministic text lines: items grouped by baseline, left to right, columns joined by two spaces. */
export async function pdfLines(bytes: Uint8Array): Promise<PdfLine[]> {
  const pdf = await getDocumentProxy(bytes.slice());
  const out: PdfLine[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const it of items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]!);
      byY.set(y, [...(byY.get(y) ?? []), { x: it.transform[4]!, str: it.str.trim() }]);
    }
    for (const [, parts] of [...byY].sort((a, b) => b[0] - a[0])) {
      parts.sort((a, b) => a.x - b.x);
      out.push({ x: Math.round(parts[0]!.x), text: parts.map((p) => p.str).join("  ") });
    }
  }
  return out;
}
