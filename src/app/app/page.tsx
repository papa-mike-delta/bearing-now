import { v1Enabled } from "@/lib/v1-enabled";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import type { Metadata } from "next";
import { Workflow } from "@/lib/v1/workflow";
import { SetupRequired } from "@/components/bearing/deployment/setup-required";


export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your workspace",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppPage() {
  const session = verifySession((await cookies()).get("lifeos-session")?.value ?? "");
  if (!session?.twoFactorVerified) redirect("/login");
  if (v1Enabled()) {
    let preferences;
    try { preferences = await Workflow.preferences(session.userId); }
    catch { return <SetupRequired unavailable />; }
    const startup = ["today", "journal", "inbox", "projects", "library", "calendar"].includes(String(preferences.startup)) ? String(preferences.startup) : "today";
    redirect(`/app/${startup}`);
  }
  return <SetupRequired />;
}
