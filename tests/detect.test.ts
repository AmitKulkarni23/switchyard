import { expect, test } from "bun:test";
import { detect, UnsupportedFormatError } from "../backend/detect";

const fixture = async (name: string) => new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer());
const text = (s: string) => new TextEncoder().encode(s);

test("detects each fixture from content", async () => {
  expect(await detect(await fixture("aws-invoice.pdf"))).toBe("aws-invoice-pdf");
  expect(await detect(await fixture("aws-cur.csv"))).toBe("aws-cur-csv");
  expect(await detect(await fixture("focus.csv"))).toBe("focus-csv");
});

test("CUR 2.0 snake_case headers are recognized", async () => {
  expect(await detect(text("line_item_usage_account_id,line_item_unblended_cost\n1,2\n"))).toBe("aws-cur-csv");
});

test("rejects unknown content with a clear error", async () => {
  await expect(detect(crypto.getRandomValues(new Uint8Array(512)).map((b, i) => (i === 0 ? 0 : b)))).rejects.toThrow(UnsupportedFormatError);
  await expect(detect(text("name,email\nAda,ada@example.com\n"))).rejects.toThrow(/matches no known bill CSV header/);
  await expect(detect(text("%PDF-1.4 garbage"))).rejects.toThrow(UnsupportedFormatError);
});
