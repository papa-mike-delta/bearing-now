-- Preserve all existing explicit colors. New projects inherit the active theme.
ALTER TABLE "Project" ALTER COLUMN "color" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "color" DROP NOT NULL;
