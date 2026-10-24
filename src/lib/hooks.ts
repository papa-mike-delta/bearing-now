"use client";

import { useBrowserWrites } from "@/hooks/use-browser-writes";
import { notify } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "./query-keys";
export { qk } from "./query-keys";

// Reads and non-Item mutations retain their existing transport. Item/Link
// mutations below use the shared outcome boundary instead.
async function jfetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    if (res.status === 409) {
      const message = "This item changed. Reload it before saving again.";
      notify.error(message);
      throw Object.assign(new Error(message), { status: 409 });
    }
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Items ──
export function useItems(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: qk.items(params),
    queryFn: () => jfetch<{ items: any[] }>(`/api/items${qs ? `?${qs}` : ""}`),
  });
}

export function useItem(id: string | null) {
  return useQuery({
    queryKey: qk.item(id!),
    queryFn: () => jfetch<any>(`/api/items/${id}`),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: (body: any) => writes.value({
    source: "user", operation: "item.create", url: "/api/items", method: "POST", body,
  }) });
}

export function useUpdateItem() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: ({ id, ...body }: { id: string; revision: number; [key: string]: unknown }) => writes.value({
    source: "user", operation: "item.update", url: `/api/items/${encodeURIComponent(id)}`, method: "PATCH", body, itemIds: [id],
  }) });
}

export function useDeleteItem() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: ({ id, revision }: { id: string; revision: number }) => writes.value({
    source: "user", operation: "item.archive", url: `/api/items/${encodeURIComponent(id)}`, method: "DELETE", body: { revision }, itemIds: [id],
  }) });
}

// ── Inbox ──
export function useInbox() {
  return useQuery({ queryKey: qk.inbox, queryFn: () => jfetch<{ items: any[] }>("/api/inbox") });
}

export function useQuickCapture() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: (body: any) => writes.value({
    source: "user", operation: "item.create", url: "/api/inbox", method: "POST", body,
  }) });
}

// ── Projects ──
export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: () => jfetch<{ projects: any[] }>("/api/projects") });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: qk.project(id!),
    queryFn: () => jfetch<any>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => jfetch<any>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      jfetch<any>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.projects });
      qc.invalidateQueries({ queryKey: qk.project(vars.id) });
      // These reads embed project labels/colors. Refresh after an explicit override changes.
      for (const key of ["items", "item", "inbox", "calendar", "graph", "insights", "search", "onThisDay", "project"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jfetch<any>(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects }),
  });
}

// ── Calendar ──
export function useCalendar(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({ queryKey: qk.calendar(params), queryFn: () => jfetch<any>(`/api/calendar?${qs}`) });
}

// ── Reviews ──
export function useReviews(type?: string) {
  const qs = type ? `?type=${type}` : "";
  return useQuery({ queryKey: qk.reviews(type), queryFn: () => jfetch<{ reviews: any[] }>(`/api/reviews${qs}`) });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => jfetch<any>("/api/reviews", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

export function useUpdateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: any) =>
      jfetch<any>(`/api/reviews/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => jfetch<any>(`/api/reviews/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
}

// ── Stats ──
export function useStats() {
  return useQuery({ queryKey: qk.stats, queryFn: () => jfetch<any>("/api/stats") });
}

// ── Tags ──
export function useTags() {
  return useQuery({ queryKey: qk.tags, queryFn: () => jfetch<{ tags: any[] }>("/api/tags") });
}

// ── Domains ──
export function useDomains() {
  return useQuery({ queryKey: qk.domains, queryFn: () => jfetch<{ domains: any[] }>("/api/domains") });
}

// ── Insights ──
export function useInsights() {
  return useQuery({ queryKey: qk.insights, queryFn: () => jfetch<any>("/api/insights") });
}

// ── Graph ──
export function useGraph(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({ queryKey: qk.graph(params), queryFn: () => jfetch<any>(`/api/graph?${qs}`) });
}

// ── Export ──
export function downloadCSV(type: "finance" | "reviews" | "items") {
  const a = document.createElement("a");
  a.href = `/api/export?type=${type}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── On this day ──
export function useOnThisDay() {
  return useQuery({ queryKey: qk.onThisDay, queryFn: () => jfetch<any>("/api/on-this-day") });
}

// ── Scheduler ──
export function useRunScheduler() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: () => writes.value({
    source: "user", operation: "scheduler.run", url: "/api/scheduler", method: "POST",
  }) });
}

// ── Search ──
export function useSearch(q: string) {
  return useQuery({
    queryKey: qk.search(q),
    queryFn: () => jfetch<any>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length > 0,
  });
}

// ── Habit logs ──
export function useToggleHabit() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: ({ id, date, value }: { id: string; date?: string; value?: number }) => writes.value({
    source: "user", operation: "habit.toggle", url: `/api/items/${encodeURIComponent(id)}/habit-logs`,
    method: "POST", body: { date, value }, itemIds: [id],
  }) });
}

// ── Links ──
export function useCreateLink() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: ({ fromId, ...body }: { fromId: string; toId: string; revision: number; type?: string; note?: string }) => writes.value({
    source: "user", operation: "link.create", url: `/api/items/${encodeURIComponent(fromId)}/links`,
    method: "POST", body, itemIds: [fromId, body.toId],
  }) });
}

export function useDeleteLink() {
  const writes = useBrowserWrites();
  return useMutation({ retry: false, mutationFn: ({ fromId, toId, type, revision }: { fromId: string; toId: string; type?: string; revision: number }) => writes.value({
    source: "user", operation: "link.delete", url: `/api/items/${encodeURIComponent(fromId)}/links?${new URLSearchParams({ toId, type: type || "related_to", revision: String(revision) })}`,
    method: "DELETE", itemIds: [fromId, toId],
  }) });
}
