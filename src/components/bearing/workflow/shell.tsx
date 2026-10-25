"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Appearance } from "./appearance";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoredThemeOverride } from "@/components/theme-override";
import { Icon } from "../icon";
import { useDraftSession } from "../item-draft-session";
import { PageHeader, SectionCard } from "../layout";
import { outbox, type OutboxEntry, type Identity } from "@/lib/v1/outbox";
import { dateInZone } from "@/lib/v1/dates";
import { localDate } from "@/lib/v1/contracts";
import type { Workspace } from "@/lib/v1/client-model";
import { WorkspaceContext, useWorkspace, request, fieldClass } from "./context";
import { CaptureComposer } from "./capture";
import {
  Today,
  Journal,
  Inbox,
  Library,
  Projects,
  Calendar,
  Search,
  Reviews,
} from "./views";
const nav = [
  ["today", "Today", "Sun"],
  ["journal", "Journal", "BookOpen"],
  ["inbox", "Inbox", "Inbox"],
  ["projects", "Projects", "Folder"],
  ["library", "Library", "Library"],
  ["calendar", "Calendar", "CalendarDays"],
  ["coach", "Coach", "Sparkles"],
  ["settings", "Settings", "Settings"],
];
export function WorkflowShell(props: {
  userId: string;
  view: string;
  recordId?: string;
}) {
  const session = useDraftSession();
  if (session.userId !== props.userId)
    return (
      <main className="space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Confirm your account</h1>
        <p>Your session changed. Reload to open your current account.</p>
        <Button onClick={() => window.location.reload()}>
          Reload workspace
        </Button>
      </main>
    );
  return <Content {...props} />;
}
function Content({
  userId,
  view,
  recordId,
}: {
  userId: string;
  view: string;
  recordId?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const client = useQueryClient(),
    { owner } = useDraftSession(),
    router = useRouter(),
    params = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(null),
    [bootError, setBootError] = useState(""),
    [locked, setLocked] = useState(false),
    [captureOpen, setCaptureOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [queue, setQueue] = useState<OutboxEntry[]>([]),
    [ready, setReady] = useState(false),
    [syncStatus, setSyncStatus] = useState(""),
    [logout, setLogout] = useState(false);
  const active = useRef(true),
    offlineReady = useRef(false);
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["v1-workspace", userId] });
    await client.invalidateQueries({ queryKey: ["v1-search", userId] });
  }, [client, userId]);
  const loadQueue = useCallback(async () => {
    try {
      const rows = await outbox.listEntries(userId);
      if (active.current) setQueue(rows);
    } catch (e) {
      if (active.current) setBootError((e as Error).message);
    }
  }, [userId]);
  const sync = useCallback(
    async (retryErrors = false) => {
      try {
        const result = await outbox.syncOutbox(userId, { retryErrors });
        if (!active.current) return;
        if (result.locked) {
          setLocked(true);
          return;
        }
        setSyncStatus(
          result.offline
            ? "Offline · captures remain on this device"
            : result.unavailable
              ? "Server unavailable · captures retained"
              : "Connected · captures sync when saved to your account",
        );
        await loadQueue();
        if (result.synced) await refresh();
      } catch (e) {
        if (active.current) setSyncStatus((e as Error).message);
      }
    },
    [userId, refresh, loadQueue],
  );
  useEffect(() => {
    active.current = true;
    let live = true;
    request<Identity & { timezone?: string }>(userId, "identity")
      .then(async (value) => {
        if (!live || !active.current) return;
        try {
          const resolved = {
            ...value,
            timezone:
              value.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
          await outbox.activateAccount(resolved);
          if (!live || !active.current) return;
          setIdentity(resolved);
          await loadQueue();
          await sync();
        } catch (e) {
          setBootError(`Device storage unavailable. ${(e as Error).message}`);
        }
      })
      .catch((e) => live && setBootError(e.message));
    const changed = async () => {
      const current = await outbox.activeAccount();
      if (!live) return;
      if (!current || current.userId !== userId) {
        active.current = false;
        setLocked(true);
        owner.clear();
        client.clear();
      } else await loadQueue();
    };
    const event = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === "locked") {
        active.current = false;
        setLocked(true);
        owner.clear();
        client.clear();
      } else void changed();
    };
    window.addEventListener(outbox.channelName, event);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(outbox.channelName)
        : null;
    if (channel) channel.onmessage = () => void changed();
    const online = () => void sync();
    const offline = () => {
      setSyncStatus("Offline · text capture is available on this device");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = setInterval(() => void sync(), 30_000);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/bearing-sw.js", { type: "module", scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
          if (live) {
            offlineReady.current = true;
            setReady(true);
          }
        })
        .catch(
          () =>
            live &&
            setSyncStatus(
              "Offline reload is unavailable. Keep this page open to retain local captures.",
            ),
        );
    return () => {
      live = false;
      active.current = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener(outbox.channelName, event);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [userId, client, owner, loadQueue, sync]);
  const workspace = useQuery({
    queryKey: ["v1-workspace", userId],
    enabled: !!identity && !locked,
    queryFn: ({ signal }) =>
      request<Workspace>(userId, "workspace", { signal }),
  });
  const zone =
    workspace.data?.preferences.timezone ||
    (identity as Identity & { timezone?: string })?.timezone ||
    "UTC";
  const requested = params.get("date"),
    date =
      requested && localDate.safeParse(requested).success
        ? requested
        : dateInZone(new Date(), zone);
  useEffect(() => {
    if (view === "library" && recordId === "new" && !params.get("draft"))
      router.replace(
        `/app/library/new?type=${params.get("type") === "note" ? "note" : "task"}&draft=${crypto.randomUUID()}`,
      );
    const target = params.get("moment")
      ? `moment-${params.get("moment")}`
      : params.get("activity")
        ? `activity-${params.get("activity")}`
        : null;
    if (target && workspace.data)
      requestAnimationFrame(() =>
        document.getElementById(target)?.scrollIntoView({ block: "center" }),
      );
  }, [view, recordId, params, router, workspace.data]);
  const openCapture = useCallback(() => {
    if (view === "journal") {
      const field = document.querySelector<HTMLElement>(
        'section[aria-label="Write a Journal moment"] textarea, section[aria-label="Write a Journal moment"] [contenteditable="true"]',
      );
      field?.focus();
      field?.scrollIntoView({ block: "center" });
    } else setCaptureOpen(true);
  }, [view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
      if (
        event.key === "/" &&
        !(event.target as HTMLElement).closest(
          "input,textarea,[contenteditable]",
        )
      ) {
        event.preventDefault();
        document.getElementById("workspace-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCapture]);
  async function signOut() {
    setLogout(false);
    await outbox.lockAccount();
    owner.clear();
    client.clear();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed");
      window.location.replace(new URL("/login", window.location.origin).href);
    } catch {
      setLocked(true);
      setBootError("This device is locked. Connect to finish signing out.");
    }
  }
  if (locked)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Confirm your account</h1>
        <p>
          {bootError ||
            "The signed-in session changed. Saved device captures stay with their original account."}
        </p>
        <Button
          onClick={() =>
            window.location.replace(
              new URL("/app", window.location.origin).href,
            )
          }
        >
          Continue online
        </Button>
        <Button variant="outline" onClick={() => void signOut()}>
          Finish signing out
        </Button>
      </main>
    );
  if (!identity || !workspace.data)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Opening your workspace</h1>
        {bootError || workspace.error ? (
          <>
            <p role="alert">{bootError || workspace.error?.message}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </>
        ) : (
          <p role="status">
            Checking your account and loading your information…
          </p>
        )}
      </main>
    );
  const dirtyDrafts = Object.values(owner.store.getState().drafts).filter(
    (draft) => draft.dirtyFields.length,
  ).length;
  const data = workspace.data,
    pending = queue.filter((r) => r.status !== "synced");
  const mutate = async <T,>(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<T> => {
    try {
      const response = await request<T>(userId, path, {
        method,
        body: JSON.stringify(body),
      });
      await refresh();
      return response;
    } catch (error) {
      await refresh();
      throw error;
    }
  };
  const navigation = (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {nav.map(([route, name, icon]) => (
        <Link
          key={route}
          href={`/app/${route}`}
          onClick={() => setMenu(false)}
          aria-current={view === route ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${view === route ? "bg-muted font-semibold" : "hover:bg-muted/60"}`}
        >
          <Icon name={icon} className="h-4 w-4" />
          {name}
        </Link>
      ))}
    </nav>
  );
  return (
    <WorkspaceContext.Provider
      value={{ userId, data, timezone: zone, refresh, mutate }}
    >
      <div className="bearing-app flex min-h-dvh min-w-0 bg-background text-foreground">
        <StoredThemeOverride />
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 space-y-6 border-r border-border p-4 md:block">
          <Link
            href="/app/today"
            className="flex min-h-11 items-center gap-2 font-bold"
          >
            <Icon name="Brain" />
            bearing.now
          </Link>
          {navigation}
          <p className="break-all text-xs text-muted-foreground">
            {identity?.email}
          </p>
          <Button variant="ghost" onClick={() => setLogout(true)}>
            Sign out
          </Button>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 p-3 backdrop-blur">
            <Button
              className="md:hidden"
              variant="outline"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Icon name="Menu" />
            </Button>
            <form action="/app/search" className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="workspace-search">
                Search your information
              </label>
              <input
                id="workspace-search"
                name="q"
                className={fieldClass}
                placeholder="Search your information…"
              />
            </form>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Icon name={resolvedTheme === "dark" ? "Sun" : "Moon"} />
            </Button>
            <Button onClick={openCapture}>Quick Capture</Button>
          </header>
          <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span role="status">{syncStatus || "Connected"}</span>
              <span>
                {ready ? (
                  <a className="underline" href="/offline.html">
                    Available offline · open device Journal
                  </a>
                ) : (
                  "Preparing offline capture…"
                )}
              </span>
            </div>
            {workspace.error && (
              <p role="alert">
                Refresh failed: {workspace.error.message}. Your open drafts are
                retained.
              </p>
            )}
            <section aria-label="Capture sync status" className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span>
                  {pending.length} pending ·{" "}
                  {queue.filter((r) => r.status === "synced").length} synced on
                  this device
                </span>
                {pending.length > 0 && (
                  <Button variant="outline" onClick={() => void sync(true)}>
                    Retry sync
                  </Button>
                )}
              </div>
              {pending.map((r) => (
                <article
                  className="rounded-xl border border-border bg-muted/30 p-3 text-sm"
                  key={r.clientId}
                >
                  <strong>
                    {r.status === "error" ? "Needs attention" : "Pending sync"}
                  </strong>
                  <p className="whitespace-pre-wrap break-words">{r.text}</p>
                  {r.error && <p role="alert">{r.error}</p>}
                </article>
              ))}
            </section>
            {view === "journal" && (
              <PageHeader
                title="Daily Journal"
                subtitle="A living log of your day. Backdate a moment without changing when it was captured."
                icon="BookOpen"
              />
            )}
            <CaptureComposer
              inline={view === "journal"}
              open={captureOpen}
              onOpenChange={setCaptureOpen}
              date={date}
              sync={() => sync()}
            />
            {view === "today" ? (
              <Today date={date} />
            ) : view === "journal" ? (
              <Journal date={date} />
            ) : view === "inbox" ? (
              <Inbox />
            ) : view === "library" ? (
              <Library recordId={recordId} />
            ) : view === "projects" ? (
              <Projects key={recordId || "all"} recordId={recordId} />
            ) : view === "calendar" ? (
              <Calendar date={date} />
            ) : view === "coach" || view === "search" ? (
              <Search
                key={`${view}:${params.toString()}`}
                coach={view === "coach"}
              />
            ) : view === "reviews" ? (
              <Reviews recordId={recordId} />
            ) : (
              <Settings onSignOut={() => setLogout(true)} />
            )}
          </main>
        </div>
        <Dialog open={menu} onOpenChange={setMenu}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Navigation</DialogTitle>
              <DialogDescription>
                Open a view of your information.
              </DialogDescription>
            </DialogHeader>
            {navigation}
            <Button
              variant="outline"
              onClick={() => {
                setMenu(false);
                setLogout(true);
              }}
            >
              Sign out
            </Button>
          </DialogContent>
        </Dialog>
        <Dialog open={logout} onOpenChange={setLogout}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out of this account?</DialogTitle>
              <DialogDescription>
                {pending.length
                  ? `${pending.length} unsynced capture${pending.length === 1 ? "" : "s"} will remain on this device for ${identity?.email}. They will not sync into another account. Sign back into this account online to resume.`
                  : "Saved device captures stay separate from other accounts."}
                {dirtyDrafts > 0 &&
                  " Unsaved editor changes will be discarded. Stay signed in to save or capture them first."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => void signOut()}>
              Keep device captures and sign out
            </Button>
            <Button variant="outline" onClick={() => setLogout(false)}>
              Stay signed in
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </WorkspaceContext.Provider>
  );
}
function Settings({ onSignOut }: { onSignOut(): void }) {
  const { data, timezone, mutate } = useWorkspace(),
    [startup, setStartup] = useState(data.preferences.startup || "today"),
    [zone, setZone] = useState(timezone),
    [name, setName] = useState(""),
    [kind, setKind] = useState("area"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function action(fn: () => Promise<any>) {
    setError("");
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" icon="Settings" />
      <SectionCard title="Start your day">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              mutate("preferences", { startup, timezone: zone }, "PUT"),
            );
          }}
        >
          <label className="block text-sm">
            Startup view
            <select
              className={`${fieldClass} mt-1`}
              value={startup}
              onChange={(e) => setStartup(e.target.value)}
            >
              {[
                "today",
                "journal",
                "inbox",
                "projects",
                "library",
                "calendar",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Timezone
            <input
              className={`${fieldClass} mt-1`}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="America/New_York"
            />
          </label>
          <Button>Save preferences</Button>
        </form>
      </SectionCard>
      <SectionCard title="Appearance">
        <Appearance />
      </SectionCard>
      <SectionCard title="Areas and Tags">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await mutate("tags", { name, kind });
              setName("");
            });
          }}
        >
          <label className="block text-sm">
            Name
            <input
              className={`${fieldClass} mt-1`}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Kind
            <select
              className={`${fieldClass} mt-1`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="area">Area · an enduring responsibility</option>
              <option value="tag">Tag · a flexible topic</option>
            </select>
          </label>
          <Button>Create label</Button>
        </form>
      </SectionCard>
      <SectionCard title="Optional demo data">
        <p className="mb-3 text-sm text-muted-foreground">
          Add examples only to your account. Edited examples and personal
          references are protected from removal.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void action(() => mutate("demo", {}))}
          >
            Add demo data
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (
                window.confirm(
                  "Remove unedited demo data from this account? Personal references may prevent removal.",
                )
              )
                void action(() =>
                  mutate(
                    "demo",
                    { confirmation: "REMOVE DEMO DATA" },
                    "DELETE",
                  ),
                );
            }}
          >
            Remove demo data
          </Button>
        </div>
      </SectionCard>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved && <p role="status">Saved.</p>}
      <Button variant="outline" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}
