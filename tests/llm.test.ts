import { expect, spyOn, test } from "bun:test";
import { classifyUnparsed, fallbackConfig } from "../backend/llm/fallback";

const line = { description: "$0.015 per shard hour", service: "Amazon Kinesis", cost: 10.8, reason: "no mapping" };

test("default config is disabled and never calls the network", async () => {
  const fetchSpy = spyOn(globalThis, "fetch");
  expect(fallbackConfig({})).toEqual({ enabled: false, apiKey: undefined });
  expect(await classifyUnparsed([line], fallbackConfig({}))).toEqual([]);
  expect(fallbackConfig({ LLM_FALLBACK_ENABLED: "true" }).enabled).toBe(false); // no key → still off
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

test("enabling it in v1 fails loudly instead of guessing", async () => {
  await expect(classifyUnparsed([line], { enabled: true, apiKey: "k" })).rejects.toThrow(/not implemented/);
});
