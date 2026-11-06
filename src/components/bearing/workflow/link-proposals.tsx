"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { itemDto, itemSeed } from "@/lib/v1/client-model";
import { LinkProposals, type LinkProposal } from "@/lib/v1/link-proposals";
import { useWorkspace } from "./context";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Could not save";

export function LinkProposalCards({
  momentId,
  itemId,
}: {
  momentId?: string;
  itemId?: string;
}) {
  const { data, mutate } = useWorkspace();
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const cards = LinkProposals.forContext(data, { momentId, itemId }).filter(
    (card) => !hidden.includes(card.id),
  );
  const limits = momentId
    ? LinkProposals.unsupportedMentions(data).filter(
        (entry) => entry.momentId === momentId,
      )
    : [];
  async function accept(card: LinkProposal) {
    setBusy(card.id);
    setError("");
    setNotice("");
    try {
      const saved =
        card.accept.kind === "link"
          ? await mutate<{ receiptId: string }>("links", {
              fromId: card.accept.fromId,
              toId: card.accept.toId,
              type: card.accept.type,
              fromRevision: card.accept.fromRevision,
              toRevision: card.accept.toRevision,
            })
          : await assignArea(card);
      setReceiptId(saved.receiptId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy("");
    }
  }
  async function assignArea(card: LinkProposal) {
    if (card.accept.kind !== "area")
      throw new Error("This suggestion is not an Area assignment");
    const item = data.items.find((entry) => entry.id === card.accept.itemId);
    if (!item) throw new Error("This Item is no longer in the workspace");
    return mutate<{ receiptId: string }>(
      `items/${item.id}`,
      {
        revision: card.accept.revision,
        data: {
          ...itemDto(itemSeed(item)),
          tagIds: [
            ...new Set([
              ...item.tags.map((entry) => entry.tagId),
              card.accept.tagId,
            ]),
          ],
        },
      },
      "PUT",
    );
  }
  function reject(card: LinkProposal) {
    const decision = LinkProposals.reject();
    if (decision.writes) return;
    setHidden((ids) => [...ids, card.id]);
    setError("");
    setReceiptId("");
    setNotice("Rejected. Nothing was written.");
  }
  if (!cards.length && !limits.length && !receiptId && !error && !notice)
    return null;
  return (
    <div className="space-y-3">
      {limits.map((entry) => (
        <p key={entry.momentId} className="text-sm text-muted-foreground">
          {entry.summary}
        </p>
      ))}
      {cards.length || receiptId || error || notice ? (
        <SectionCard title="Review connections">
          <div className="space-y-3">
            {cards.map((card) => (
              <article key={card.id} className="space-y-2 text-sm">
                <p className="font-medium">
                  {card.confidence === "proposal" ? "Proposal" : "Suggestion"}
                  {" · "}
                  {card.title}
                </p>
                <p className="text-muted-foreground">{card.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!!busy}
                    onClick={() => void accept(card)}
                  >
                    {card.acceptLabel}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => reject(card)}
                  >
                    {card.rejectLabel}
                  </Button>
                </div>
              </article>
            ))}
            {notice ? (
              <p role="status" className="text-sm">
                {notice}
              </p>
            ) : null}
            {receiptId ? (
              <p role="status" className="text-sm">
                Saved. Receipt {receiptId}.{" "}
                <a className="underline" href={`/api/receipts/${receiptId}`}>
                  Open audit receipt
                </a>
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
