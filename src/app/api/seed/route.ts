import { bad } from "@/lib/auth-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Shared demo seed is retired. Examples are a per-account Settings action. */
export async function POST(_req: NextRequest) {
  return bad(
    "Shared demo setup is retired. Sign in with an invited account, then add optional examples in Settings.",
    410,
  );
}
