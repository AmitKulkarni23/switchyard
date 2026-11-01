/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. Returns rows of strings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((v) => v !== ""));
}

/** "lineItem/UnblendedCost" and "line_item_unblended_cost" both become "lineitemunblendedcost". */
export const normHeader = (h: string) => h.replace(/^﻿/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Rows as objects keyed by normalized header. */
export function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map(normHeader);
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])));
}

export const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : Number(s.replace(/[$,]/g, "")));
