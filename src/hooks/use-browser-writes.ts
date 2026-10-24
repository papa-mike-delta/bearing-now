"use client";

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BrowserWriteError, createBrowserWrites, fetchWriteTransport, type WriteRequest } from "@/lib/browser-writes";
import { notify } from "@/lib/toast";

/** Catch handlers retain their state; already-reported boundary errors stay quiet. */
export function reportWriteError(error: unknown, fallback = "Failed to save") {
  if (!(error instanceof BrowserWriteError)) notify.error(error instanceof Error ? error.message : fallback);
}

export function useBrowserWrites() {
  const client = useQueryClient();
  return useMemo(() => {
    const writes = createBrowserWrites({
      transport: fetchWriteTransport,
      invalidate: (key) => client.invalidateQueries({ queryKey: key }),
      notifyFailure: (outcome) => {
        if (outcome.receiptId) notify.receipt(outcome.message, outcome.receiptId, false, outcome.source);
        else notify.error(outcome.message);
      },
    });
    return {
      ...writes,
      async value<T = any>(request: WriteRequest): Promise<T> {
        const outcome = await writes.execute<T>(request);
        if (outcome.kind !== "success") throw new BrowserWriteError(outcome);
        return outcome.value;
      },
    };
  }, [client]);
}
