/** Returns an error's message, or the value as a string. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Railway reads this field to colour and filter log lines (`@level:error`). */
type Level = "debug" | "info" | "warn" | "error";

/** One JSON line on stdout. `time`, `level` and `event` go last so a field can never override them. */
function write(level: Level, event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ...fields, time: new Date().toISOString(), level, event }));
}

/**
 * Structured logger: `log.info("server_started", { url })`.
 * Never pass bill content, idea text, client IPs or secrets in `fields`.
 */
export const log = {
  debug: (event: string, fields: Record<string, unknown> = {}): void => {
    if (process.env.NODE_ENV !== "production" || process.env.LOG_LEVEL === "debug") write("debug", event, fields);
  },
  info: (event: string, fields: Record<string, unknown> = {}): void => write("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}): void => write("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}): void => write("error", event, fields),
};
