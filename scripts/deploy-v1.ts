import { execFileSync } from "node:child_process";
// This command is deliberately absent from build:vercel and the legacy migration path.
if (process.env.BEARING_V1_SCHEMA_REVIEWED !== "yes")
  throw new Error(
    "Review the V1 schema on a disposable database, then set BEARING_V1_SCHEMA_REVIEWED=yes for this deployment",
  );
execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "prisma/v1/schema.prisma",
  ],
  { stdio: "inherit" },
);
