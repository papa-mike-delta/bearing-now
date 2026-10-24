"use client";

import { colorWithAlpha } from "@/lib/product-colors";

import { reportWriteError } from "@/hooks/use-browser-writes";

import { itemDraftKey } from "@/lib/item-drafts";
import { browserJournalStorage, clearJournalDraft } from "@/lib/journal-draft-storage";
import { useJournalDraftStorage } from "@/hooks/use-journal-draft-storage";
import { useItemDraft, useDraftSession, DraftNotice } from "../item-draft-session";
import { useOpenItem } from "@/hooks/use-open-item";

import { useState, useMemo, useCallback } from "react";
import { useBearing } from "@/store/bearing";
import { useItem, useCreateItem, useUpdateItem, useDeleteItem, useItems, useDomains } from "@/lib/hooks";
import { Icon } from "../icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";
import ReactMarkdown from "react-markdown";
import { RichTextEditor } from "../rich-text-editor";

const ACCENT = "var(--type-journal)";
const DEFAULT_DAILY_GOAL = 500;
const GOAL_STORAGE_KEY = "lifeos-daily-writing-goal";

function getWritingGoal(): number {
  if (typeof window === "undefined") return DEFAULT_DAILY_GOAL;
  try {
    const stored = localStorage.getItem(GOAL_STORAGE_KEY);
    return stored ? parseInt(stored, 10) || DEFAULT_DAILY_GOAL : DEFAULT_DAILY_GOAL;
  } catch {
    return DEFAULT_DAILY_GOAL;
  }
}

