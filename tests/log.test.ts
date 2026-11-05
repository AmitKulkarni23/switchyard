import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { errorMessage, log } from "../backend/log";

const out = spyOn(console, "log").mockImplementation(() => {});
beforeAll(() => out.mockImplementation(() => {}));
afterEach(() => out.mockClear());
afterAll(() => out.mockRestore());

function lastLine(): Record<string, unknown> {
  const arg: unknown = out.mock.calls.at(-1)?.[0];
  if (typeof arg !== "string") throw new Error("expected one string log line");
  return JSON.parse(arg);
}

describe("log", () => {
  it("writes one JSON line with level, event, time and fields", () => {
    log.warn("draft_cache_read_failed", { error: "timeout" });
    expect(out).toHaveBeenCalledTimes(1);
    expect(lastLine()).toMatchObject({ level: "warn", event: "draft_cache_read_failed", error: "timeout" });
    expect(Date.parse(String(lastLine().time))).not.toBeNaN();
  });

  it("keeps the real level, event and time when fields use the same names", () => {
    log.info("upload_parsed", { level: "error", event: "spoofed", time: "spoofed" });
    expect(lastLine()).toMatchObject({ level: "info", event: "upload_parsed" });
    expect(lastLine().time).not.toBe("spoofed");
  });

  describe("in production", () => {
    const before = { NODE_ENV: process.env.NODE_ENV, LOG_LEVEL: process.env.LOG_LEVEL };
    afterEach(() => {
      process.env.NODE_ENV = before.NODE_ENV;
      if (before.LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = before.LOG_LEVEL;
    });

    it("drops debug lines but keeps every other level", () => {
      process.env.NODE_ENV = "production";
      delete process.env.LOG_LEVEL;
      log.debug("x");
      expect(out).not.toHaveBeenCalled();
      log.info("x");
      log.warn("x");
      log.error("x");
      expect(out).toHaveBeenCalledTimes(3);
    });

    it("keeps debug lines when LOG_LEVEL asks for them", () => {
      process.env.NODE_ENV = "production";
      process.env.LOG_LEVEL = "debug";
      log.debug("x");
      expect(lastLine().level).toBe("debug");
    });
  });
});

describe("errorMessage", () => {
  it("returns an Error's message, or anything else as a string", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(50001)).toBe("50001");
  });
});
