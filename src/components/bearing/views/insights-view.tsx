"use client";

import { colorWithAlpha, projectColor } from "@/lib/product-colors";

import { useInsights, downloadCSV, useRunScheduler } from "@/lib/hooks";
import { notify } from "@/lib/toast";
import { useBearing } from "@/store/bearing";
import { Icon } from "../icon";
import { PageHeader, SectionCard, EmptyState } from "../layout";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { fmtDate, smartDate } from "@/lib/dates";
import { motion } from "framer-motion";

export function InsightsView() {
  const { openProject } = useBearing();
  const { data, isLoading } = useInsights();
  const runScheduler = useRunScheduler();

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading insights">
        <PageHeader title="Insights" subtitle="Patterns and trends across your life — mood, habits, activity, and finances." icon="TrendingUp" color="var(--success)" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5">
              <div className="skeleton h-8 w-8 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-5 w-12 rounded" />
                <div className="skeleton h-2.5 w-20 max-w-full rounded" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 bg-card/50 p-4">
              <div className="mb-4 flex items-center gap-2">
                <div className="skeleton h-4 w-4 rounded" />
                <div className="skeleton h-4 w-32 rounded" />
              </div>
              <div className="skeleton h-52 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const moodData = data.moodTrend.map((m: any) => ({
    date: fmtDate(m.date, "MMM d"),
    mood: m.mood,
    energy: m.energy,
  }));

  const activityData = data.dailyActivity.map((d: any) => ({
    date: fmtDate(d.date, "M/d"),
    created: d.created,
    completed: d.completed,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        subtitle="Patterns and trends across your life — mood, habits, activity, and finances."
        icon="TrendingUp"
        color="var(--success)"
        actions={
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { runScheduler.mutate(); notify.info("Running scheduler…"); }}
              disabled={runScheduler.isPending}
              className="gap-1.5"
              title="Advance recurring items and reset stale habit streaks"
            >
              <Icon name={runScheduler.isPending ? "Loader2" : "RefreshCw"} className={`h-3.5 w-3.5 ${runScheduler.isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{runScheduler.isPending ? "Running…" : "Sync"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV("finance")} className="gap-1.5">
              <Icon name="Download" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Finances</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV("reviews")} className="gap-1.5">
              <Icon name="Download" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Reviews</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV("items")} className="gap-1.5">
              <Icon name="Download" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">All items</span>
            </Button>
          </div>
        }
      />

      {/* Top stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Reviews (30d)" value={data.reviewCount} icon="NotebookPen" color="var(--type-journal)" />
        <StatTile label="Avg consistency" value={`${Math.round(data.habitMatrix.reduce((s: number, h: any) => s + h.consistency, 0) / (data.habitMatrix.length || 1))}%`} icon="Repeat" color="var(--success)" />
        <StatTile label="Monthly net" value={`$${data.finance.net.toLocaleString()}`} icon="Wallet" color={data.finance.net >= 0 ? "var(--income)" : "var(--expense)"} />
        <StatTile label="Active projects" value={data.projectHealth.length} icon="FolderKanban" color="var(--info)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mood & Energy trend */}
        <SectionCard title="Mood & Energy trend" icon="Heart">
          {moodData.length === 0 ? (
            <EmptyChart message="Log a daily reflection to see your mood trend." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={moodData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)" }}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                />
                <Line type="monotone" dataKey="mood" stroke="var(--mood-series)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--mood-series)" }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="energy" stroke="var(--energy-series)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--energy-series)" }} activeDot={{ r: 5 }} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-type-idea" /> Mood</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-priority-high" /> Energy</span>
          </div>
        </SectionCard>

        {/* Activity (created vs completed) */}
        <SectionCard title="Activity (30 days)" icon="Activity">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activityData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--info)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--info)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={4} />
              <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--foreground)" }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                itemStyle={{ color: "var(--foreground)" }}
              />
              <Area type="monotone" dataKey="created" stroke="var(--info)" strokeWidth={2} fill="url(#gCreated)" />
              <Area type="monotone" dataKey="completed" stroke="var(--success)" strokeWidth={2} fill="url(#gCompleted)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-info" /> Created</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-full bg-success" /> Completed</span>
          </div>
        </SectionCard>

        {/* Habit consistency heatmap */}
        <SectionCard title="Habit consistency (14 days)" icon="Repeat">
          {data.habitMatrix.length === 0 ? (
            <EmptyChart message="No active habits yet. Create one in Time & Action." />
          ) : (
            <div className="space-y-3">
              {data.habitMatrix.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3">
                  <div className="w-32 flex-shrink-0 truncate text-xs font-medium">{h.title}</div>
                  <div className="flex flex-1 gap-1">
                    {h.days.map((d: any, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="h-6 flex-1 rounded-sm"
                        title={`${fmtDate(d.date, "MMM d")}: ${d.done ? "done" : "—"}`}
                        style={{
                          background: d.done ? "var(--success)" : "var(--muted)",
                          opacity: d.done ? 1 : 0.4,
                        }}
                      />
                    ))}
                  </div>
                  <div className="w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">{h.consistency}%</div>
                </div>
              ))}
              <div className="flex justify-end gap-1 pt-1 text-xs text-muted-foreground">
                <span>14 days ago</span><span>→</span><span>today</span>
              </div>
            </div>
          )}
        </SectionCard>

        {/* Finance breakdown */}
        <SectionCard title="Monthly finances" icon="Wallet">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-income/10 p-3">
              <div className="text-xs uppercase tracking-wide text-income">Income</div>
              <div className="mt-1 text-xl font-bold text-income">${data.finance.income.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-expense/10 p-3">
              <div className="text-xs uppercase tracking-wide text-expense">Expenses</div>
              <div className="mt-1 text-xl font-bold text-expense">${data.finance.expenses.toLocaleString()}</div>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Net</div>
              <div className={`mt-1 text-xl font-bold ${data.finance.net >= 0 ? "text-income" : "text-expense"}`}>
                {data.finance.net >= 0 ? "+" : "−"}${Math.abs(data.finance.net).toLocaleString()}
              </div>
            </div>
          </div>
          {data.finance.subscriptions > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-priority-high/10 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-priority-high">
                <Icon name="Repeat" className="h-3.5 w-3.5" /> Monthly subscriptions
              </span>
              <span className="font-semibold">${data.finance.subscriptions.toLocaleString()}/mo</span>
            </div>
          )}
          {data.finance.savingsGoals.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Savings goals</div>
              {data.finance.savingsGoals.map((g: any, i: number) => (
                <div key={i}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{g.title}</span>
                    <span className="text-muted-foreground">${g.current.toLocaleString()} / ${g.target.toLocaleString()}</span>
                  </div>
                  <Progress value={(g.current / g.target) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Project health */}
      {data.projectHealth.length > 0 && (
        <SectionCard title="Project health" icon="FolderKanban">
          <div className="grid gap-3 sm:grid-cols-2">
            {data.projectHealth.map((p: any) => (
              <motion.button
                key={p.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => openProject(p.id)}
                className="rounded-xl border border-border/60 p-4 text-left transition-all hover:border-border hover:shadow-sm"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: projectColor(p) }} />
                  <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
                  {p.overdue > 0 && (
                    <span className="rounded-full bg-expense/15 px-1.5 py-0.5 text-xs font-bold text-expense">{p.overdue} overdue</span>
                  )}
                </div>
                <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{p.done}/{p.total} tasks</span>
                  <span className="font-semibold" style={{ color: projectColor(p) }}>{p.progress}%</span>
                </div>
                <Progress value={p.progress} className="h-1.5" />
                {p.targetDate && (
                  <p className="mt-2 text-xs text-muted-foreground">Target: {smartDate(p.targetDate)}</p>
                )}
              </motion.button>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function StatTile({ label, value, icon, color }: { label: string; value: string | number; icon: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3 py-2.5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colorWithAlpha(color, 10), color }}>
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div>
        <div className="text-lg font-semibold leading-none">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
    </motion.div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <Icon name="BarChart3" className="mb-2 h-8 w-8 opacity-30" />
      {message}
    </div>
  );
}
