import { normHeader, parseCsv } from "./adapters/csv";
import { pdfLines } from "./adapters/pdf-text";
import type { FileFormat as Format } from "./schema";

export class UnsupportedFormatError extends Error {
  constructor(detail: string) {
    super(`Unsupported file: ${detail} SwitchYard reads AWS invoice PDFs, which you can download from the AWS Billing console.`);
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** Identify the bill format from file content only. Never looks at the file name. */
export async function detect(bytes: Uint8Array): Promise<Format> {
  if (PDF_MAGIC.every((b, i) => bytes[i] === b)) {
    let lines;
    try {
      lines = await pdfLines(bytes);
    } catch {
      throw new UnsupportedFormatError("this PDF could not be read.");
    }
    if (lines.some((l) => /Amazon Web Services/i.test(l.text))) return "aws-invoice-pdf";
    throw new UnsupportedFormatError("this PDF is not an AWS invoice.");
  }
  if (bytes.includes(0)) throw new UnsupportedFormatError("this is not a PDF.");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64 * 1024));
  const header = new Set((parseCsv(text.split(/\r?\n/, 1)[0] ?? "")[0] ?? []).map(normHeader));
  if (header.has("lineitemunblendedcost")) return "aws-cur-csv";
  if (header.has("billedcost") && header.has("servicename")) return "focus-csv";
  throw new UnsupportedFormatError("this is not a PDF.");
}
