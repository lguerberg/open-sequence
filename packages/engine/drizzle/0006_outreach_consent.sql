ALTER TABLE "seq"."contacts" RENAME COLUMN "sms_consent" TO "outreach_consent";--> statement-breakpoint
ALTER TABLE "seq"."contacts" RENAME COLUMN "sms_consent_at" TO "outreach_consent_at";--> statement-breakpoint
ALTER TABLE "seq"."contacts" RENAME COLUMN "sms_consent_source" TO "outreach_consent_source";