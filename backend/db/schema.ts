import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { Workload } from "../schema";

/** Derived workloads for share links. Never the raw bill. */
export const estimates = pgTable("estimates", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  workload: jsonb("workload").$type<Workload>().notNull(),
});

/** Design drafts keyed by idea + rulebook + models: the same idea never costs twice and always gets the same answer. */
export const designDrafts = pgTable("design_drafts", {
  cacheKey: text("cache_key").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  escalated: boolean("escalated").notNull(),
  result: jsonb("result").notNull(),
});