/** Compute rich text statistics from markdown content */
function computeStats(content: string) {
  const text = content.trim();
  if (!text) {
    return { words: 0, chars: 0, charsNoSpaces: 0, sentences: 0, paragraphs: 0, readTime: 1 };
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const charsNoSpaces = text.replace(/\s/g, "").length;
  // Count sentences by period, exclamation, question mark followed by space or end
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || (words > 0 ? 1 : 0);
  // Count paragraphs by double newline or single newline with content
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length || 1;
  const readTime = Math.max(1, Math.ceil(words / 200));
  return { words, chars, charsNoSpaces, sentences, paragraphs, readTime };
}

export function JournalEditorView() {
  const { journalEditId, journalDraftKey, setView, openItemDetail, finishNewJournal } = useBearing();
  useOpenItem(journalEditId);
  const { data: existingItem, isLoading } = useItem(journalEditId);
  const create = useCreateItem();
  const update = useUpdateItem();
  const del = useDeleteItem();
  const { data: domData } = useDomains();

  const [mood, setMood] = useState(3);
  const [showPreview, setShowPreview] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(getWritingGoal);
  const [showGoalInput, setShowGoalInput] = useState(false);
  const [goalInput, setGoalInput] = useState(() => String(getWritingGoal()));

  const domains = domData?.domains || [];
  const mindSoulDomain = domains.find((d: any) => d.key === "mind_soul");

  const draftKey = journalEditId ? itemDraftKey(journalEditId) : journalDraftKey;
  const seed = useMemo(() => journalEditId ? existingItem : {
    type: "journal", domainId: mindSoulDomain?.id ?? "",
  }, [journalEditId, existingItem, mindSoulDomain?.id]);
  const { owner, draft, data } = useItemDraft(draftKey, seed);
  const { userId } = useDraftSession();
  useJournalDraftStorage(draftKey, !journalEditId, draft);
  const { title, content, domainId, projectId } = data;
  const setTitle = (title: string) => owner.change(draftKey, { title });
  const setContent = (content: string) => owner.change(draftKey, { content });
  const setDomainId = (domainId: string) => owner.change(draftKey, { domainId });
  const currentView = () => {
    const current = useBearing.getState();
    return current.view === "journal" && (current.journalEditId ? itemDraftKey(current.journalEditId) : current.journalDraftKey) === draftKey;
  };

  const handleGoalSave = useCallback(() => {
    const val = parseInt(goalInput, 10);
    if (val > 0) {
      setDailyGoal(val);
      localStorage.setItem(GOAL_STORAGE_KEY, String(val));
      notify.success(`Daily goal set to ${val} words`);
    }
    setShowGoalInput(false);
  }, [goalInput]);

  const stats = computeStats(content);
  const goalProgress = Math.min(100, Math.round((stats.words / dailyGoal) * 100));
  const goalReached = stats.words >= dailyGoal;

  async function save() {
    if (!title.trim()) {
      notify.error("Add a title first");
      return;
    }
    const ticket = owner.beginSave(draftKey, ["title", "content", "domainId", "projectId"]);
    if (!ticket) return;
    const snapshot = ticket.data;
    try {
      const payload = {
        title: snapshot.title.trim(), content: snapshot.content,
        domainId: snapshot.domainId || null, projectId: snapshot.projectId || null,
      };
      const saved = snapshot.id
        ? await update.mutateAsync({ id: snapshot.id, revision: snapshot.revision, ...payload })
        : await create.mutateAsync({ ...payload, type: "journal", status: "active", scheduledAt: new Date().toISOString() });
      const completed = owner.complete(ticket, saved);
      if (!completed) return;
      const selected = currentView();
      if (!snapshot.id) {
        clearJournalDraft(browserJournalStorage(), userId);
        if (selected && completed.dirtyFields.length) useBearing.setState({ journalEditId: saved.id });
        finishNewJournal(draftKey);
      }
      notify.success(snapshot.id ? "Entry saved" : "Journal entry created");
      if (selected && !completed.dirtyFields.length) setView("mind_soul");
    } catch (e: any) {
      owner.fail(ticket, e);
      reportWriteError(e, "Failed to save");
    }
  }

  async function handleDelete() {
    if (!journalEditId || !draft || draft.pending) return;
    try {
      await del.mutateAsync({ id: journalEditId, revision: draft.data.revision });
      notify.success("Journal entry archived");
      if (currentView()) setView("mind_soul");
    } catch (e: any) {
      reportWriteError(e, "Failed to archive");
    }
  }

  if (journalEditId && isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading journal entry">
        <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
          <div className="skeleton h-4 w-14 rounded" />
          <div className="flex items-center gap-2">
            <div className="skeleton hidden h-3 w-24 rounded sm:block" />
            <div className="skeleton h-8 w-8 rounded-md" />
            <div className="skeleton h-8 w-20 rounded-md" />
            <div className="skeleton h-8 w-20 rounded-md" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-5 py-2.5">
            <div className="skeleton h-3 w-40 rounded" />
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-6 w-6 rounded-md" />)}
            </div>
          </div>
          <div className="px-5 pt-5">
            <div className="skeleton h-8 w-2/3 rounded-lg" />
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="skeleton h-10 w-full rounded-lg" />
            <div className="skeleton h-72 w-full rounded-xl" />
          </div>
          <div className="border-t border-border/40 bg-muted/20 px-5 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="skeleton h-7 w-36 rounded-md" />
              <div className="skeleton h-3 w-40 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sticky top bar */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between border-b border-border/40 bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <button
          onClick={() => setView(journalEditId ? "mind_soul" : "mind_soul")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Icon name="ArrowLeft" className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            {stats.words} words · {stats.readTime} min
          </span>
          {/* Delete button with confirmation — only for existing entries */}
          {journalEditId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-expense hover:bg-expense/10 hover:text-expense">
                  <Icon name="Trash2" className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this journal entry?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark &ldquo;{title || "Untitled entry"}&rdquo; as archived.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-expense hover:bg-expense">
                    Archive
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((p) => !p)}
            className="gap-1.5"
          >
            <Icon name={showPreview ? "Pencil" : "Eye"} className="h-3.5 w-3.5" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!draft || !!draft.pending || create.isPending || update.isPending}
            className="gap-1.5 text-white"
            style={{ background: colorWithAlpha(ACCENT, 16), color: "var(--foreground)" }}
          >
            <Icon name="Save" className="h-3.5 w-3.5" />
            {data.id ? "Save" : "Publish"}
          </Button>
        </div>
      </div>

      <DraftNotice draft={draft} onDiscard={() => {
        owner.discard(draftKey);
        if (!journalEditId) clearJournalDraft(browserJournalStorage(), userId);
      }} />
      {/* Editor card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-2xl border bg-card shadow-sm"
        style={{ borderColor: colorWithAlpha(ACCENT, 19) }}
      >
        {/* Date + mood bar */}
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-5 py-2.5">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Icon name="Calendar" className="h-3 w-3" style={{ color: ACCENT }} />
            {fmtDate(new Date(), "EEEE, MMMM d · p")}
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[10px] text-muted-foreground">Mood:</span>
            {[
              { v: 1, e: "Frown", c: "var(--mood-1)" },
              { v: 2, e: "Meh", c: "var(--mood-2)" },
              { v: 3, e: "Smile", c: "var(--mood-3)" },
              { v: 4, e: "SmilePlus", c: "var(--mood-4)" },
              { v: 5, e: "Laugh", c: "var(--mood-5)" },
            ].map((m) => (
              <button
                key={m.v}
                onClick={() => setMood(m.v)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-sm transition-all",
                  mood === m.v ? "bg-type-journal/20 ring-1 ring-type-journal/40" : "hover:bg-muted",
                )}
              >
                <Icon name={m.e} className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div className="px-5 pt-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your entry a title…"
            className="w-full border-0 bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
            autoFocus={!journalEditId}
          />
        </div>

        {/* Content area — WYSIWYG rich text editor */}
        <div className="px-5 py-4">
          {showPreview ? (
            <div className="min-h-[400px]">
              {content ? (
                <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-3 prose-li:my-1 prose-headings:mb-2 prose-headings:mt-4 prose-blockquote:border-l-violet-400">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground/50">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <RichTextEditor
              key={draftKey}
              value={content}
              onChange={setContent}
              placeholder="Start writing… Express yourself freely. This is your space."
            />
          )}
        </div>

        {/* Live word count + writing goal bar */}
        <div className="border-t border-border/40 bg-muted/20 px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Domain</span>
              <Select value={domainId || "none"} onValueChange={(v) => setDomainId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {domains.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Live word count with goal progress */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {showGoalInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={goalInput}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleGoalSave()}
                      className="h-6 w-16 rounded border border-border bg-background px-2 text-[10px] outline-none"
                      min={1}
                      autoFocus
                    />
                    <span className="text-[10px] text-muted-foreground">words</span>
                    <button onClick={handleGoalSave} className="text-[10px] text-type-journal hover:underline">Set</button>
                    <button onClick={() => setShowGoalInput(false)} className="text-[10px] text-muted-foreground hover:underline">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowGoalInput(true)}
                    className="group flex items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    title="Click to change daily writing goal"
                  >
                    <Icon name="Target" className="h-3 w-3" />
                    <span>{dailyGoal} word goal</span>
                  </button>
                )}
              </div>

              {/* Goal progress bar */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className={cn("h-full rounded-full", goalReached ? "bg-success" : "bg-type-journal")}
                    initial={{ width: 0 }}
                    animate={{ width: `${goalProgress}%` }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  goalReached ? "text-success" : "text-muted-foreground",
                )}>
                  {stats.words}/{dailyGoal}
                </span>
                {goalReached && (
                  <Icon name="CheckCircle2" className="h-3 w-3 text-success" />
                )}
              </div>
            </div>
          </div>

          {/* Detailed stats row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Icon name="Type" className="h-2.5 w-2.5" />
              {stats.words} words
            </span>
            <span>·</span>
            <span>{stats.chars} chars</span>
            <span>·</span>
            <span>{stats.sentences} sentences</span>
            <span>·</span>
            <span>{stats.paragraphs} paragraphs</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <Icon name="Clock" className="h-2.5 w-2.5" />
              {stats.readTime} min read
            </span>
          </div>
        </div>
      </motion.div>

      {/* Tips */}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon name="Keyboard" className="h-3.5 w-3.5" />
        <span>
          The editor shows formatted text as you type — no raw markdown visible.
          Use the toolbar for bold, italic, headings, and lists. Type markdown shortcuts
          like <kbd className="rounded border border-border bg-muted px-1">#</kbd> for headings or
          <kbd className="ml-1 rounded border border-border bg-muted px-1">-</kbd> for lists.
        </span>
      </div>
    </div>
  );
}
