import { v1Enabled } from "@/lib/v1-enabled";
import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { v1db } from "@/lib/v1/db";
import { Fault, parse } from "@/lib/v1/service";
import { id } from "@/lib/v1/contracts";
import { z } from "zod";
import { chatInput } from "@/lib/v1/coach/contracts";
import { configuration, answerStream } from "@/lib/v1/coach/model";
import { CoachStore } from "@/lib/v1/coach/store";
import { preview, approve, reject } from "@/lib/v1/coach/proposals";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
async function handle(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!v1Enabled())
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const session = await getUserFromRequest(req);
  if (!session?.twoFactorVerified)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (
      (req.method !== "GET" || req.headers.has("X-Bearing-Account")) &&
      req.headers.get("X-Bearing-Account") !== session.userId
    )
      throw new Fault(409, "Account changed; reload your workspace");
    if (!(await v1db.account.findUnique({ where: { id: session.userId } })))
      throw new Fault(401, "Unauthorized");
    const userId = session.userId,
      { path } = await context.params,
      [resource, recordId] = path;
    if (path.length > 2) throw new Fault(404, "Not found");
    if (recordId) parse(id, recordId);
    let body: any = {};
    if (req.method !== "GET") {
      const text = await req.text();
      if (Buffer.byteLength(text) > 1000000)
        throw new Fault(413, "Request too large");
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new Fault(400, "Invalid JSON");
      }
    }
    let result: unknown;
    if (resource === "config" && req.method === "GET") result = configuration();
    else if (resource === "chat" && req.method === "POST")
      return await answerStream(userId, parse(chatInput, body), req.signal);
    else if (resource === "conversations" && req.method === "GET")
      result = recordId
        ? await CoachStore.conversation(userId, recordId)
        : await CoachStore.list(userId);
    else if (
      resource === "conversations" &&
      recordId &&
      req.method === "DELETE"
    )
      result = await CoachStore.remove(userId, recordId);
    else if (resource === "memory" && req.method === "GET")
      result = await CoachStore.memories(userId);
    else if (resource === "memory" && req.method === "PUT")
      result = await CoachStore.memory(userId…2105 tokens truncated…on: "TrendingDown",
        domainId: dmap.wealth,
        status: "active",
        progress: 40,
        targetDate: daysFromNow(300),
      },
      {
        name: "Read 24 Books",
        description: "Two books a month for a year.",
        color: "#3b82f6",
        icon: "BookOpen",
        domainId: dmap.growth,
        status: "active",
        progress: 50,
        targetDate: daysFromNow(180),
      },
    ].map((p) => db.project.create({ data: { ...p, userId: demo.id } as any })),
  );
  const pmap = Object.fromEntries(projects.map((p) => [p.name, p.id]));

  // Keep this demo to 20 Items so a fresh seed fits the hourly write cap.
  // Helper to create item + metadata
  async function item(data: Omit<Prisma.ItemCreateManyInput, "metadata" | "revision" | "userId"> & { metadata?: unknown }) {
    const meta = data.metadata ? { metadata: JSON.stringify(data.metadata) } : {};
    const { metadata, ...rest } = data;
    const result = await ItemDomain.create(demo.id, { ...rest, ...meta }, [], "agent:seed");
    if (!result.ok) throw new Error(`Seed refused: ${JSON.stringify(result)}`);
    return result.value;
  }

  // ── Tasks (Time & Action) ──
  await item({ type: "task", title: "Book flights to Tokyo", domainId: dmap.time_action, projectId: pmap["Japan Trip 2025"], status: "active", priority: 3, dueDate: daysFromNow(7), metadata: { estimate: "2h" } });

  await item({ type: "task", title: "Morning run 5km", domainId: dmap.time_action, projectId: pmap["Health Transformation"], status: "active", priority: 2, dueDate: daysFromNow(1), metadata: { estimate: "30m" } });

  await item({ type: "task", title: "Finish landing page copy", domainId: dmap.time_action, projectId: pmap["Launch Startup"], status: "active", priority: 4, dueDate: daysFromNow(2) });

  await item({ type: "task", title: "Pay credit card bill", domainId: dmap.time_action, projectId: pmap["Get out of Debt"], status: "active", priority: 4, dueDate: daysFromNow(3), metadata: { amount: 850 } });

  // ── Habits ──
  const medHabit = await item({ type: "habit", title: "Meditate 10 minutes", domainId: dmap.mind_soul, status: "active", metadata: { cadence: "daily", target: 10, unit: "min", streak: 4 } });
  const runHabit = await item({ type: "habit", title: "Run / Walk 5km", domainId: dmap.health, status: "active", metadata: { cadence: "daily", target: 5, unit: "km", streak: 2 } });
  const readHabit = await item({ type: "habit", title: "Read 20 pages", domainId: dmap.growth, status: "active", projectId: pmap["Read 24 Books"], metadata: { cadence: "daily", target: 20, unit: "pages", streak: 6 } });
  const waterHabit = await item({ type: "habit", title: "Drink 2L water", domainId: dmap.health, status: "active", metadata: { cadence: "daily", target: 2, unit: "L", streak: 9 } });
  const writeHabit = await item({ type: "habit", title: "Morning pages", domainId: dmap.mind_soul, status: "active", metadata: { cadence: "daily", target: 1, unit: "entry", streak: 3 } });

  // Habit logs for the last 14 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const r = Math.random();
    if (medHabit && r > 0.2) await db.habitLog.create({ data: { itemId: medHabit.id, date: d, value: 10 } }).catch(() => {});
    if (runHabit && r > 0.45) await db.habitLog.create({ data: { itemId: runHabit.id, date: d, value: 5 } }).catch(() => {});
    if (readHabit && r > 0.3) await db.habitLog.create({ data: { itemId: readHabit.id, date: d, value: 20 } }).catch(() => {});
    if (waterHabit && r > 0.15) await db.habitLog.create({ data: { itemId: waterHabit.id, date: d, value: 2 } }).catch(() => {});
    if (writeHabit && r > 0.5) await db.habitLog.create({ data: { itemId: writeHabit.id, date: d, value: 1 } }).catch(() => {});
  }

  // ── Journal entries ──
  await item({ type: "journal", title: "Stress about money", domainId: dmap.mind_soul, projectId: pmap["Get out of Debt"], status: "active", scheduledAt: daysFromNow(-2, 21), content: "Feeling the weight of debt again today. Need to sit down and make a real plan. The interest is eating into everything. I'll start by cutting subscriptions and cooking at home more." });

  // ── Notes ──
  await item({ type: "note", title: "Tokyo neighborhood research", domainId: dmap.creativity, projectId: pmap["Japan Trip 2025"], status: "active", content: "## Areas to stay\n- **Shinjuku** — lively, great transit\n- **Shibuya** — young, energetic\n- **Asakusa** — quieter, traditional\n- **Ginza** — upscale shopping" });

  // ── Finance ──
  await item({ type: "finance", title: "Salary", domainId: dmap.wealth, status: "active", dueDate: daysFromNow(5), metadata: { kind: "income", amount: 4200, recurring: "monthly" } });
  await item({ type: "finance", title: "Rent", domainId: dmap.wealth, status: "active", dueDate: daysFromNow(2), metadata: { kind: "expense", amount: 1450, recurring: "monthly" } });

  // ── Network: contacts ──
  await item({ type: "contact", title: "Sarah Chen", domainId: dmap.network, status: "active", metadata: { relationship: "close friend", birthday: "1992-04-18", lastContact: daysFromNow(-12).toISOString() } });

  // ── Growth: books & courses ──
  await item({ type: "bookmark", title: "Atomic Habits", domainId: dmap.growth, projectId: pmap["Read 24 Books"], status: "active", metadata: { author: "James Clear", medium: "book", status: "reading", rating: 5, currentPage: 180, totalPages: 320 }, content: "Tiny changes, remarkable results. Focus on systems over goals.\n\n## Key takeaways\n- **1% better every day** compounds into 37x in a year\n- Focus on **systems** over goals\n- The 4 laws: make it obvious, attractive, easy, satisfying\n- Identity-based habits: \"I am a reader\" not \"I want to read more\"" });

  // ── Mind & Soul ──
  await item({ type: "vision", title: "Live with intention", domainId: dmap.mind_soul, status: "active", content: "I want every day to be a deliberate choice, not a reaction. Less screen time, more presence." });
  await item({ type: "goal", title: "Run a half-marathon", domainId: dmap.health, projectId: pmap["Health Transformation"], status: "active", dueDate: daysFromNow(90), metadata: { measure: "21km race" } });

  // ── Creativity & Joy ──
  await item({ type: "idea", title: "App for tracking plant care", domainId: dmap.creativity, status: "inbox", content: "Notification + watering schedule with plant ID." });

  // ── Inbox (Quick Capture) ──
  await item({ type: "note", title: "Look into tax-advantaged accounts", domainId: dmap.wealth, status: "inbox" });

  // ── Admin ──
  await item({ type: "task", title: "Grocery: oats, eggs, spinach, bananas", domainId: dmap.admin, status: "active", priority: 2, dueDate: daysFromNow(1), content: "Weekly grocery run" });

  // ── Bi-directional links ──
  const debtJournal = await db.item.findFirst({ where: { title: "Stress about money", userId: demo.id } });
  const financialVision = await db.item.findFirst({ where: { title: "Live with intention", userId: demo.id } });
  const halfGoal = await db.item.findFirst({ where: { title: "Run a half-marathon", userId: demo.id } });
  if (debtJournal && financialVision) {
    await LinkDomain.create(demo.id, { fromId: debtJournal.id, toId: financialVision.id, type: LinkType.parse("related_to"), note: "journal references the vision" }, debtJournal.revision, "agent:seed").catch(() => {});
  }
  if (halfGoal && runHabit) {
    await LinkDomain.create(demo.id, { fromId: halfGoal.id, toId: runHabit.id, type: LinkType.parse("related_to"), note: "habit supports this goal" }, halfGoal.revision, "agent:seed").catch(() => {});
  }
  if (medHabit && writeHabit) {
    await LinkDomain.create(demo.id, { fromId: medHabit.id, toId: writeHabit.id, type: LinkType.parse("related_to") }, medHabit.revision, "agent:seed").catch(() => {});
  }

  // ── Reviews ──
  await db.review.create({
    data: {
      type: "daily",
      date: daysFromNow(-1, 21),
      status: "completed",
      wins: "Shipped the landing page hero section and had a great run.",
      challenges: "Got distracted by notifications in the afternoon.",
      learnings: "Deep work blocks need to be phone-free.",
      gratitude: "Grateful for my supportive partner and a warm apartment.",
      priorities: '["Finish Stripe integration","30-min run","Process inbox"]',
      mood: 4,
      energy: 3,
      notes: "Felt focused in the morning, drained by evening.",
      userId: demo.id,
    },
  });
  await db.review.create({
    data: {
      type: "daily",
      date: daysFromNow(-2, 21),
      status: "completed",
      wins: "Cooked a healthy dinner and meditated.",
      challenges: "Procrastinated on the email to landlord.",
      learnings: "Hard conversations get easier when scheduled.",
      gratitude: "Body felt strong during the workout.",
      priorities: '["Reply to landlord","Book flights","Read 20 pages"]',
      mood: 3,
      energy: 3,
      userId: demo.id,
    },
  });
  await db.review.create({
    data: {
      type: "weekly",
      date: daysFromNow(-4, 20),
      status: "completed",
      weekStart: daysFromNow(-10),
      weekEnd: daysFromNow(-4),
      wins: "Hit 5/7 meditation days, read 80 pages, got passport renewed.",
      challenges: "Overspent on takeout. Skipped two runs.",
      learnings: "Meal prep on Sunday makes the whole week smoother.",
      gratitude: "Grateful for Marcus's mentorship this week.",
      priorities: '["Launch landing page","Plan Japan itinerary","3 strength workouts"]',
      mood: 4,
      energy: 3,
      notes: "Good momentum overall. Need to tighten the budget.",
      userId: demo.id,
    },
  });

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
