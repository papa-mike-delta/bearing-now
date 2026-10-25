import Link from "next/link";
import { Compass, ArrowRight } from "lucide-react";
import { siteConfig } from "@/lib/seo";
/** No writes or automatic migration; never fall back to the retired UI. */
export function SetupRequired({ unavailable = false }: { unavailable?: boolean }) {
  return <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
    <Compass className="h-12 w-12 text-primary" aria-hidden="true" />
    <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">bearing.now · Workspace setup</p>
    <h1 className="text-4xl font-semibold tracking-tight">{unavailable ? "Your workspace is temporarily unavailable" : "This workspace is waiting for V1 setup"}</h1>
    <p className="text-lg leading-relaxed text-muted-foreground">{unavailable ? "We could not open the V1 database. Your records have not been changed. Retry after the operator checks the database connection and reviewed migrations." : "The updated workspace is not enabled on this deployment yet. Ask the operator to finish the reviewed V1 setup. Your existing records have not been changed."}</p>
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">For the deployment operator</h2>
      <p className="mt-3 leading-relaxed text-muted-foreground">Verify the target database and backup, review and apply the V1 migrations, then set <code>BEARING_V1_ENABLED=true</code> and redeploy. Enabling V1 does not convert legacy records. Review the existing-account transition before switching live data.</p>
      <a className="mt-4 inline-flex min-h-11 items-center gap-2 underline" href={`${siteConfig.repositoryUrl}/blob/main/docs/RELEASE.md`}>Open the deployment runbook <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
    </div>
    <div className="flex flex-wrap gap-6"><a href="" className="inline-flex min-h-11 items-center underline">Retry this page</a><Link href="/help" className="inline-flex min-h-11 items-center underline">Help and privacy</Link></div>
  </main>;
}
