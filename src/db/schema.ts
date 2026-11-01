import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Workload } from "../schema";

/** Derived workloads for share links. Never the raw bill. */
export const estimates = pgTable("estimates", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  workload: jsonb("workload").$type<Workload>().notNull(),
});
