"use client";

import { useItems } from "@/lib/hooks";
import { useBearing } from "@/store/bearing";
import { Icon } from "./icon";
import { motion } from "framer-motion";
import { fmtDate, smartDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function HealthOverview() {
  const { data } = useItems({ type: "symptom,medication,habit,event", status: "active,done" });
  const { openItemDetail, openItemEditor } = useBearing();

  const items = data?.items || [];
  const symptoms = items.filter((i: any) => i.type === "symptom")
    .sort((a: any, b: any) => new Date(b.scheduledAt || b.createdAt).getTime() - new Date(a.scheduledAt || a.createdAt).getTime());
  const medications = items.filter((i: any) => i.type === "medication");
  const healthHabits = items.filter((i: any) => i.type === "habit");
  const appointments = items.filter((i: any) => i.type === "event")
    .filter((e: any) => e.scheduledAt && new Date(e.scheduledAt) >= new Date())
    .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-4"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-expense/15 text-expense">
            <Icon name="HeartPulse" className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Health snapshot</h3>
        </div>
        <p className="text-xs text-muted-foreground">Track symptoms, medications, and upcoming appointments in one place.</p>
        <button
          onClick={() => openItemEditor({ type: "symptom" })}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-expense hover:underline"
        >
          <Icon name="Plus" className="h-3 w-3" /> Log a symptom
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-expense/20 bg-gradient-to-br from-expense/5 to-transparent p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-expense/15 text-expense">
          <Icon name="HeartPulse" className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Health snapshot</h3>
          <p className="text-xs text-muted-foreground">
            {medications.length} med{medications.length !== 1 ? "s" : ""} · {symptoms.length} symptom{symptoms.length !== 1 ? "s" : ""} · {appointments.length} upcoming
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Upcoming appointments */}
        {appointments.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</p>
            <div className="space-y-1">
              {appointments.slice(0, 2).map((a: any, i: number) => (
                <motion.button
                  key={a.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => openItemDetail(a.id)}
                  className="group flex w-full items-center gap-2 rounded-lg border border-info/20 bg-info/5 p-2 text-left transition-all hover:bg-info/10"
                >
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-info/15 text-info">
                    <Icon name="Stethoscope" className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{smartDate(a.scheduledAt)}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* Active medications */}
        {medications.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Medications</p>
            <div className="flex flex-wrap gap-1.5">
              {medications.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => openItemDetail(m.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-background/60 px-2 py-1 text-xs transition-all hover:border-expense/30 hover:bg-background"
                >
                  <Icon name="Pill" className="h-3 w-3 text-expense" />
                  <span className="font-medium">{m.title}</span>
                  {m.metadata?.dose && <span className="text-xs text-muted-foreground">{m.metadata.dose}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Health habits */}
        {healthHabits.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Health habits</p>
            <div className="space-y-1">
              {healthHabits.slice(0, 3).map((h: any, i: number) => {
                const streak = h.metadata?.streak || 0;
                const logs = (h.habitLogs || []).length;
                return (
                  <motion.button
                    key={h.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => openItemDetail(h.id)}
                    className="group flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-all hover:bg-muted/40"
                  >
                    <Icon name="Repeat" className="h-3 w-3 text-success" />
                    <span className="flex-1 truncate text-xs font-medium">{h.title}</span>
                    {streak > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-xs font-bold text-success">
                        <Icon name="Flame" className="h-2.5 w-2.5" />
                        {streak}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent symptoms */}
        {symptoms.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent symptoms</p>
            <div className="space-y-1">
              {symptoms.slice(0, 3).map((s: any, i: number) => {
                const sev = s.metadata?.severity || 1;
                const sevColor = sev >= 4 ? "var(--expense)" : sev >= 3 ? "var(--priority-high)" : "var(--priority-medium)";
                return (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => openItemDetail(s.id)}
                    className="group flex w-full items-center gap-2 rounded-lg border border-border/40 bg-background/40 p-2 text-left transition-all hover:bg-background"
                  >
                    <div className="flex gap-0.5" title={`Severity ${sev}/5`}>
                      {Array.from({ length: 5 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="h-3 w-1 rounded-full"
                          style={{ background: idx < sev ? sevColor : "var(--muted)" }}
                        />
                      ))}
                    </div>
                    <span className="flex-1 truncate text-xs font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{smartDate(s.scheduledAt || s.createdAt)}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
