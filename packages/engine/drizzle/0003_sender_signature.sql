-- Hand-written, applied once by the migrator. The sender's email signature.
ALTER TABLE "seq"."senders" ADD COLUMN IF NOT EXISTS "signature_html" text;
--> statement-breakpoint
ALTER TABLE "seq"."senders" ADD COLUMN IF NOT EXISTS "signature_text" text;
