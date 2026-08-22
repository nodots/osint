CREATE TABLE "assessment_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"assessment_id" integer NOT NULL,
	"previous_assessment_id" integer,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta_risk" double precision NOT NULL,
	"delta_vulnerability" double precision NOT NULL,
	"delta_resistance" double precision,
	"delta_pressure" double precision,
	"delta_competitiveness" double precision NOT NULL,
	"delta_pivotality" double precision NOT NULL,
	"dimension_deltas" jsonb,
	"new_event_ids" integer[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assessment_changes" ADD CONSTRAINT "assessment_changes_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_changes" ADD CONSTRAINT "assessment_changes_assessment_id_race_risk_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."race_risk_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_changes" ADD CONSTRAINT "assessment_changes_previous_assessment_id_race_risk_assessments_id_fk" FOREIGN KEY ("previous_assessment_id") REFERENCES "public"."race_risk_assessments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_changes_time" ON "assessment_changes" USING btree ("changed_at");