"use client";

import { colorGradient, colorWithAlpha, projectColor } from "@/lib/product-colors";

import { reportWriteError } from "@/hooks/use-browser-writes";

import { format } from "date-fns";

import { itemDraftKey } from "@/lib/item-drafts";
import { useItemDraft, DraftNotice } from "./item-draft-session";
import { useOpenItem } from "@/hooks/use-open-item";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useBearing } from "@/store/bearing";
import { useItem, useUpdateItem, useDeleteItem, useCreateLink, useDeleteLink, useItems, useToggleHabit } from "@/lib/hooks";
import { Icon } from "./icon";
import { ITEM_TYPE_MAP, DOMAIN_MAP, PRIORITY_META, STATUS_META } from "@/lib/constants";
import { fmtDate, smartDate, dateColor } from "@/lib/dates";
import { notify } from "@/lib/toast";
import ReactMarkdown from "react-markdown";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function ItemDetailSheet() {
  const { itemDetailId, closeItemDetail, openItemEditor } = useBearing();
  useOpenItem(itemDetailId);
  const { data: item, isLoading } = useItem(itemDetailId);
  const update = useUpdateItem();
  const del = useDeleteItem();
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();
  const [linkSearch, setLinkSearch] = useState("");
  const draftKey = itemDetailId ? itemDraftKey(itemDetailId) : null;
  const { owner, draft, data } = useItemDraft(draftKey, item);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editingContent = !!draftKey && editingKey === draftKey;
  const contentDraft = data.content;
  const setContentDraft = (content: string) => draftKey && owner.change(draftKey, { content });

  const { data: searchResults } = useItems(linkSearch ? { q: linkSearch } : {});
  const linkResults = searchResults?.items ?? [];

  if (!itemDetailId) return null;

  const typeMeta = ITEM_TYPE_MAP[item?.type] || { icon: "Circle", color: "var(--muted-foreground)", name: item?.type };
  const domain = item?.domainId ? DOMAIN_MAP[item.domainId] : null;
  const isDone = item?.status === "done";

  async function saveContent() {
    if (!draftKey) return;
    const ticket = owner.beginSave(draftKey, ["content"]);
    if (!ticket) return;
    try {
      const saved = await update.mutateAsync({ id: ticket.data.id, revision: ticket.data.revision, content: ticket.data.content });
      const completed = owner.complete(ticket, saved);
      if (!completed) return;
      if (useBearing.getState().itemDetailId === ticket.data.id && !completed.dirtyFields.includes("content")) setEditingKey(null);
      notify.success("Notes saved");
    } catch (error) {
      owner.fail(ticket, error);
    }
  }

  async function addLink(toId: string) {
    try {
      await createLink.mutateAsync({ fromId: item.id, revision: item.revision, toId, type: "related_to" });
      setLinkSearch("");
      notify.success("Connected");
    } catch (error) { reportWriteError(error); }
  }

  async function removeLink(linkId: string, direction: "out" | "in", type: string, revision: number) {
    try {
      if (direction === "out") {
        await deleteLink.mutateAsync({ fromId: item.id, revision, toId: linkId, type });
      } else {
        await deleteLink.mutateAsync({ fromId: linkId, revision, toId: item.id, type });
      }
      notify.success("Link removed");
    } catch (error) { reportWriteError(error); }
  }

  async function handleDelete() {
    try {
      await del.mutateAsync({ id: item.id, revision: item.revision });
      closeItemDetail();
      notify.success("Archived");
    } catch (error) { reportWriteError(error); }
  }

  return (
    <Sheet key={itemDetailId} open={!!itemDetailId} onOpenChange={(o) => {
      if (!o && useBearing.getState().itemDetailId === itemDetailId) closeItemDetail();
    }}>
      <SheetContent className="w-full gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        {isLoading || !item ? (
          <DetailSkeleton />
        ) : (
          <div className="flex h-full flex-col">
            {/* ── Hero Header with gradient ── */}
            <div
              className="relative flex-shrink-0 overflow-hidden pl-6 pr-16 pb-5 pt-6"
              style={{
                background: colorGradient(typeMeta.color, 9, "70%"),
              }}
            >
              <SheetHeader className="space-y-0 p-0">
                {/* Breadcrumb */}
                <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="inline-flex items-center gap-1 font-medium"
                    style={{ color: typeMeta.color }}
                  >
                    <Icon name={typeMeta.icon} className="h-3 w-3" />
                    {typeMeta.name}
                  </span>
                  {domain && (
                    <>
                      <Icon name="ChevronRight" className="h-3 w-3 opacity-40" />
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: domain.color }} />
                        {domain.name}
                      </span>
                    </>
                  )}
                  {item.project && (
                    <>
                      <Icon name="ChevronRight" className="h-3 w-3 opacity-40" />
                      <span className="inline-flex items-center gap-1" style={{ color: projectColor(item.project, item.type) }}>
                        <Icon name="Folder" className="h-3 w-3" />
                        {item.project.name}
                      </span>
                    </>
                  )}
                </div>

                {/* Title row */}
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm"
                    style={{ background: colorWithAlpha(typeMeta.color, 13), color: typeMeta.color }}
                  >
                    <Icon name={typeMeta.icon} className="h-6 w-6" />
                  </span>
                  <SheetTitle
                    className={cn(
                      "flex-1 text-xl font-semibold leading-tight tracking-tight",
                      isDone && "text-muted-foreground line-through",
                    )}
                  >
                    {item.title}
                  </SheetTitle>
                </div>

                {/* Status + key meta pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                    style={{
                      background: colorWithAlpha((STATUS_META as any)[item.status]?.color || "var(--muted-foreground)", 13),
                      color: (STATUS_META as any)[item.status]?.color || "var(--muted-foreground)",
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: (STATUS_META as any)[item.status]?.color }} />
                    {(STATUS_META as any)[item.status]?.name || item.status}
                  </span>
                  {item.priority > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ background: colorWithAlpha(PRIORITY_META[item.priority]?.color, 13), color: PRIORITY_META[item.priority]?.color }}
                    >
                      <Icon name="Flag" className="h-2.5 w-2.5" />
                      {PRIORITY_META[item.priority]?.name}
                    </span>
                  )}
                  {item.dueDate && (
                    <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium", dateColor(item.dueDate))}>
                      <Icon name="CalendarClock" className="h-2.5 w-2.5" />
                      {smartDate(item.dueDate)}
                    </span>
                  )}
                  {item.scheduledAt && !item.dueDate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      <Icon name="Clock" className="h-2.5 w-2.5" />
                      {fmtDate(item.scheduledAt, "MMM d, p")}
                    </span>
                  )}
                </div>
                <SheetDescription className="sr-only">{item.title}</SheetDescription>
              </SheetHeader>
            </div>

            <DraftNotice draft={draft} onDiscard={() => draftKey && owner.discard(draftKey)} />
            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                {/* Type-specific highlight card */}
                <TypeHighlight item={item} typeMeta={typeMeta} />

                {/* Metadata grid (clean, not raw dump) */}
                {item.metadata && hasUsefulMetadata(item.metadata, item.type) && (
                  <MetadataGrid metadata={item.metadata} type={item.type} />
                )}

                {/* Tags */}
                {item.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((t: any) => (
                      <span
                        key={t.tag.id}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium"
                        style={{ background: colorWithAlpha(t.tag.color, 9), color: t.tag.color }}
                      >
                        <span className="h-1 w-1 rounded-full" style={{ background: t.tag.color }} />
                        {t.tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Notes / Content — type-aware */}
                {item.type === "journal" ? (
                  <JournalEditor
                    content={item.content}
                    editing={editingContent}
                    draft={contentDraft}
                    onEdit={() => { setEditingKey(draftKey); }}
                    onCancel={() => setEditingKey(null)}
                    onSave={saveContent}
                    onChange={setContentDraft}
                    accentColor={typeMeta.color}
                    itemId={item.id}
                  />
                ) : (
                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Icon name="FileText" className="h-3 w-3" />
                      {item.type === "note" ? "Content" : item.type === "idea" ? "Description" : "Notes"}
                    </h4>
                    {!editingContent ? (
                      <button
                        onClick={() => { setEditingKey(draftKey); }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <Icon name="Pencil" className="h-3 w-3" /> Edit
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button onClick={() => setEditingKey(null)} className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                        <button onClick={saveContent} className="rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Save</button>
                      </div>
                    )}
                  </div>
                  {editingContent ? (
                    <Textarea
                      rows={6}
                      value={contentDraft}
                      onChange={(e) => setContentDraft(e.target.value)}
                      className="resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                      placeholder="Write your notes… (Markdown supported)"
                      autoFocus
                    />
                  ) : item.content ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2">
                      <ReactMarkdown>{item.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm italic text-muted-foreground/60">No notes yet. Click edit to add context.</p>
                  )}
                </div>
                )}

                {/* Habit tracker */}
                {item.type === "habit" && (
                  <HabitSection itemId={item.id} logs={item.habitLogs || []} meta={item.metadata} accentColor={typeMeta.color} />
                )}

                {/* Connections */}
                <div className="rounded-xl border border-border/50 bg-card/30 p-4">
                  <h4 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Icon name="Network" className="h-3 w-3" />
                      Connections
                    </span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                      {(item.linksFrom?.length || 0) + (item.linksTo?.length || 0)}
                    </span>
                  </h4>

                  {/* Search to link */}
                  <div className="relative mb-3">
                    <Icon name="Search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      placeholder="Search to connect…"
                      className="h-8 bg-background pl-8 text-sm"
                    />
                    <AnimatePresence>
                      {linkSearch && linkResults.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-popover shadow-lg"
                        >
                          {linkResults.filter((i: any) => i.id !== item.id).slice(0, 8).map((i: any) => {
                            const m = ITEM_TYPE_MAP[i.type] || { icon: "Circle", color: "var(--muted-foreground)" };
                            return (
                              <button
                                key={i.id}
                                onClick={() => addLink(i.id)}
                                className="flex w-full items-center gap-2 border-b border-border/40 p-2 text-left text-sm last:border-0 hover:bg-muted/50"
                              >
                                <span className="flex h-6 w-6 items-center justify-center rounded" style={{ background: colorWithAlpha(m.color, 9), color: m.color }}>
                                  <Icon name={m.icon} className="h-3 w-3" />
                                </span>
                                <span className="flex-1 truncate">{i.title}</span>
                                <Icon name="Plus" className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Connection list — compact rows */}
                  <div className="space-y-1.5">
                    {item.linksFrom?.map((l: any) => {
                      const m = ITEM_TYPE_MAP[l.to.type] || { icon: "Circle", color: "var(--muted-foreground)" };
                      return (
                        <ConnectionRow
                          key={l.id}
                          icon={m.icon}
                          color={m.color}
                          title={l.to.title}
                          type={m.name}
                          direction="out"
                          onClick={() => useBearing.getState().openItemDetail(l.to.id)}
                          onRemove={() => removeLink(l.to.id, "out", l.type, item.revision)}
                        />
                      );
                    })}
                    {item.linksTo?.map((l: any) => {
                      const m = ITEM_TYPE_MAP[l.from.type] || { icon: "Circle", color: "var(--muted-foreground)" };
                      return (
                        <ConnectionRow
                          key={l.id}
                          icon={m.icon}
                          color={m.color}
                          title={l.from.title}
                          type={m.name}
                          direction="in"
                          onClick={() => useBearing.getState().openItemDetail(l.from.id)}
                          onRemove={() => removeLink(l.from.id, "in", l.type, l.from.revision)}
                        />
                      );
                    })}
                    {!item.linksFrom?.length && !item.linksTo?.length && (
                      <div className="flex flex-col items-center py-4 text-center">
                        <Icon name="Link2" className="mb-1 h-6 w-6 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">No connections yet</p>
                        <p className="text-xs text-muted-foreground/60">Search above to link this item to others</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="flex items-center justify-center gap-3 pb-2 text-xs text-muted-foreground/50">
                  <span>Created {fmtDate(item.createdAt, "MMM d, yyyy")}</span>
                  <span>·</span>
                  <span>Updated {fmtDate(item.updatedAt, "MMM d")}</span>
                </div>
              </div>
            </div>

            {/* ── Sticky action bar ── */}
            <div className="flex-shrink-0 border-t border-border/60 bg-background/80 px-6 py-3 backdrop-blur-md">
              <div className="flex flex-wrap items-center gap-2">
                {(item.type === "task" || item.type === "milestone" || item.type === "bookmark") && (
                  <Button
                    size="sm"
                    variant={isDone ? "outline" : "default"}
                    onClick={() => { update.mutate({ id: item.id, revision: item.revision, status: isDone ? "active" : "done" }, { onSuccess: () => notify.success(isDone ? "Reopened" : "Completed") }); }}
                    className="gap-1.5"
                  >
                    <Icon name={isDone ? "RotateCcw" : "Check"} className="h-3.5 w-3.5" />
                    {isDone ? "Reopen" : "Complete"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { openItemEditor(item); closeItemDetail(); }}
                  className="gap-1.5"
                >
                  <Icon name="Pencil" className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="ml-auto gap-1.5 text-expense hover:bg-expense/10 hover:text-expense">
                      <Icon name="Trash2" className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive this item?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark &ldquo;{item.title}&rdquo; as archived.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-expense hover:bg-expense">Archive</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Type-specific highlight card ──
function TypeHighlight({ item, typeMeta }: { item: any; typeMeta: any }) {
  const m = item.metadata || {};

  // Finance: prominent amount display
  if (item.type === "finance" && m.amount != null) {
    const isIncome = m.kind === "income";
    const isGoal = m.kind === "goal";
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl p-4"
        style={{ background: colorGradient(isIncome ? "var(--income)" : isGoal ? "var(--type-bookmark)" : "var(--expense)", 8, "100%") }}
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isGoal ? "Savings goal" : isIncome ? "Income" : "Expense"}
            </p>
            <p
              className="mt-0.5 text-3xl font-bold tabular-nums"
              style={{ color: isIncome ? "var(--income)" : isGoal ? "var(--type-bookmark)" : "var(--expense)" }}
            >
              {isIncome ? "+" : isGoal ? "" : "−"}${Number(m.amount).toLocaleString()}
            </p>
          </div>
          {m.recurring && m.recurring !== "one-time" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-1 text-xs font-medium text-muted-foreground">
              <Icon name="Repeat" className="h-3 w-3" />
              {m.recurring}
            </span>
          )}
        </div>
        {isGoal && m.current != null && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>${Number(m.current).toLocaleString()} saved</span>
              <span>{Math.round((m.current / m.amount) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(m.current / m.amount) * 100}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full bg-type-bookmark"
              />
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // Bookmark: books with reading progress, media with watch status
  if (item.type === "bookmark" && (m.rating || m.author || m.medium)) {
    const isBook = m.medium === "book";
    const isMedia = m.medium === "movie" || m.medium === "video" || m.medium === "podcast";
    const statusLabel = m.status === "reading" ? "Reading" : m.status === "finished" ? "Finished" : isMedia ? "To watch" : "Queued";
    const statusColor = m.status === "finished" ? "var(--success)" : m.status === "reading" ? "var(--type-bookmark)" : isMedia ? "var(--type-idea)" : "var(--muted-foreground)";
    const readingPct = isBook && m.totalPages > 0 ? Math.min(100, Math.round(((m.currentPage || 0) / m.totalPages) * 100)) : 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/50 bg-card/30 p-4"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: colorWithAlpha(typeMeta.color, 9), color: typeMeta.color }}>
            <Icon name={m.medium === "book" ? "BookOpen" : m.medium === "movie" ? "Film" : m.medium === "podcast" ? "Mic" : m.medium === "article" ? "FileText" : m.medium === "course" ? "GraduationCap" : "Bookmark"} className="h-5 w-5" />
          </span>
          <div className="flex-1">
            {m.author && <p className="text-sm font-medium">{m.author}</p>}
            <p className="text-xs capitalize text-muted-foreground">{m.medium || "bookmark"}</p>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase"
            style={{ background: colorWithAlpha(statusColor, 13), color: statusColor }}
          >
            {m.status === "finished" && <Icon name="Check" className="h-2.5 w-2.5" />}
            {statusLabel}
          </span>
        </div>

        {/* Book reading progress */}
        {isBook && m.totalPages > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Page {m.currentPage || 0} of {m.totalPages}
              </span>
              <span className="font-semibold" style={{ color: typeMeta.color }}>{readingPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${readingPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: typeMeta.color }}
              />
            </div>
          </div>
        )}

        {/* Book quick progress update */}
        {isBook && m.totalPages > 0 && m.status !== "finished" && (
          <ReadingProgressUpdater item={item} currentPage={m.currentPage || 0} totalPages={m.totalPages} accentColor={typeMeta.color} />
        )}

        {/* Rating */}
        {m.rating > 0 && (
          <div className="mt-2 flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Rating:</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon
                  key={i}
                  name="Star"
                  className={cn("h-3.5 w-3.5", i < m.rating ? "fill-priority-high text-priority-high" : "text-muted-foreground/30")}
                />
              ))}
            </div>
          </div>
        )}

        {/* URL link */}
        {m.url && (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-type-bookmark hover:underline"
          >
            <Icon name="ExternalLink" className="h-3 w-3" />
            {m.url.replace(/^https?:\/\//, "").slice(0, 40)}
          </a>
        )}
      </motion.div>
    );
  }

  // Contact: relationship + birthday
  if (item.type === "contact" && (m.relationship || m.birthday)) {
    const initials = item.title.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 p-3"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold" style={{ background: colorWithAlpha(typeMeta.color, 13), color: typeMeta.color }}>
          {initials}
        </span>
        <div className="flex-1">
          {m.relationship && <p className="text-sm font-medium capitalize">{m.relationship}</p>}
          {m.birthday && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon name="Cake" className="h-3 w-3" />
              {fmtDate(m.birthday, "MMM d")}
            </p>
          )}
        </div>
        {m.lastContact && (
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
            Last contact {smartDate(m.lastContact)}
          </span>
        )}
      </motion.div>
    );
  }

  // Habit: streak display
  if (item.type === "habit" && (m.streak != null || m.target != null)) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 rounded-xl p-4"
        style={{ background: colorGradient(typeMeta.color, 8, "100%") }}
      >
        <div className="text-center">
          <p className="text-2xl font-bold" style={{ color: typeMeta.color }}>{m.streak || 0}</p>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">day streak</p>
        </div>
        <div className="h-10 w-px bg-border/40" />
        <div className="flex-1">
          <p className="text-sm font-medium capitalize">{m.cadence || "daily"}</p>
          {m.target && <p className="text-xs text-muted-foreground">Goal: {m.target} {m.unit || ""}</p>}
        </div>
      </motion.div>
    );
  }

  // Symptom: severity meter
  if (item.type === "symptom" && m.severity != null) {
    const sevColor = m.severity >= 4 ? "var(--expense)" : m.severity >= 3 ? "var(--priority-high)" : "var(--priority-medium)";
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/30 p-3"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: colorWithAlpha(sevColor, 9), color: sevColor }}>
          <Icon name="Activity" className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Severity: {m.severity}/5</p>
          <div className="mt-1 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < m.severity ? sevColor : "var(--muted)" }} />
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
}

// ── Journal editor — large writing-focused area ──
function JournalEditor({
  content, editing, draft, onEdit, onCancel, onSave, onChange, accentColor, itemId,
}: {
  content: string | null;
  editing: boolean;
  draft: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onChange: (v: string) => void;
  accentColor: string;
  itemId: string;
}) {
  const wordCount = (editing ? draft : content || "").trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  if (editing) {
    return (
      <div className="overflow-hidden rounded-xl border" style={{ borderColor: colorWithAlpha(accentColor, 25) }}>
        {/* Editor toolbar */}
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon name="PenLine" className="h-3 w-3" style={{ color: accentColor }} />
            <span className="font-medium">Writing</span>
            <span>·</span>
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{readTime} min read</span>
          </div>
          <div className="flex gap-1">
            <button onClick={onCancel} className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={onSave} className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: colorWithAlpha(accentColor, 16), color: "var(--foreground)" }}>Save</button>
          </div>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          className="resize-y border-0 bg-background p-4 text-[15px] leading-relaxed focus-visible:ring-0"
          placeholder="What's on your mind? Write freely…&#10;&#10;Markdown is supported — use **bold**, *italic*, # headings, - lists."
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border/50 bg-card/30">
      <div className="flex items-center justify-between border-b border-border/30 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="BookHeart" className="h-3 w-3" style={{ color: accentColor }} />
          <span className="font-medium">Journal entry</span>
          {content && (
            <>
              <span>·</span>
              <span>{wordCount} words</span>
              <span>·</span>
              <span>{readTime} min read</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon name="Pencil" className="h-3 w-3" /> {content ? "Edit" : "Write"}
          </button>
          <button
            onClick={() => useBearing.getState().openJournalEditor(itemId)}
            className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:text-foreground"
            style={{ color: accentColor }}
          >
            <Icon name="Maximize2" className="h-3 w-3" /> Full editor
          </button>
        </div>
      </div>
      <div className="px-4 py-3">
        {content ? (
          <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        ) : (
          <button
            onClick={onEdit}
            className="flex w-full flex-col items-center py-8 text-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
          >
            <Icon name="PenLine" className="mb-2 h-6 w-6" style={{ color: accentColor }} />
            <p className="text-sm">Start writing your journal entry…</p>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Reading progress updater (for books) ──
function ReadingProgressUpdater({ item, currentPage, totalPages, accentColor }: { item: any; currentPage: number; totalPages: number; accentColor: string }) {
  const update = useUpdateItem();
  const key = itemDraftKey(item.id);
  const { owner, draft, data } = useItemDraft(key, item);
  const pageInput = String(data.metadata.currentPage ?? currentPage);

  async function updatePage(val: number) {
    if (owner.get(key)?.pending) return;
    const clamped = Math.max(0, Math.min(totalPages, val));
    const isFinished = clamped >= totalPages;
    owner.change(key, {
      metadata: { ...owner.get(key)?.data.metadata, currentPage: clamped, ...(isFinished ? { status: "finished" } : {}) },
      ...(isFinished ? { status: "done" } : {}),
    });
    const ticket = owner.beginSave(key, ["metadata", ...(isFinished ? ["status"] : [])]);
    if (!ticket) return;
    try {
      const saved = await update.mutateAsync({
        id: ticket.data.id, revision: ticket.data.revision, metadata: ticket.data.metadata,
        ...(isFinished ? { status: "done" } : {}),
      });
      if (owner.complete(ticket, saved) && isFinished) notify.success("Finished reading!");
    } catch (error) {
      owner.fail(ticket, error);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="number"
        min={0}
        max={totalPages}
        value={pageInput}
        onChange={(e) => owner.change(key, { metadata: { ...owner.get(key)?.data.metadata, currentPage: e.target.value } })}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v) && v !== currentPage) updatePage(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-7 w-16 rounded-md border border-border/60 bg-background px-2 text-xs tabular-nums outline-none focus:border-primary/40"
      />
      <span className="text-xs text-muted-foreground">/ {totalPages} pages</span>
      <div className="ml-auto flex gap-1">
        <button
          onClick={() => updatePage(Math.max(0, currentPage - 10))}
          className="rounded-md border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          title="Go back 10 pages"
        >
          −10
        </button>
        <button
          onClick={() => updatePage(Math.min(totalPages, currentPage + 10))}
          className="rounded-md border border-border/60 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
          title="Forward 10 pages"
        >
          +10
        </button>
        <button
          onClick={() => updatePage(totalPages)}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-white"
          style={{ background: colorWithAlpha(accentColor, 16), color: "var(--foreground)" }}
          title="Mark as finished"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ── Metadata grid (filtered to useful fields) ──
function MetadataGrid({ metadata, type }: { metadata: any; type: string }) {
  // Skip fields already shown in TypeHighlight
  const skip: Record<string, string[]> = {
    finance: ["kind", "amount", "recurring", "current"],
    bookmark: ["medium", "author", "status", "rating", "url", "currentPage", "totalPages"],
    contact: ["relationship", "birthday", "lastContact"],
    habit: ["cadence", "target", "unit", "streak"],
    symptom: ["severity"],
  };
  const skipFields = new Set(skip[type] || []);
  const entries = Object.entries(metadata).filter(([k]) => !skipFields.has(k));
  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {entries.map(([k, v]: any) => (
        <div key={k} className="rounded-lg border border-border/40 bg-card/20 p-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.replace(/_/g, " ")}</p>
          <p className="mt-0.5 truncate text-sm font-medium">{String(v)}</p>
        </div>
      ))}
    </div>
  );
}

// ── Compact connection row ──
function ConnectionRow({
  icon, color, title, type, direction, onClick, onRemove,
}: {
  icon: string; color: string; title: string; type: string; direction: "in" | "out"; onClick: () => void; onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6 }}
      className="group flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 p-2 transition-all hover:border-border hover:bg-background"
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md" style={{ background: colorWithAlpha(color, 9), color }}>
          <Icon name={icon} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {direction === "in" ? "← linked from" : "→ links to"} · {type}
          </p>
        </div>
      </button>
      <button
        onClick={onRemove}
        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover-action opacity-0 transition-all hover:bg-expense/10 hover:text-expense group-hover:opacity-100 group-focus-within:opacity-100"
        title="Remove connection"
      >
        <Icon name="X" className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

// ── Habit section with improved heatmap ──
function HabitSection({ itemId, logs, meta, accentColor }: { itemId: string; logs: any[]; meta: any; accentColor: string }) {
  const toggle = useToggleHabit();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = format(today, "yyyy-MM-dd");
  const doneToday = logs.some((l) => new Date(l.date).toISOString().slice(0, 10) === todayKey);

  const days: Date[] = [];
  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const logSet = new Set(logs.map((l) => new Date(l.date).toISOString().slice(0, 10)));
  const doneCount = days.filter((d) => logSet.has(format(d, "yyyy-MM-dd"))).length;

  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Icon name="CalendarCheck" className="h-3 w-3" />
            Last 5 weeks
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{doneCount}/35 days · streak {meta?.streak || 0}</p>
        </div>
        <Button
          size="sm"
          variant={doneToday ? "secondary" : "default"}
          onClick={() => toggle.mutate({ id: itemId, date: todayKey })}
          className="gap-1.5"
          style={!doneToday ? { background: colorWithAlpha(accentColor, 16), color: "var(--foreground)" } : {}}
        >
          <Icon name={doneToday ? "Check" : "Plus"} className="h-3.5 w-3.5" />
          {doneToday ? "Done today" : "Mark today"}
        </Button>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridAutoColumns: "minmax(0, 1fr)" }}>
        {days.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const done = logSet.has(key);
          const isToday = key === todayKey;
          return (
            <motion.div
              key={key}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              title={fmtDate(d, "EEE, MMM d")}
              className={cn("aspect-square rounded-sm transition-colors", isToday && "ring-1 ring-offset-1 ring-offset-background")}
              style={{
                background: done ? accentColor : "var(--muted)",
                opacity: done ? 1 : 0.4,
                ...(isToday ? { boxShadow: `0 0 0 2px ${accentColor}` } : {}),
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Loading skeleton ──
function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-5 pt-6">
        <div className="mb-3 h-3 w-40 skeleton rounded bg-muted/60" />
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 skeleton rounded-2xl bg-muted/60" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-3/4 skeleton rounded bg-muted/60" />
            <div className="h-3 w-1/2 skeleton rounded bg-muted/40" />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          <div className="h-5 w-16 skeleton rounded-full bg-muted/60" />
          <div className="h-5 w-20 skeleton rounded-full bg-muted/40" />
        </div>
      </div>
      <div className="flex-1 space-y-4 px-6 py-5">
        <div className="h-20 skeleton rounded-xl bg-muted/40" />
        <div className="h-32 skeleton rounded-xl bg-muted/30" />
        <div className="h-24 skeleton rounded-xl bg-muted/30" />
      </div>
    </div>
  );
}

// ── Helpers ──
function hasUsefulMetadata(metadata: any, type: string) {
  const skip: Record<string, string[]> = {
    finance: ["kind", "amount", "recurring", "current"],
    bookmark: ["medium", "author", "status", "rating", "url", "currentPage", "totalPages"],
    contact: ["relationship", "birthday", "lastContact"],
    habit: ["cadence", "target", "unit", "streak"],
    symptom: ["severity"],
  };
  const skipFields = new Set(skip[type] || []);
  return Object.keys(metadata).some((k) => !skipFields.has(k));
}
