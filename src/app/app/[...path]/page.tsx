import { v1Enabled } from "@/lib/v1-enabled";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { workflowViews } from "@/lib/v1/workflow-contracts";
import { WorkflowShell } from "@/components/bearing/workflow/shell";
import { SetupRequired } from "@/components/bearing/deployment/setup-required";
import { loginDestination } from "@/lib/app-destination";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return {
    title: path[0].charAt(0).toUpperCase() + path[0].slice(1),
    robots: { index: false, follow: false },
  };
}
export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const session = verifySession(
    (await cookies()).get("lifeos-session")?.value ?? "",
  );
  const { path } = await params;
  if (!session?.twoFactorVerified) redirect(loginDestination(`/app/${path.join("/")}`));
  if (
    path.length > 2 ||
    !(workflowViews as readonly string[]).includes(path[0]) ||
    (path[1] && !["library", "projects", "reviews"].includes(path[0]))
  )
    notFound();
  if (!v1Enabled()) return <SetupRequired />;
  return (
    <WorkflowShell
      key={session.userId}
      userId={session.userId}
      view={path[0]}
      recordId={path[1]}
    />
  );
}
