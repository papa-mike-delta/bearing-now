"use client";
import { useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { themeOverrideKey } from "@/components/theme-override";
import { Button } from "@/components/ui/button";
import { useWorkspace, fieldClass } from "./context";
/** Same theme parser, persistence and override layer as the existing Settings page. */
export function Appearance() {
  const { userId } = useWorkspace(),
    { theme, setTheme } = useTheme(),
    client = useQueryClient();
  const [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(reset = false) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/preferences/theme", {
        method: reset ? "DELETE" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bearing-Account": userId,
        },
        ...(reset ? {} : { body: JSON.stringify({ input }) }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      await client.cancelQueries({ queryKey: themeOverrideKey });
      client.setQueryData(themeOverrideKey, value);
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label className="block text-sm text-muted-foreground">
        Theme
        <select
          aria-label="Theme"
          className={`${fieldClass} mt-1 max-w-xs`}
          value={theme || "system"}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <label className="block text-sm text-muted-foreground">
        Import theme
        <textarea
          className={`${fieldClass} mt-1`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          maxLength={100000}
          placeholder="CSS, JSON, or a ui.shadcn.com/create URL"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !input.trim()} onClick={() => void save()}>
          Import theme
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void save(true)}
        >
          Reset imported theme
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
