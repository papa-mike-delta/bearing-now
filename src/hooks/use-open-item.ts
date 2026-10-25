"use client";

import { useEffect } from "react";

export function useOpenItem(id: string | null | undefined, account?: string) {
  useEffect(() => {
    if (!id) return;
    const url = account ? `/api/v1/items/${encodeURIComponent(id)}/lease` : `/api/items/${encodeURIComponent(id)}/open`;
    const token = crypto.randomUUID();
    const body = JSON.stringify({ lease: token });
    const send = (method: string) => fetch(url, {
      method: account ? "POST" : method, body: account ? JSON.stringify({ token, open: method !== "DELETE" }) : body, headers: { "Content-Type": "application/json", ...(account ? { "X-Bearing-Account": account } : {}) }, keepalive: true,
    }).then(() => {}, () => {});
    // Keep close after any pending refresh, so a slow request cannot reopen a
    // closed lease. A new mount uses a separate lease (including React replay).
    let pending = send("PUT");
    const timer = setInterval(() => { pending = pending.then(() => send("PUT")); }, 30_000);
    return () => {
      clearInterval(timer);
      void pending.then(() => send("DELETE"));
    };
  }, [id, account]);
}
