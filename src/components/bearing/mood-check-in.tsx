"use client";

import { colorWithAlpha } from "@/lib/product-colors";

import { MOOD_OPTIONS as MOODS, CHECK_IN_ENERGY_OPTIONS as ENERGY } from "@/lib/semantic-state";
import { ScaleChoices } from "./semantic-state";
import { useState } from "react";
import { useCreateReview, useReviews } from "@/lib/hooks";
import { Icon } from "./icon";
import { motion } from "framer-motion";
import { notify } from "@/lib/toast";

export function MoodCheckIn() {
  const create = useCreateReview();
  const { data: reviewData } = useReviews("daily");
  const [mood, setMood] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  // Check if already logged today
  const today = new Date().toISOString().slice(0, 10);
  const todayReview = (reviewData?.reviews || []).find(
    (r: any) => new Date(r.date).toISOString().slice(0, 10) === today,
  );

  if (todayReview && !saved) {
    return (
      <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-type-journal/10 to-type-idea/5 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: colorWithAlpha(MOODS.find((m) => m.value === todayReview.mood)?.color, 10), color: MOODS.find((m) => m.value === todayReview.mood)?.color }}>
            <Icon name={MOODS.find((m) => m.value === todayReview.mood)?.icon || "Smile"} className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Checked in today</p>
            <p className="text-xs text-muted-foreground">
              Mood {MOODS.find((m) => m.value === todayReview.mood)?.label} · Energy {ENERGY.find((e) => e.value === todayReview.energy)?.label}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-success/30 bg-gradient-to-br from-success/10 to-transparent p-4 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring" }}
          className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"
        >
          <Icon name="Check" className="h-5 w-5" strokeWidth={3} />
        </motion.div>
        <p className="text-sm font-semibold">Thanks for checking in</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Your reflection is saved.</p>
      </motion.div>
    );
  }

  async function save() {
    if (mood == null && energy == null) {
      notify.error("Pick a mood or energy level first");
      return;
    }
    await create.mutateAsync({
      type: "daily",
      date: new Date().toISOString(),
      status: "completed",
      mood: mood || 3,
      energy: energy || 3,
      wins: "",
      notes: "Quick check-in from dashboard",
    });
    setSaved(true);
    notify.success("Check-in saved");
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-type-journal/5 to-transparent p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="Smile" className="h-4 w-4 text-type-journal" />
        <h3 className="text-sm font-semibold">How are you feeling?</h3>
      </div>

      <div className="mb-3"><p className="mb-1.5 text-xs font-medium">Mood</p><ScaleChoices scale="Mood" value={mood} onChange={setMood} /></div>
      <div className="mb-4"><p className="mb-1.5 text-xs font-medium">Energy</p><ScaleChoices scale="Energy" value={energy} onChange={setEnergy} /></div>

      <button
        onClick={save}
        disabled={create.isPending}
        className="w-full rounded-lg bg-gradient-to-r from-type-journal to-type-idea py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
      >
        {create.isPending ? "Saving…" : "Save check-in"}
      </button>
    </div>
  );
}
