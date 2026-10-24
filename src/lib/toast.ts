/**
 * Centralized toast notification utility for bearing.now.
 *
 * Wraps `sonner` with semantic helpers so every user action
 * gets consistent, accessible feedback.
 *
 * Usage:
 *   import { notify } from "@/lib/toast";
 *   notify.success("Entry saved");
 *   notify.error("Failed to save");
 *   notify.warning("Draft not saved");
 *   notify.info("Auto-save in 5 s");
 */

import { createElement } from "react";
import { toast } from "sonner";
import { CoachReceiptLink } from "@/lib/coach/receipt-link";
import type { WriteSource } from "@/lib/browser-writes";

const DEFAULT_DURATION = 4000;
const COACH_RECEIPT_MS = 3000;

export const notify = {
  /** Green success toast */
  success: (message: string, description?: string) =>
    toast.success(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  /** Red error toast */
  error: (message: string, description?: string) =>
    toast.error(message, {
      description,
      duration: DEFAULT_DURATION + 2000, // errors stay longer
    }),

  /** Amber warning toast */
  warning: (message: string, description?: string) =>
    toast.warning(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  /** Blue info toast */
  info: (message: string, description?: string) =>
    toast.info(message, {
      description,
      duration: DEFAULT_DURATION,
    }),

  /** Promise-based toast that shows loading -> success/error */
  promise: <T>(
    promise: Promise<T>,
    opts: { loading: string; success: string; error: string },
  ) =>
    toast.promise(promise, {
      loading: opts.loading,
      success: opts.success,
      error: opts.error,
    }),

  /** Dismiss a specific or all toasts */
  dismiss: (id?: string | number) => toast.dismiss(id),

  /** One-line Coach receipt toast: "<action> <Item title>" linking to the receipt. */
  receipt: (message: string, receiptId: string, ok: boolean, source: WriteSource = "coach") => {
    const content = createElement(CoachReceiptLink, { receiptId, source, className: "max-w-72" }, message);
    const options = { duration: source === "coach" ? COACH_RECEIPT_MS : DEFAULT_DURATION + 2000 };
    return ok ? toast.success(content, options) : toast.error(content, options);
  },
};

export { toast };
