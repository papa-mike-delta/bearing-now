import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import type { Metadata } from "next";
import { Workflow } from "@/lib/v1/workflow";
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
  if (process.env.BEARING_V1_ENABLED === "true") {
    const preferences = await Workflow.preferences(session.userId);
    const startup = ["today", "journal", "inbox", "projects", "library", "calendar"].includes(String(preferences.startup)) ? String(preferences.startup) : "today";
    redirect(`/app/${startup}`);
  }
  return <Shell userId={session.userId} coachEnabled={coachToolsEnabled()} />;
}
