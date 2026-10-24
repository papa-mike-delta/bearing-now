import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import type { Metadata } from "next";
import { Shell } from "@/components/bearing/shell";
import { coachToolsEnabled } from "@/lib/coach/feature-flag";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppPage() {
  const session = verifySession((await cookies()).get("lifeos-session")?.value ?? "");
  if (!session?.twoFactorVerified) redirect("/login");
  return <Shell userId={session.userId} coachEnabled={coachToolsEnabled()} />;
}
