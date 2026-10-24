import { Owned } from "@/lib/domain/owned";
import { BackupDomain } from "@/lib/domain/backup";
import { writeActor, sessionUser, ok, bad, domainResponse, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

// GET /api/backup — the caller's data as JSON
export async function GET(req: Request) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const userId = session.userId;
  const [domains, projects, items, links, tags, reviews, habitLogs] = await Promise.all([
    Owned.domains(userId),
    Owned.projects(userId),
    Owned.items(userId, { include: { tags: { include: { tag: true } } } }),
    Owned.links(userId),
    Owned.tags(userId),
    Owned.reviews(userId),
    Owned.habitLogs(userId),
  ]);

  return ok({
    version: 1,
    exportedAt: new Date().toISOString(),
    domains,
    projects,
    items,
    links,
    tags,
    reviews,
    habitLogs,
  });
}

// POST /api/backup — restore into the caller's account
export async function POST(req: Request) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  try {
    return domainResponse(await BackupDomain.restore(
      session.userId, await parseBody(req), await writeActor(req),
    ));
  } catch (error) {
    return bad(`Restore failed: ${error instanceof Error ? error.message : "Unknown error"}`, 500);
  }
}
