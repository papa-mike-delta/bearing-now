"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useItemDraft } from "../item-draft-session";
import { Button } from "@/components/ui/button";
import { outbox } from "@/lib/v1/outbox";
import { captureInput } from "@/lib/v1/workflow-contracts";
import { instantFromInput, localDateTime } from "@/lib/v1/workflow-dates";
import { useWorkspace, fieldClass } from "./context";
const RichTextEditor = dynamic(
  () => import("../rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false, loading: () => <p>Loading writing tools…</p> },
);
const captureSeed = {
  type: "capture",
  title: "",
  content: "",
  status: "todo",
  metadata: {},
  occurredInput: "",
};
export function CaptureComposer({
  inline,
  open,
  onOpenChange,
  date,
  sync,
}: {
  inline: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  date: string;
  sync(): Promise<void>;
}) {
  const { userId, timezone } = useWorkspace();
  const { owner, data } = useItemDraft("capture:journal", captureSeed);
  const text = data.content,
    occurred = data.occurredInput;
  const setText = (content: string) =>
    owner.change("capture:journal", { content });
  const setOccurred = (occurredInput: string) =>
    owner.change("capture:journal", { occurredInput });
  const [rich, setRich] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const defaultTime = `${date}T${localDateTime(new Date(), timezone).slice(11)}`;
  async function capture() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const value = captureInput.parse({
        clientId: crypto.randomUUID(),
        text,
        capturedAt: new Date().toISOString(),
        occurredAt: instantFromInput(occurred || defaultTime, timezone),
        timezone,
      });
      await outbox.enqueue(userId, value);
      const current = owner.get("capture:journal")?.data;
      if (current?.content === text && current.occurredInput === occurred)
        owner.discard("capture:journal");
      setSaved(true);
      await sync();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your text has not been saved. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void capture();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          void capture();
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="capture-text" className="text-sm font-semibold">
          Capture
        </label>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={rich}
          onClick={() => setRich(!rich)}
        >
          {rich ? "Plain text" : "Long-form writing"}
        </Button>
      </div>
      {rich ? (
        <RichTextEditor
          value={text}
          onChange={setText}
          placeholder="Write about your day…"
        />
      ) : (
        <textarea
          id="capture-text"
          className={`${fieldClass} min-h-28`}
          rows={inline ? 4 : 7}
          maxLength={200000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="A thought, a Task, a line about your day…"
          autoFocus={!inline}
        />
      )}
      <p className="text-xs text-muted-foreground">
        /task Title · /mood 4 energy 3 · /place Name · no classification
        required
      </p>
      <label className="block text-xs font-medium">
        Occurred at · {timezone}
        <input
          aria-label="Occurred at"
          type="datetime-local"
          required
          className={`${fieldClass} mt-1`}
          value={occurred || defaultTime}
          onChange={(e) => setOccurred(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Saved on this device. The sync status shows when it is saved to your
          account.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Ctrl/⌘ + Enter to capture
        </span>
        <Button disabled={busy || !text.trim()} type="submit">
          {busy ? "Saving…" : "Capture moment"}
        </Button>
      </div>
    </form>
  );
  if (inline)
    return (
      <section
        aria-label="Write a Journal moment"
        className="rounded-2xl border border-border bg-card p-4"
      >
        {content}
      </section>
    );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Quick Capture</DialogTitle>
          <DialogDescription>
            Your original words stay in the Journal. Organize them when you’re
            ready.
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
