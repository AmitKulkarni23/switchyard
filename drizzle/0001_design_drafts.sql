CREATE TABLE "design_drafts" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"escalated" boolean NOT NULL,
	"result" jsonb NOT NULL
);
