ALTER TABLE "cases" ADD COLUMN "terminated_at" date;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "in_force_status" text;