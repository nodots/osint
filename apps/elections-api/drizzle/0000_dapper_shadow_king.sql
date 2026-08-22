CREATE TABLE "actors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" text NOT NULL,
	"name" text NOT NULL,
	"jurisdiction" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"docket_number" text,
	"court" text,
	"jurisdiction" text,
	"filed_at" date,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"plaintiffs" text[] DEFAULT '{}' NOT NULL,
	"defendants" text[] DEFAULT '{}' NOT NULL,
	"affected_mechanisms" text[] DEFAULT '{}' NOT NULL,
	"affected_states" text[] DEFAULT '{}' NOT NULL,
	"affected_race_ids" integer[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "court_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" integer NOT NULL,
	"date" date NOT NULL,
	"action_type" text NOT NULL,
	"outcome" text,
	"source_id" integer
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"district_number" integer NOT NULL,
	"display_name" text NOT NULL,
	"cycle" integer NOT NULL,
	"geom" geography(MultiPolygon,4326),
	"current_member" text,
	"incumbent_party" text,
	"cook_pvi" text,
	"population" integer
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"election_type" text NOT NULL,
	"cycle" integer NOT NULL,
	"election_date" date NOT NULL,
	"status" text DEFAULT 'UPCOMING' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"jurisdiction_type" text NOT NULL,
	"jurisdictions" text[] DEFAULT '{}' NOT NULL,
	"event_types" text[] DEFAULT '{}' NOT NULL,
	"actor_ids" integer[] DEFAULT '{}' NOT NULL,
	"target_ids" integer[] DEFAULT '{}' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"factual_status" text NOT NULL,
	"operational_status" text NOT NULL,
	"confidence" numeric DEFAULT '0.5' NOT NULL,
	"affected_race_ids" integer[] DEFAULT '{}' NOT NULL,
	"affected_mechanisms" text[] DEFAULT '{}' NOT NULL,
	"raw_data" jsonb,
	"entered_by" text,
	"reviewed_by" text,
	"published_at" timestamp with time zone,
	"last_modified_by" text,
	CONSTRAINT "events_confidence_range" CHECK ("events"."confidence" >= 0 AND "events"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"event_id" integer NOT NULL,
	"url" text,
	"title" text,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"excerpt" text,
	"archive_url" text,
	"document_hash" text,
	"primary_source" boolean DEFAULT false NOT NULL,
	"analyst_notes" text
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"source" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"rating" text,
	"margin" double precision,
	CONSTRAINT "forecast_race_source_date" UNIQUE("race_id","source","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"message" text,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "race_risk_assessments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"race_id" integer NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competitiveness" numeric NOT NULL,
	"pivotality" numeric NOT NULL,
	"federal_leverage" numeric NOT NULL,
	"state_cooperation" numeric NOT NULL,
	"administrative_exposure" numeric NOT NULL,
	"voter_roll_exposure" numeric NOT NULL,
	"ballot_exposure" numeric NOT NULL,
	"litigation_exposure" numeric NOT NULL,
	"certification_exposure" numeric NOT NULL,
	"recount_exposure" numeric NOT NULL,
	"congressional_contest_exposure" numeric NOT NULL,
	"process_vulnerability" numeric NOT NULL,
	"subversion_risk" numeric NOT NULL,
	"confidence" numeric DEFAULT '0.5' NOT NULL,
	"explanations" jsonb,
	"triggering_event_ids" integer[] DEFAULT '{}' NOT NULL,
	"methodology_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"election_id" integer NOT NULL,
	"district_id" text NOT NULL,
	"democratic_candidate" text,
	"republican_candidate" text,
	"incumbent_party" text,
	"rating" text,
	"rating_source" text,
	"rating_updated_at" timestamp with time zone,
	"projected_margin" double precision,
	"polling_margin" double precision,
	"actual_margin" double precision,
	"status" text DEFAULT 'GENERAL' NOT NULL,
	CONSTRAINT "races_election_district" UNIQUE("election_id","district_id")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"url" text,
	"source_type" text NOT NULL,
	"reliability_baseline" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_profiles" (
	"state" text PRIMARY KEY NOT NULL,
	"administration_control" text,
	"process_vulnerability" numeric,
	"dimensions" jsonb,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "court_actions" ADD CONSTRAINT "court_actions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "court_actions" ADD CONSTRAINT "court_actions_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "race_risk_assessments" ADD CONSTRAINT "race_risk_assessments_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_court_actions_case" ON "court_actions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "idx_districts_geom" ON "districts" USING gist ("geom");--> statement-breakpoint
CREATE INDEX "idx_districts_state" ON "districts" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_events_occurred" ON "events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_evidence_event" ON "evidence" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_assessments_race_time" ON "race_risk_assessments" USING btree ("race_id","assessed_at");--> statement-breakpoint
CREATE INDEX "idx_races_district" ON "races" USING btree ("district_id");