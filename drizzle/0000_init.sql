CREATE TABLE "estimates" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workload" jsonb NOT NULL
);
