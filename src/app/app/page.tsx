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

export default function AppPage() {
  return <Shell coachEnabled={coachToolsEnabled()} />;
}
