export const qk = {
  items: (params?: Record<string, string>) => ["items", params] as const,
  item: (id: string) => ["item", id] as const,
  inbox: ["inbox"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["project", id] as const,
  calendar: (params?: Record<string, string>) => ["calendar", params] as const,
  reviews: (type?: string) => ["reviews", type] as const,
  stats: ["stats"] as const,
  tags: ["tags"] as const,
  domains: ["domains"] as const,
  search: (q: string) => ["search", q] as const,
  habitLogs: (id: string) => ["habitLogs", id] as const,
  insights: ["insights"] as const,
  graph: (params?: Record<string, string>) => ["graph", params] as const,
  coachActivity: ["coachActivity"] as const,
  onThisDay: ["onThisDay"] as const,
};

