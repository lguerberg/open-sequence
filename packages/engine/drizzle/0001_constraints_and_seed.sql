-- Hand-written, applied once by the migrator. Things Drizzle's schema cannot express.

-- The circular foreign key: a sequence points at its default version.
ALTER TABLE "seq"."sequences"
  ADD CONSTRAINT "sequences_default_version_fk"
  FOREIGN KEY ("default_version_id") REFERENCES "seq"."versions"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- A published or archived definition can never change.
CREATE OR REPLACE FUNCTION seq.version_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF old.status <> 'draft' AND new.definition IS DISTINCT FROM old.definition THEN
    RAISE EXCEPTION 'version % is % and cannot be edited', old.id, old.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN new;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS version_immutable_t ON "seq"."versions";
--> statement-breakpoint
CREATE TRIGGER version_immutable_t BEFORE UPDATE ON "seq"."versions"
  FOR EACH ROW EXECUTE FUNCTION seq.version_immutable();
--> statement-breakpoint

-- The scheduler's lease rows.
INSERT INTO "seq"."job_locks" ("job") VALUES ('plan'), ('signals'), ('poll'), ('reap'), ('retention'), ('webhooks')
  ON CONFLICT DO NOTHING;
