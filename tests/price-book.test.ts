import { expect, test } from "bun:test";
import { railwayPriceBook } from "../backend/data/price-books";

test("railway price book validates and cites its sources", () => {
  expect(railwayPriceBook.rates.vcpu_month).toBe(20);
  expect(railwayPriceBook.sources).toContain("https://railway.com/pricing");
  expect(railwayPriceBook.fetched).toStartWith("2026-11-04");
  expect(railwayPriceBook.plans.map((p) => p.name)).toEqual(["Hobby", "Pro"]);
});
