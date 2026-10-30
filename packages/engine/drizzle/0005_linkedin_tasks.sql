ALTER TABLE "seq"."contacts" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD COLUMN "complete_on_open" varchar(32);--> statement-breakpoint
ALTER TABLE "seq"."tasks" ADD COLUMN "opened_at" timestamp with time zone;