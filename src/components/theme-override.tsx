"use client";

import { useQuery } from "@tanstack/react-query";

export const themeOverrideKey = ["theme-override"] as const;

export function StoredThemeOverride() {
  const { data } = useQuery({
    queryKey: themeOverrideKey,
    queryFn: async () => {
      const response = await fetch("/api/preferences/theme", { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load imported theme.");
      return response.json() as Promise<{ css: string }>;
    },
  });

  return data?.css ? <style data-theme-override>{data.css}</style> : null;
}
