CREATE SCHEMA IF NOT EXISTS "seq";
--> statement-breakpoint
CREATE TYPE "seq"."enrollment_status" AS ENUM('active', 'paused', 'waiting_limit', 'completed', 'exited', 'failed');--> statement-breakpoint
CREATE TYPE "seq"."linkedin_state" AS ENUM('none', 'pending', 'connected', 'declined_or_ignored', 'withdrawn');--> statement-breakpoint
CREATE TYPE "seq"."run_status" AS ENUM('running', 'waiting', 'done', 'deferred', 'skipped', 'failed', 'needs_review', 'skipped_dry_run');--> statement-breakpoint
CREATE TYPE "seq"."sequence_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "seq"."signal_kind" AS ENUM('reply', 'bounce', 'complaint', 'opt_out', 'ooo', 'task_completed', 'call_connected', 'meeting_booked', 'connection_accepted', 'sender_channel_status', 'contact_suppressed', 'crm_changed');--> statement-breakpoint
CREATE TYPE "seq"."version_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "seq"."api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" varchar(80) NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" varchar(12) NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "seq"."contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"email" varchar(320),
	"phone" varchar(24),
	"linkedin_url" text,
	"country" varchar(2),
	"timezone" varchar(48),
	"sms_consent" boolean DEFAULT false NOT NULL,
	"sms_consent_at" timestamp with time zone,
	"sms_consent_source" text,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"version_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"enrolled_by" varchar(64),
	"enrolled_by_kind" text DEFAULT 'user' NOT NULL,
	"mode" text DEFAULT 'live' NOT NULL,
	"status" "seq"."enrollment_status" DEFAULT 'active' NOT NULL,
	"current_node_id" varchar(64) NOT NULL,
	"next_run_at" timestamp with time zone,
	"owner_run_id" text,
	"waiting" jsonb,
	"paused_until" timestamp with time zone,
	"pause_reason" text,
	"exit_reason" text,
	"exit_signal_id" text,
	"replied_at" timestamp with time zone,
	"replied_channel" varchar(16),
	"meeting_booked_at" timestamp with time zone,
	"meeting_channel" varchar(16),
	"touch_count" smallint DEFAULT 0 NOT NULL,
	"last_touch_at" timestamp with time zone,
	"seq" integer DEFAULT 0 NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."flags" (
	"project_id" text NOT NULL,
	"key" text NOT NULL,
	"value" boolean NOT NULL,
	"updated_by" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."idempotency_keys" (
	"project_id" text NOT NULL,
	"key" varchar(128) NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" smallint NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."job_locks" (
	"job" text PRIMARY KEY NOT NULL,
	"holder" text,
	"locked_until" timestamp with time zone DEFAULT 'epoch' NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seq"."linkedin_connections" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"state" "seq"."linkedin_state" DEFAULT 'none' NOT NULL,
	"invited_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"state_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(12) DEFAULT 'task' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"run_id" text,
	"channel" varchar(16) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body" text,
	"status" varchar(16) NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_id" text,
	"thread_ref" text,
	"message_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."projects" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" varchar(120) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "seq"."queue_dead" (
	"id" bigint PRIMARY KEY NOT NULL,
	"queue" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"read_ct" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"dead_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."queue_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"queue" varchar(32) NOT NULL,
	"payload" jsonb NOT NULL,
	"visible_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_ct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"version_id" text NOT NULL,
	"node_id" varchar(64) NOT NULL,
	"node_type" varchar(32) NOT NULL,
	"channel" varchar(16),
	"action" varchar(24),
	"touch_number" smallint,
	"attempt" smallint DEFAULT 1 NOT NULL,
	"status" "seq"."run_status" NOT NULL,
	"idempotency_key" text NOT NULL,
	"next" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"provider" varchar(24),
	"provider_ref" text,
	"thread_ref" text,
	"branch" varchar(32),
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"sender_id" text NOT NULL,
	"enqueued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "seq"."sender_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"project_id" text NOT NULL,
	"connection_id" text,
	"channel" varchar(16) NOT NULL,
	"address" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"daily_limit" integer,
	"weekly_limit" integer,
	"min_gap_seconds" integer DEFAULT 0 NOT NULL,
	"opted_in_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."senders" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"external_id" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(320),
	"timezone" varchar(48) DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"external_id" varchar(64),
	"name" varchar(160) NOT NULL,
	"description" text,
	"created_by" varchar(64),
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "seq"."sequence_status" DEFAULT 'active' NOT NULL,
	"default_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."signal_effects" (
	"signal_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"effect" varchar(16) NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."signals" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"kind" "seq"."signal_kind" NOT NULL,
	"channel" varchar(16),
	"source" varchar(24) NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"attributed_run_id" text,
	"attribution" varchar(8)
);
--> statement-breakpoint
CREATE TABLE "seq"."suppressions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"channel" varchar(16) NOT NULL,
	"reason" varchar(24) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"run_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"kind" varchar(32) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"due_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"outcome" varchar(32),
	"note" text,
	"connected_outcomes" text[] DEFAULT '{}' NOT NULL,
	"branches_by_outcome" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"on_completed" varchar(64),
	"on_expired" varchar(64),
	"dialer" boolean DEFAULT false NOT NULL,
	"auto_complete" boolean DEFAULT true NOT NULL,
	"dialer_pushed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "seq"."versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"tag" varchar(24) NOT NULL,
	"status" "seq"."version_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"based_on_version_id" text,
	"created_by" varchar(64),
	"published_by" varchar(64),
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seq"."webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" varchar(48) NOT NULL,
	"enrollment_id" text,
	"payload" jsonb NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_status_code" smallint,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "seq"."webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"url" text NOT NULL,
	"secret_enc" text NOT NULL,
	"key_id" varchar(16) NOT NULL,
	"event_types" text[] NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"disabled_reason" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seq"."api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."contacts" ADD CONSTRAINT "contacts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."enrollments" ADD CONSTRAINT "enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "seq"."sequences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."enrollments" ADD CONSTRAINT "enrollments_version_id_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "seq"."versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."enrollments" ADD CONSTRAINT "enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."enrollments" ADD CONSTRAINT "enrollments_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "seq"."senders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."flags" ADD CONSTRAINT "flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."linkedin_connections" ADD CONSTRAINT "linkedin_connections_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."linkedin_connections" ADD CONSTRAINT "linkedin_connections_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "seq"."senders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."messages" ADD CONSTRAINT "messages_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "seq"."senders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."messages" ADD CONSTRAINT "messages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "seq"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."runs" ADD CONSTRAINT "runs_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "seq"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."sender_channels" ADD CONSTRAINT "sender_channels_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "seq"."senders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."senders" ADD CONSTRAINT "senders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."sequences" ADD CONSTRAINT "sequences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."signal_effects" ADD CONSTRAINT "signal_effects_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "seq"."signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."signal_effects" ADD CONSTRAINT "signal_effects_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "seq"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."signals" ADD CONSTRAINT "signals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."signals" ADD CONSTRAINT "signals_attributed_run_id_runs_id_fk" FOREIGN KEY ("attributed_run_id") REFERENCES "seq"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."suppressions" ADD CONSTRAINT "suppressions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD CONSTRAINT "tasks_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "seq"."enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD CONSTRAINT "tasks_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "seq"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD CONSTRAINT "tasks_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "seq"."senders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD CONSTRAINT "tasks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "seq"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."versions" ADD CONSTRAINT "versions_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "seq"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "seq"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seq"."webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "seq"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_project_idx" ON "seq"."api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_external_idx" ON "seq"."contacts" USING btree ("project_id","external_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "seq"."contacts" USING btree ("project_id",lower("email"));--> statement-breakpoint
CREATE INDEX "contacts_phone_idx" ON "seq"."contacts" USING btree ("project_id","phone");--> statement-breakpoint
CREATE INDEX "contacts_updated_idx" ON "seq"."contacts" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_one_active_idx" ON "seq"."enrollments" USING btree ("project_id","contact_id") WHERE "seq"."enrollments"."status" in ('active','paused','waiting_limit');--> statement-breakpoint
CREATE INDEX "enrollments_due_idx" ON "seq"."enrollments" USING btree ("sender_id","next_run_at") WHERE "seq"."enrollments"."status" = 'active' and "seq"."enrollments"."next_run_at" is not null;--> statement-breakpoint
CREATE INDEX "enrollments_seq_idx" ON "seq"."enrollments" USING btree ("sequence_id","status");--> statement-breakpoint
CREATE INDEX "enrollments_contact_idx" ON "seq"."enrollments" USING btree ("contact_id","finished_at");--> statement-breakpoint
CREATE INDEX "enrollments_contact_touch_idx" ON "seq"."enrollments" USING btree ("contact_id","last_touch_at");--> statement-breakpoint
CREATE INDEX "enrollments_paused_idx" ON "seq"."enrollments" USING btree ("paused_until") WHERE "seq"."enrollments"."status" = 'paused' and "seq"."enrollments"."paused_until" is not null;--> statement-breakpoint
CREATE INDEX "enrollments_project_updated_idx" ON "seq"."enrollments" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flags_pk" ON "seq"."flags" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_pk" ON "seq"."idempotency_keys" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "linkedin_connections_pair_idx" ON "seq"."linkedin_connections" USING btree ("contact_id","sender_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_idx" ON "seq"."messages" USING btree ("project_id","provider","provider_id");--> statement-breakpoint
CREATE INDEX "messages_contact_idx" ON "seq"."messages" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "messages_sender_out_idx" ON "seq"."messages" USING btree ("sender_id","channel","occurred_at") WHERE "seq"."messages"."direction" = 'out';--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "seq"."messages" USING btree ("thread_ref") WHERE "seq"."messages"."thread_ref" is not null;--> statement-breakpoint
CREATE INDEX "messages_message_id_idx" ON "seq"."messages" USING btree ("message_id") WHERE "seq"."messages"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "queue_ready_idx" ON "seq"."queue_messages" USING btree ("queue","visible_at");--> statement-breakpoint
CREATE INDEX "runs_enrollment_idx" ON "seq"."runs" USING btree ("enrollment_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_stuck_idx" ON "seq"."runs" USING btree ("status","started_at") WHERE "seq"."runs"."status" in ('running','needs_review');--> statement-breakpoint
CREATE INDEX "runs_provider_idx" ON "seq"."runs" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "runs_thread_idx" ON "seq"."runs" USING btree ("thread_ref") WHERE "seq"."runs"."thread_ref" is not null;--> statement-breakpoint
CREATE INDEX "runs_analytics_idx" ON "seq"."runs" USING btree ("sequence_id","version_id","node_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sender_channels_sender_channel_idx" ON "seq"."sender_channels" USING btree ("sender_id","channel");--> statement-breakpoint
CREATE INDEX "sender_channels_address_idx" ON "seq"."sender_channels" USING btree ("project_id","channel","address");--> statement-breakpoint
CREATE UNIQUE INDEX "senders_external_idx" ON "seq"."senders" USING btree ("project_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequences_name_idx" ON "seq"."sequences" USING btree ("project_id",lower("name")) WHERE "seq"."sequences"."status" <> 'archived';--> statement-breakpoint
CREATE UNIQUE INDEX "signal_effects_pk" ON "seq"."signal_effects" USING btree ("signal_id","enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signals_source_idx" ON "seq"."signals" USING btree ("project_id","source","external_id");--> statement-breakpoint
CREATE INDEX "signals_unprocessed_idx" ON "seq"."signals" USING btree ("received_at") WHERE "seq"."signals"."processed_at" is null;--> statement-breakpoint
CREATE INDEX "signals_contact_idx" ON "seq"."signals" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "signals_run_idx" ON "seq"."signals" USING btree ("attributed_run_id") WHERE "seq"."signals"."attributed_run_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_contact_channel_idx" ON "seq"."suppressions" USING btree ("contact_id","channel");--> statement-breakpoint
CREATE INDEX "tasks_sender_open_idx" ON "seq"."tasks" USING btree ("sender_id","status","due_at");--> statement-breakpoint
CREATE INDEX "tasks_contact_idx" ON "seq"."tasks" USING btree ("contact_id","kind","completed_at");--> statement-breakpoint
CREATE INDEX "tasks_project_updated_idx" ON "seq"."tasks" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "tasks_expiry_idx" ON "seq"."tasks" USING btree ("expires_at") WHERE "seq"."tasks"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "versions_sequence_tag_idx" ON "seq"."versions" USING btree ("sequence_id","tag");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_endpoint_event_idx" ON "seq"."webhook_deliveries" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "seq"."webhook_deliveries" USING btree ("next_attempt_at") WHERE "seq"."webhook_deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_enrollment_idx" ON "seq"."webhook_deliveries" USING btree ("endpoint_id","enrollment_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_project_idx" ON "seq"."webhook_endpoints" USING btree ("project_id");