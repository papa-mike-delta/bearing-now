"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SectionCard } from "./layout";
import { CoachReceiptLink } from "@/lib/coach/receipt-link";
import { notify } from "@/lib/toast";
import { useBrowserWrites } from "@/hooks/use-browser-writes";
import { coachWriteRequest } from "@/lib/browser-writes";
import { qk } from "@/lib/query-keys";

type CoachActivityRow = { id: string; line: string };

export function CoachActivityList({ activity }: { activity: CoachActivityRow[] }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Activity</h3>
      {activity.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No Coach activity yet</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {activity.map((entry) => (
            <li key={entry.id}>
              <CoachReceiptLink receiptId={entry.id} className="max-w-full">{entry.line}</CoachReceiptLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const examples = {
  searchItems: { q: "" },
  getItem: { id: "" },
  getLinks: { id: "" },
  createItem: { data: { title: "", type: "note" } },
  updateItem: { id: "", revision: 0, data: { title: "" } },
  archiveItem: { id: "", revision: 0 },
  createLink: { fromId: "", toId: "", type: "related_to", revision: 0 },
  deleteLink: { fromId: "", toId: "", type: "related_to", revision: 0 },
  listOpenItems: {},
};
type Tool = keyof typeof examples;

export function CoachPanel() {
  const [tool, setTool] = useState<Tool>("searchItems");
  const [args, setArgs] = useState(JSON.stringify(examples.searchItems, null, 2));
  const [output, setOutput] = useState("");
  const [pending, setPending] = useState(false);
  const writes = useBrowserWrites();
  const { data: activity = [] } = useQuery({
    queryKey: qk.coachActivity,
    queryFn: async (): Promise<CoachActivityRow[]> => {
      const response = await fetch("/api/coach", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Coach activity unavailable");
      const body = await response.json();
      return Array.isArray(body.activity) ? body.activity.filter((row: CoachActivityRow) => row && typeof row.id === "string" && typeof row.line === "string") : [];
    },
  });

  async function invoke(event: React.FormEvent) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(args);
    } catch {
      notify.error("Enter valid JSON arguments");
      return;
    }
    setPending(true);
    try {
      const outcome = await writes.execute(coachWriteRequest(tool, parsed));
      setOutput(JSON.stringify(outcome, null, 2));
      if (outcome.kind === "success") {
        if (outcome.receiptId) notify.receipt(outcome.message ?? "Tool completed", outcome.receiptId, true);
        else notify.success("Tool completed");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard className="mt-6">
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Coach</summary>
        <CoachActivityList activity={activity} />
        <form onSubmit={invoke} className="mt-4 space-y-3">
          <Label htmlFor="coach-tool">Tool</Label>
          <select id="coach-tool" value={tool} disabled={pending} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" onChange={(event) => {
            const next = event.target.value as Tool;
            setTool(next);
            setArgs(JSON.stringify(examples[next], null, 2));
            setOutput("");
          }}>
            {Object.keys(examples).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <Label htmlFor="coach-args">Arguments (JSON)</Label>
          <Textarea id="coach-args" value={args} onChange={(event) => setArgs(event.target.value)} rows={6} disabled={pending} className="font-mono text-xs" />
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Running…" : "Run tool"}</Button>
          {output && <pre aria-live="polite" className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">{output}</pre>}
        </form>
      </details>
    </SectionCard>
  );
}
