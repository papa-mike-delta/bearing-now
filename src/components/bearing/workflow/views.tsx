"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "../icon";
import { PageHeader, SectionCard } from "../layout";
import {
  activitySummary,
  itemDto,
  itemSeed,
  statusNames,
  typeIcons,
  type ItemRecord,
  type MomentRecord,
  type ProjectRecord,
} from "@/lib/v1/client-model";
import { dateInZone } from "@/lib/v1/dates";
import { DraftNotice, useItemDraft } from "../item-draft-session";
import {
  localDateTime,
  instantFromInput,
  plannedForDay,
} from "@/lib/v1/workflow-dates";
import { useWorkspace, request, fieldClass } from "./context";
import {
  Connections,
  PersonProfile,
  BookmarkReference,
  HabitOccurrence,
  RelationshipReminders,
  CheckIn,
  HabitsToday,
} from "./connections";
import { typeNames } from "./structured-fields";
import {
  localDate as validLocalDate,
  type CanonicalItem,
} from "@/lib/v1/contracts";
import { ReviewComposer } from "./review-composer";
import { TagSelector, ItemEditor } from "./item-editor";

export function ItemCard({
  item,
  context,
}: {
  item: ItemRecord;
  context?: string;
}) {
  const { mutate, timezone } = useWorkspace(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await mutate(
        `items/${item.id}`,
        {
          revision: item.revision,
          data: {
            ...itemDto(itemSeed(item)),
            status: item.status === "done" ? "todo" : "done",
          },
        },
        "PUT",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4"
      aria-label={item.title}
    >
      {item.type === "task" ? (
        <Button
          size="icon"
          variant="outline"
          disabled={busy}
          aria-label={`${item.status === "done" ? "Reopen" : "Complete"} ${item.title}`}
          aria-pressed={item.status === "done"}
          onClick={() => void toggle()}
        >
          <Icon name={item.status === "done" ? "Check" : "Circle"} />
        </Button>
      ) : (
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-muted">
          <Icon name={typeIcons[item.type]} />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-36">
        <Link
          className="break-words font-medium underline-offset-4 hover:underline"
          href={`/app/library/${item.id}`}
        >
          {item.title}
        </Link>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{item.type}</span>
          <span>{statusNames[item.status]}</span>
          <span>
            Priority {item.priority > 0 ? "+" : ""}
            {item.priority}
          </span>
          {context && <span>{context}</span>}
          {item.localDate && <span>Due {item.localDate}</span>}
          {item.dueAt && (
            <span>
              Due{" "}
              {new Date(item.dueAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.startAt && (
            <span>
              Starts{" "}
              {new Date(item.startAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.endAt && (
            <span>
              Ends{" "}
              {new Date(item.endAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.scheduledAt && (
            <span>
              Scheduled{" "}
              {new Date(item.scheduledAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {item.directAreas.map((a) => (
            <span key={a.id} className="rounded border border-border px-2 py-1">
              Area · {a.name}
            </span>
          ))}
          {item.inheritedAreas.map((a) => (
            <span
              key={a.id}
              className="rounded border border-dashed border-border px-2 py-1"
            >
              Inherited · {a.name}
            </span>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-muted-foreground">{children}</p>;
}
export function Today({ date }: { date: string }) {
  const { data, timezone } = useWorkspace();
  const open = data.items.filter(
    (i) => i.type === "task" && !["done", "archived"].includes(i.status),
  );
  const overdue = open.filter(
    (i) =>
      (i.localDate && i.localDate < date) ||
      (i.dueAt && dateInZone(i.dueAt, timezone) < date),
  );
  const progress = open.filter((i) =>
    ["in_progress", "delegated"].includes(i.status),
  );
  const planned = data.items.filter(
    (i) =>
      !["done", "archived"].includes(i.status) &&
      plannedForDay(i, date, timezone),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Today"
        subtitle={`A little direction for ${date}. Your plans stay separate from what happened.`}
        icon="Sun"
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          className="inline-flex min-h-9 items-center rounded-xl border border-border/70 bg-card/60 px-3 text-foreground"
          href="/app/inbox"
        >
          {data.moments.filter((m) => m.needsOrganization).length +
            open.filter(
              (i) =>
                i.status === "inbox" &&
                !data.moments.some((m) =>
                  m.items.some((r) => r.itemId === i.id),
                ),
            ).length}{" "}
          to organize
        </Link>
        <Link
          className="inline-flex min-h-9 items-center rounded-xl border border-border/70 bg-card/60 px-3 text-foreground"
          href="/app/journal"
        >
          Write in your Journal
        </Link>
        <Link className="inline-flex min-h-9 items-center rounded-xl border border-border/70 bg-card/60 px-3 text-foreground" href="/app/reviews">Write a reflection</Link>
      </div>
      <SectionCard title="Overdue">
        <div className="space-y-3">
          {overdue.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              context="Overdue · original deadline retained"
            />
          ))}
          {!overdue.length && <Empty>No overdue Tasks.</Empty>}
        </div>
      </SectionCard>
      <SectionCard title="In progress · including delegated">
        <div className="space-y-3">
          {progress.map((i) => (
            <ItemCard key={i.id} item={i} />
          ))}
          {!progress.length && (
            <Empty>Start with one Task when you’re ready.</Empty>
          )}
        </div>
      </SectionCard>
      <RelationshipReminders date={date} />
      <CheckIn />
      <HabitsToday date={date} />
      <SectionCard title="On the calendar">
        <div className="space-y-3">
          {planned.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              context={plannedForDay(i, date, timezone)!}
            />
          ))}
          {!planned.length && <Empty>Your day is open.</Empty>}
        </div>
      </SectionCard>
    </div>
  );
}
export function MomentCard({
  moment,
  organize = false,
}: {
  moment: MomentRecord;
  organize?: boolean;
}) {
  const { data, mutate, refresh } = useWorkspace(),
    [type, setType] = useState("task"),
    [title, setTitle] = useState(
      moment.text
        .replace(/^\s*\/(task|note|place)\s*/i, "")
        .trim()
        .split("\n")[0]
        .slice(0, 300),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const seed = useMemo(
    () => ({
      id: moment.id,
      revision: moment.revision,
      type: "journal-moment",
      title: "Journal moment",
      content: moment.text,
      occurredAt: moment.occurredAt,
      status: "todo",
      metadata: {},
    }),
    [moment],
  );
  const {
    owner,
    draft,
    data: edit,
  } = useItemDraft(`moment:${moment.id}`, seed);
  const refs = moment.items
    .map((r) => data.items.find((i) => i.id === r.itemId))
    .filter((i): i is ItemRecord => !!i);
  async function classify(item = false) {
    setBusy(true);
    setError("");
    try {
      await mutate(`journal/${moment.id}/organize`, {
        revision: moment.revision,
        ...(item
          ? {
              item: {
                type,
                title,
                content: moment.text,
                status: "todo",
                timezone: moment.timezone,
                metadata: { version: 1 },
              },
            }
          : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveText() {
    const ticket = owner.beginSave(`moment:${moment.id}`);
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const response = await mutate(
        `journal/${moment.id}`,
        {
          revision: ticket.data.revision,
          text: ticket.data.content,
          occurredAt: ticket.data.occurredAt,
          timezone: moment.timezone,
        },
        "PUT",
      );
      owner.complete(
        ticket,
        {
          ...seed,
          revision: response.value.revision,
          content: response.value.text,
          occurredAt: response.value.occurredAt,
        },
        "moment",
      );
      setEditing(false);
    } catch (e) {
      owner.fail(ticket, e);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      id={`moment-${moment.id}`}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <time dateTime={moment.occurredAt}>
          {new Intl.DateTimeFormat(undefined, {
            timeZone: moment.timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(moment.occurredAt))}{" "}
          · {moment.timezone}
        </time>
        <Link
          className="underline"
          href={`/app/journal?date=${moment.localDate}&moment=${moment.id}`}
        >
          Open Journal entry
        </Link>
      </div>
      {editing ? (
        <div className="space-y-2">
          <DraftNotice
            noun="Journal entry"
            draft={draft}
            onDiscard={() => owner.discard(`moment:${moment.id}`)}
          />
          <label className="text-sm">
            Occurred at · {moment.timezone}
            <input
              type="datetime-local"
              className={fieldClass}
              value={localDateTime(edit.occurredAt, moment.timezone)}
              onChange={(e) => {
                try {
                  owner.change(`moment:${moment.id}`, {
                    occurredAt: instantFromInput(
                      e.target.value,
                      moment.timezone,
                    ),
                  });
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            />
          </label>
          <label className="text-sm">
            Journal text
            <textarea
              className={`${fieldClass} mt-1`}
              rows={7}
              value={edit.content}
              onChange={(e) =>
                owner.change(`moment:${moment.id}`, { content: e.target.value })
              }
            />
          </label>
          <Button
            disabled={busy || !edit.content.trim()}
            onClick={() => void saveText()}
          >
            Save Journal text
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Keep draft and close
          </Button>
        </div>
      ) : (
        <>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words dark:prose-invert">
            <ReactMarkdown>{moment.text}</ReactMarkdown>
          </div>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit Journal text
          </Button>
        </>
      )}
      {refs.map((i) => (
        <ItemCard key={i.id} item={i} context="Linked Item" />
      ))}
      {organize && (
        <div className="space-y-3 border-t border-border pt-3">
          {!refs.length && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  Organize as
                  <select
                    className={`${fieldClass} mt-1`}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="task">Task</option>
                    <option value="note">Note</option>
                  </select>
                </label>
                <label className="text-sm">
                  Title
                  <input
                    className={`${fieldClass} mt-1`}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={300}
                  />
                </label>
              </div>
              <Button
                disabled={busy || !title.trim()}
                onClick={() => void classify(true)}
              >
                Create {type === "task" ? "Task" : "Note"} from entry
              </Button>
            </>
          )}
          <Button
            className="ml-2"
            variant="outline"
            disabled={busy}
            onClick={() => void classify(false)}
          >
            {refs.length ? "Mark organized" : "Keep as Journal entry"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
export function Journal({ date }: { date: string }) {
  const { data, timezone, mutate } = useWorkspace(),
    router = useRouter();
  const moments = data.moments.filter((m) => m.localDate === date);
  const activities = data.activities.filter(
    (a) =>
      a.localDate === date &&
      !data.moments.some((m) => m.clientId === a.clientId),
  );
  const planned = data.items.filter(
    (i) =>
      !["done", "archived"].includes(i.status) &&
      plannedForDay(i, date, timezone),
  );
  const showActivities = data.preferences.journalActivities !== false;
  const timeline = [
    ...moments.map((m) => ({ time: m.occurredAt, id: m.id, moment: m })),
    ...(showActivities
      ? activities.map((a) => ({ time: a.occurredAt, id: a.id, activity: a }))
      : []),
  ].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-medium">
          Journal date
          <input
            aria-label="Journal date"
            type="date"
            className={`${fieldClass} mt-1`}
            value={date}
            onChange={(e) =>
              e.target.value &&
              router.push(`/app/journal?date=${e.target.value}`)
            }
          />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showActivities}
            onChange={(e) =>
              void mutate(
                "preferences",
                { journalActivities: e.target.checked },
                "PUT",
              ).catch(() => {})
            }
          />
          Show Activity
        </label>
      </div>
      <SectionCard title="What happened">
        <div className="space-y-3">
          {timeline.map((entry) =>
            "moment" in entry ? (
              <MomentCard key={entry.id} moment={entry.moment} />
            ) : (
              <article
                id={`activity-${entry.id}`}
                key={entry.id}
                className="rounded-xl border border-border p-4 text-sm"
              >
                <strong className="capitalize">
                  {entry.activity.kind.replaceAll("_", " ")}
                </strong>
                <time className="ml-2 text-xs">
                  {new Date(entry.time).toLocaleTimeString(undefined, {
                    timeZone: entry.activity.timezone || timezone,
                  })}
                </time>
                <p>{activitySummary(entry.activity)}</p>
                {entry.activity.itemId &&
                  data.items.find((i) => i.id === entry.activity.itemId) && (
                    <ItemCard
                      item={data.items.find(
                        (i) => i.id === entry.activity.itemId,
                      )!}
                    />
                  )}
              </article>
            ),
          )}
          {!timeline.length && (
            <Empty>No moments yet. Capture a line when you’re ready.</Empty>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Planned · not recorded as happened">
        <div className="space-y-3">
          {planned.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              context={plannedForDay(i, date, timezone)!}
            />
          ))}
          {!planned.length && <Empty>No plans for this date.</Empty>}
        </div>
      </SectionCard>
    </div>
  );
}
export function Inbox() {
  const { data } = useWorkspace();
  const moments = data.moments.filter((m) => m.needsOrganization),
    items = data.items.filter(
      (i) =>
        i.status === "inbox" &&
        !moments.some((m) => m.items.some((r) => r.itemId === i.id)),
    );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Inbox"
        icon="Inbox"
        subtitle="Original words first. Organize or clarify when you’re ready."
      />
      {moments.map((m) => (
        <MomentCard key={m.id} moment={m} organize />
      ))}
      {items.map((i) => (
        <ItemCard key={i.id} item={i} />
      ))}
      {!moments.length && !items.length && <Empty>Your Inbox is clear.</Empty>}
    </div>
  );
}
export function Library({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter();
  const [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [area, setArea] = useState(params.get("area") || "");
  if (recordId === "new")
    return (
      <div className="space-y-4">
        <PageHeader
          title={`New ${typeNames[(params.get("type") || "task") as CanonicalItem["type"]] || "Task"}`}
        />
        {params.get("draft") ? (
          <ItemEditor
            draftKey={`new:${params.get("draft")}`}
            type={
              (Object.keys(typeNames).includes(params.get("type") || "")
                ? params.get("type")
                : "task") as CanonicalItem["type"]
            }
          />
        ) : (
          <p>Preparing editor…</p>
        )}
      </div>
    );
  if (recordId) {
    const item = data.items.find((i) => i.id === recordId);
    return item ? (
      <div className="space-y-5">
        <PageHeader
          title={item.title}
          subtitle={`${item.type} · ${statusNames[item.status]}`}
          icon={typeIcons[item.type]}
        />
        {item.type === "person" && <PersonProfile item={item} />}
        {item.type === "bookmark" && <BookmarkReference item={item} />}
        <ItemEditor key={item.id} item={item} />
        {item.type === "habit" && (
          <HabitOccurrence
            item={item}
            date={
              validLocalDate.safeParse(params.get("date")).success
                ? params.get("date")!
                : dateInZone(new Date(), item.timezone)
            }
          />
        )}
        <Connections item={item} />
      </div>
    ) : (
      <Empty>This Item is not available in this account.</Empty>
    );
  }
  const tag = params.get("tag");
  const items = data.items.filter(
    (i) =>
      (type === "all" || i.type === type) &&
      (status === "all" ||
        (status === "in_progress"
          ? ["in_progress", "delegated"].includes(i.status)
          : i.status === status)) &&
      (!area ||
        [...i.directAreas, ...i.inheritedAreas].some((a) => a.id === area)) &&
      (!tag || i.tags.some((t) => t.tagId === tag)),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Library"
        icon="Library"
        subtitle="Your saved Tasks, Notes, People and references."
        actions={
          <>
            <Button
              onClick={() =>
                router.push(
                  `/app/library/new?type=task&draft=${crypto.randomUUID()}`,
                )
              }
            >
              New Task
            </Button>
            {Object.entries(typeNames)
              .filter(([t]) => t !== "task")
              .map(([t, name]) => (
                <Button
                  key={t}
                  variant="outline"
                  onClick={() =>
                    router.push(
                      `/app/library/new?type=${t}&draft=${crypto.randomUUID()}`,
                    )
                  }
                >
                  New {name}
                </Button>
              ))}
            <Link
              className="inline-flex min-h-11 items-center underline text-sm"
              href="/app/graph"
            >
              Explore Graph
            </Link>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          Type
          <select
            className={fieldClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All types</option>
            {Object.keys(typeIcons).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusNames).map(([value, name]) => (
              <option key={value} value={value}>
                {value === "in_progress" ? "In progress + delegated" : name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Effective Area
          <select
            className={fieldClass}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">All Areas</option>
            {data.tags
              .filter((t) => t.kind === "area")
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {items.map((i) => (
        <ItemCard key={i.id} item={i} />
      ))}
      {!items.length && <Empty>No Items match these filters.</Empty>}
    </div>
  );
}
function ProjectForm({
  project,
  onDone,
}: {
  project?: ProjectRecord;
  onDone(): void;
}) {
  const { mutate } = useWorkspace(),
    [name, setName] = useState(project?.name || ""),
    [description, setDescription] = useState(project?.description || ""),
    [tags, setTags] = useState(project?.tags.map((t) => t.tagId) || []),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const data = {
            name,
            description,
            tagIds: tags,
            status: project?.status || "active",
          };
          await mutate(
            project ? `projects/${project.id}` : "projects",
            project ? { revision: project.revision, data } : data,
            project ? "PUT" : "POST",
          );
          onDone();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="block text-sm">
        Project name
        <input
          required
          className={`${fieldClass} mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Description
        <textarea
          className={`${fieldClass} mt-1`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <TagSelector selected={tags} onChange={setTags} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit">
        {project ? "Save Project" : "Create Project"}
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Close
      </Button>
    </form>
  );
}
export function Projects({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace(),
    [editing, setEditing] = useState(false);
  const project = data.projects.find((p) => p.id === recordId);
  if (recordId && !project)
    return <Empty>This Project is not available in this account.</Empty>;
  return (
    <div className="space-y-5">
      <PageHeader
        title={project?.name || "Projects"}
        icon="Folder"
        subtitle={
          project?.description ||
          "Curated workspaces, for a season or for years."
        }
        actions={
          <Button onClick={() => setEditing(!editing)}>
            {project ? "Edit Project" : "New Project"}
          </Button>
        }
      />
      {editing && (
        <ProjectForm project={project} onDone={() => setEditing(false)} />
      )}
      {project
        ? data.items
            .filter((i) => i.projectId === project.id)
            .map((i) => <ItemCard key={i.id} item={i} />)
        : data.projects.map((p) => (
            <Link
              className="block rounded-xl border border-border bg-card p-4"
              href={`/app/projects/${p.id}`}
              key={p.id}
            >
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-sm text-muted-foreground">{p.description}</p>
              <p className="mt-2 text-xs">
                {p.tags
                  .filter((t) => t.tag.kind === "area")
                  .map((t) => t.tag.name)
                  .join(" · ") || "No Areas assigned"}
              </p>
            </Link>
          ))}
    </div>
  );
}
export function Calendar({ date }: { date: string }) {
  const { data, timezone } = useWorkspace(),
    router = useRouter();
  const items = data.items.filter(
    (i) => i.status !== "archived" && plannedForDay(i, date, timezone),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar & Agenda"
        icon="CalendarDays"
        subtitle="Tasks, deadlines and Event plans, together."
      />
      <label className="block text-sm">
        Calendar date
        <input
          type="date"
          className={`${fieldClass} mt-1 max-w-xs`}
          value={date}
          onChange={(e) =>
            e.target.value &&
            router.push(`/app/calendar?date=${e.target.value}`)
          }
        />
      </label>
      {items.map((i) => (
        <ItemCard
          key={i.id}
          item={i}
          context={plannedForDay(i, date, timezone)!}
        />
      ))}
      {!items.length && (
        <Empty>No scheduled work, deadlines or Event plans on this date.</Empty>
      )}
    </div>
  );
}
export function Search({ coach = false }: { coach?: boolean }) {
  const { userId, data } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter();
  const [q, setQ] = useState(params.get("q") || ""),
    [kind, setKind] = useState(params.get("kind") || "all"),
    [area, setArea] = useState(params.get("areaId") || ""),
    [project, setProject] = useState(params.get("projectId") || "");
  const query = params.get("q") || "",
    key = params.toString();
  const results = useQuery({
    queryKey: ["v1-search", userId, key],
    enabled: !!query.trim(),
    queryFn: ({ signal }) =>
      request<
        {
          id: string;
          title: string;
          excerpt: string;
          kind: string;
          href: string;
        }[]
      >(userId, `search?${key}`, { signal }),
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title={coach ? "Coach · find context" : "Search"}
        icon={coach ? "Sparkles" : "Search"}
        subtitle={
          coach
            ? "Look up your saved information. This lookup uses keywords and makes no automatic changes."
            : "Keyword search across your Items, Projects, Journal, Reviews, Activity and Tags."
        }
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams({ q, kind });
          if (area) p.set("areaId", area);
          if (project) p.set("projectId", project);
          router.push(`/app/${coach ? "coach" : "search"}?${p}`);
        }}
      >
        <label className="block text-sm">
          Keywords
          <input
            className={`${fieldClass} mt-1`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            Record kind
            <select
              className={fieldClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                "all",
                "item",
                "project",
                "journal",
                "review",
                "activity",
                "tag",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Area
            <select
              className={fieldClass}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="">All Areas</option>
              {data.tags
                .filter((t) => t.kind === "area")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs">
            Project
            <select
              className={fieldClass}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button disabled={!q.trim()}>Search records</Button>
      </form>
      {results.isFetching && <p role="status">Searching…</p>}
      {results.error && <p role="alert">{results.error.message}</p>}
      {results.data?.map((r) => (
        <Link
          className="block rounded-xl border border-border p-4"
          href={r.href}
          key={`${r.kind}-${r.id}`}
        >
          <p className="text-xs capitalize text-muted-foreground">{r.kind}</p>
          <h2 className="font-medium">{r.title}</h2>
          <p className="break-words text-sm text-muted-foreground">
            {r.excerpt}
          </p>
        </Link>
      ))}
      {results.data?.length === 0 && (
        <Empty>
          No matching records in this account. Try fewer keywords or different
          filters.
        </Empty>
      )}
    </div>
  );
}
export function Reviews({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace();
  const reviews = data.reviews.filter((r) => !recordId || r.id === recordId);
  return (
    <div className="space-y-5">
      <PageHeader title="Reviews" subtitle="Pause and reflect. Separate from your daily log and check-ins." />
      {recordId ? <Link className="inline-flex min-h-11 items-center underline" href="/app/reviews">All Reviews · write a reflection</Link> : <ReviewComposer />}
      {reviews.map((r) => (
        <SectionCard key={r.id} title={`${r.period} · ${r.localDate}`}>
          <dl className="space-y-3">
            {Object.entries(r.prompts).map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-semibold capitalize">{key}</dt>
                <dd className="whitespace-pre-wrap break-words text-sm">
                  {Array.isArray(value) ? value.join("\n") : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      ))}
      {!reviews.length && <Empty>No matching Review in this account.</Empty>}
    </div>
  );
}
