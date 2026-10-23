-- Baseline of the existing schema, before issue #7.
-- Existing databases must mark this migration applied; see prisma/README.md.

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#71717a',
    "accent" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "domainId" TEXT,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "energy" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#71717a',
    "icon" TEXT,
    "domainId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'related',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#71717a',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TagOnItem" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "TagOnItem_pkey" PRIMARY KEY ("itemId", "tagId")
);

CREATE TABLE "HabitLog" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "weekStart" TIMESTAMP(3),
    "weekEnd" TIMESTAMP(3),
    "wins" TEXT,
    "challenges" TEXT,
    "learnings" TEXT,
    "priorities" TEXT,
    "gratitude" TEXT,
    "mood" INTEGER,
    "energy" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReviewItem" (
    "reviewId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("reviewId", "itemId")
);

CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'notification',
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "Domain_key_key" ON "Domain"("key");

CREATE INDEX "Item_type_idx" ON "Item"("type");

CREATE INDEX "Item_status_idx" ON "Item"("status");

CREATE INDEX "Item_domainId_idx" ON "Item"("domainId");

CREATE INDEX "Item_projectId_idx" ON "Item"("projectId");

CREATE INDEX "Item_dueDate_idx" ON "Item"("dueDate");

CREATE INDEX "Item_scheduledAt_idx" ON "Item"("scheduledAt");

CREATE INDEX "Project_status_idx" ON "Project"("status");

CREATE INDEX "Project_domainId_idx" ON "Project"("domainId");

CREATE UNIQUE INDEX "Link_fromId_toId_type_key" ON "Link"("fromId", "toId", "type");

CREATE INDEX "Link_fromId_idx" ON "Link"("fromId");

CREATE INDEX "Link_toId_idx" ON "Link"("toId");

CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

CREATE UNIQUE INDEX "HabitLog_itemId_date_key" ON "HabitLog"("itemId", "date");

CREATE INDEX "HabitLog_itemId_date_idx" ON "HabitLog"("itemId", "date");

CREATE INDEX "Review_type_date_idx" ON "Review"("type", "date");

CREATE INDEX "Reminder_remindAt_idx" ON "Reminder"("remindAt");

ALTER TABLE "Item" ADD CONSTRAINT "Item_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Item" ADD CONSTRAINT "Item_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Link" ADD CONSTRAINT "Link_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Link" ADD CONSTRAINT "Link_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TagOnItem" ADD CONSTRAINT "TagOnItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TagOnItem" ADD CONSTRAINT "TagOnItem_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HabitLog" ADD CONSTRAINT "HabitLog_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
