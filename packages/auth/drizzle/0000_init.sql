CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TABLE "auth"."connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"provider" varchar(24) NOT NULL,
	"account" text,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"secret_enc" text,
	"key_id" varchar(16),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" varchar(24) NOT NULL,
	"method" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"secret_enc" text NOT NULL,
	"key_id" varchar(16) NOT NULL,
	"webhook_secret_enc" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "connections_owner_provider_idx" ON "auth"."connections" USING btree ("owner_id","provider");--> statement-breakpoint
CREATE INDEX "connections_tenant_idx" ON "auth"."connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_tenant_provider_idx" ON "auth"."credentials" USING btree ("tenant_id","provider");