ALTER TABLE "events" ADD COLUMN "parent_event_id" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "supersedes_event_id" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "related_case_id" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "material" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "race_risk_assessments" ADD COLUMN "institutional_resistance" numeric;--> statement-breakpoint
ALTER TABLE "race_risk_assessments" ADD COLUMN "active_pressure" numeric;