import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifySession } from "@/lib/session";
import { workflowViews } from "@/lib/v1/workflow-contracts";
import { WorkflowShell } from "@/components/bearing/workflow/shell";
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
  if (!session?.twoFactorVerified) redirect("/login");
  if (process.env.BEARING_V1_ENABLED !== "true") notFound();
  const { path } = await params;
  if (
    path.length > 2 ||
    !(workflowViews as readonly string[]).includes(path[0]) ||
    (path[1] && !["library", "projects", "reviews"].includes(path[0]))
  )
    notFound();
  return (
    <WorkflowShell
      key={session.userId}
      userId={session.userId}
      view={path[0]}
      recordId={path[1]}
    />
  );
}
