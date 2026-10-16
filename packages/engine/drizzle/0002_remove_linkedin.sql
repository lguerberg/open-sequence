-- Hand-written, idempotent. LinkedIn leaves the product: no channel, no task kinds, no connection state.

-- Rows only LinkedIn produced: a sender's manual linkedin channel, its kill switch, and suppressions
-- on that channel (the contact keeps any email, sms or all-channel suppression).
DELETE FROM "seq"."sender_channels" WHERE "channel" = 'linkedin';
--> statement-breakpoint
DELETE FROM "seq"."flags" WHERE "key" IN ('channel:linkedin', 'channel:linkedin_auto');
--> statement-breakpoint
DELETE FROM "seq"."suppressions" WHERE "channel" = 'linkedin';
--> statement-breakpoint

-- Connection state between a contact and a sender.
DROP TABLE IF EXISTS "seq"."linkedin_connections" CASCADE;
--> statement-breakpoint
DROP TYPE IF EXISTS "seq"."linkedin_state";
--> statement-breakpoint

-- The contact's profile URL.
ALTER TABLE "seq"."contacts" DROP COLUMN IF EXISTS "linkedin_url";
--> statement-breakpoint

-- `connection_accepted` leaves seq.signal_kind. Postgres cannot drop an enum value, so the type is
-- rebuilt without it; signals of that kind (and their effects, by cascade) go first, since the
-- wait_for event they woke no longer exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'seq' AND t.typname = 'signal_kind' AND e.enumlabel = 'connection_accepted'
  ) THEN
    DELETE FROM "seq"."signals" WHERE "kind" = 'connection_accepted';
    ALTER TABLE "seq"."signals" ALTER COLUMN "kind" SET DATA TYPE text;
    DROP TYPE "seq"."signal_kind";
    CREATE TYPE "seq"."signal_kind" AS ENUM('reply', 'bounce', 'complaint', 'opt_out', 'ooo', 'task_completed', 'call_connected', 'meeting_booked', 'sender_channel_status', 'contact_suppressed', 'crm_changed');
    ALTER TABLE "seq"."signals" ALTER COLUMN "kind" SET DATA TYPE "seq"."signal_kind" USING "kind"::"seq"."signal_kind";
  END IF;
END $$;
