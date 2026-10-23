BEGIN;

-- Defaults and nullable columns keep existing Items readable without rewriting metadata.
-- Task status, dueDate, and priority already exist and remain the canonical columns.
ALTER TABLE "Item"
    ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "summary" TEXT,
    ADD COLUMN "relationshipTier" TEXT,
    ADD COLUMN "phone" TEXT,
    ADD COLUMN "birthday" DATE,
    ADD COLUMN "startAt" TIMESTAMP(3),
    ADD COLUMN "endAt" TIMESTAMP(3),
    ADD COLUMN "frequency" TEXT;

-- Keep the string representation so existing Link types remain readable.
ALTER TABLE "Link" ALTER COLUMN "type" SET DEFAULT 'related_to';

CREATE INDEX "Link_fromId_type_idx" ON "Link"("fromId", "type");
CREATE INDEX "Link_toId_type_idx" ON "Link"("toId", "type");
CREATE INDEX "Link_type_fromId_idx" ON "Link"("type", "fromId");

-- The composite indexes cover the previous single-column lookups.
DROP INDEX "Link_fromId_idx";
DROP INDEX "Link_toId_idx";

-- Link_fromId_toId_type_key already enforces directed, typed uniqueness.
COMMIT;
