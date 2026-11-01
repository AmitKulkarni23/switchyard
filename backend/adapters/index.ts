import type { FileFormat as Format, FocusRow, UnpricedLine } from "../schema";
import { awsCurCsv } from "./aws-cur-csv";
import { awsInvoicePdf } from "./aws-invoice-pdf";
import { focusCsv } from "./focus-csv";

export type AdapterResult = { provider: string; rows: FocusRow[]; unparsed: UnpricedLine[] };
export type Adapter = (bytes: Uint8Array) => AdapterResult | Promise<AdapterResult>;

export const adapters: Record<Format, Adapter> = {
  "aws-invoice-pdf": awsInvoicePdf,
  "aws-cur-csv": awsCurCsv,
  "focus-csv": focusCsv,
};
