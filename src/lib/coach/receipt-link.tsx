import { cn } from "@/lib/utils";
import { operationReceiptHref, type WriteSource } from "@/lib/browser-writes";

export function coachReceiptHref(receiptId: string) {
  return operationReceiptHref(receiptId, "coach");
}

export function CoachReceiptLink({
  receiptId,
  children,
  className,
  source = "coach",
}: {
  receiptId: string;
  children?: string;
  className?: string;
  source?: WriteSource;
}) {
  return (
    <a className={cn("block truncate underline", className)} href={operationReceiptHref(receiptId, source)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
