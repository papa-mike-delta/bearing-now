-- Additive V1 capture fields only; not part of automatic legacy deployment.
ALTER TABLE "V1JournalMoment" ADD COLUMN "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "V1JournalMoment" SET "capturedAt" = "createdAt";
ALTER TABLE "V1JournalMoment" ADD COLUMN "ingestHash" TEXT;
