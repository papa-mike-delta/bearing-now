-- Own root rows by user. Children stay global because their parent ids are unique.
-- No DELETE. An empty database needs no owner. Otherwise Paul must already exist.

ALTER TABLE "Domain" ADD COLUMN "userId" TEXT;
ALTER TABLE "Item" ADD COLUMN "userId" TEXT;
ALTER TABLE "Project" ADD COLUMN "userId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "userId" TEXT;
ALTER TABLE "Review" ADD COLUMN "userId" TEXT;
ALTER TABLE "Setting" ADD COLUMN "userId" TEXT;
ALTER TABLE "OperationLedger" ADD COLUMN "userId" TEXT;

DO $$
DECLARE
  owner TEXT;
  pending INTEGER;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM "Domain") +
    (SELECT COUNT(*) FROM "Item") +
    (SELECT COUNT(*) FROM "Project") +
    (SELECT COUNT(*) FROM "Tag") +
    (SELECT COUNT(*) FROM "Review") +
    (SELECT COUNT(*) FROM "Setting") +
    (SELECT COUNT(*) FROM "OperationLedger")
  INTO pending;

  IF pending = 0 THEN
    RETURN;
  END IF;

  SELECT id INTO owner FROM "User" WHERE email = 'pauldevey91@gmail.com' LIMIT 1;
  IF owner IS NULL THEN
    SELECT id INTO owner FROM "User" WHERE name = 'pauldevey91' ORDER BY "createdAt" ASC LIMIT 1;
  END IF;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'per-user migration requires user pauldevey91@gmail.com or name pauldevey91';
  END IF;

  UPDATE "Domain" SET "userId" = owner WHERE "userId" IS NULL;
  UPDATE "Item" SET "userId" = owner WHERE "userId" IS NULL;
  UPDATE "Project" SET "userId" = owner WHERE "userId" IS NULL;
  UPDATE "Tag" SET "userId" = owner WHERE "userId" IS NULL;
  UPDATE "Review" SET "userId" = owner WHERE "userId" IS NULL;
  UPDATE "Setting" SET "userId" = owner WHERE "userId" IS NULL;

  UPDATE "OperationLedger" AS ledger
  SET "userId" = account.id
  FROM "User" AS account
  WHERE ledger."userId" IS NULL
    AND ledger.actor = 'user:' || account.id;

  UPDATE "OperationLedger" SET "userId" = owner WHERE "userId" IS NULL;
END $$;

ALTER TABLE "Domain" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Item" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Tag" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Review" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Setting" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "OperationLedger" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationLedger" ADD CONSTRAINT "OperationLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "Domain_key_key";
CREATE UNIQUE INDEX "Domain_userId_key_key" ON "Domain"("userId", "key");

DROP INDEX "Tag_name_key";
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

CREATE INDEX "Item_userId_idx" ON "Item"("userId");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "Review_userId_idx" ON "Review"("userId");
CREATE INDEX "Setting_userId_idx" ON "Setting"("userId");
CREATE INDEX "OperationLedger_userId_actor_operation_status_createdAt_idx"
  ON "OperationLedger"("userId", "actor", "operation", "status", "createdAt");
