"use client";

import { useEffect } from "react";

export function useOpenItem(id: string | null | undefined) {
  useEffect(() => {
    if (!id) return;
    const url = `/api/items/${encodeURIComponent(id)}/open`;
    const body = JSON.stringify({ lease: crypto.randomUUID() });
    const send = (method: string) => fetch(url, {
      method, body, headers: { "Content-Type": "application/json" }, keepalive: true,
    }).then(() => {}, () => {});
    // Keep close after any pending refresh, so a slow request cannot reopen a
    // closed lease. A new mount uses a separate lease (including React replay).
    let pending = send("PUT");
    const timer = setInterval(() => { pending = pending.then(() => send("PUT")); }, 30_000);
    return () => {
      clearInterval(timer);
      void pending.then(() => send("DELETE"));
    };
  }, [id]);
}
