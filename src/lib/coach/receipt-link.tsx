import { cn } from "@/lib/utils";

export function coachReceiptHref(receiptId: string) {
  return `/api/coach?receipt=${encodeURIComponent(receiptId)}`;
}

export function CoachReceiptLink({
  receiptId,
  children,
  className,
}: {
  receiptId: string;
  children: string;
  className?: string;
}) {
  return (
    <a className={cn("block truncate underline", className)} href={coachReceiptHref(receiptId)} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
