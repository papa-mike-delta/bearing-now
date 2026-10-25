"use client";

import { financeCue, formatFinanceAmount, priorityCue, statusCue, scaleOptions, scaleValueText, type CheckInScale } from "@/lib/semantic-state";
import { colorWithAlpha } from "@/lib/product-colors";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const cue = statusCue(status);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs" style={{ background: colorWithAlpha(cue.color), color: cue.color }}>
      {cue.name}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: number }) {
  const cue = priorityCue(priority);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold" style={{ background: colorWithAlpha(cue.color), color: cue.color }}>
      <Icon name="Flag" className="h-3 w-3 shrink-0" /><span>Priority {cue.name}</span>
    </span>
  );
}

export function FinanceAmount({ kind, amount }: { kind: unknown; amount: unknown }) {
  const cue = financeCue(kind);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs font-semibold" style={{ color: cue.color }}>
      <Icon name={cue.icon} className="h-3 w-3 shrink-0" /><span>{cue.label} {formatFinanceAmount(kind, amount)}</span>
    </span>
  );
}

export function ScaleChoices({ scale, value, onChange }: { scale: CheckInScale; value: number | null; onChange: (value: number) => void }) {
  return (
    <div role="group" aria-label={scale} className="grid grid-cols-3 gap-1 sm:grid-cols-5">
      {scaleOptions(scale).map((option) => (
        <button
          type="button"
          key={option.value}
          aria-label={`${scale}: ${scaleValueText(scale, option.value)}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("relative flex min-w-11 flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-2 text-xs", value === option.value ? "border-foreground font-semibold" : "border-transparent bg-muted/40 hover:bg-muted")}
          style={value === option.value ? { background: colorWithAlpha(option.color, 16) } : undefined}
        >
          <Icon name={option.icon} className="h-5 w-5" />
          <span>{option.label}</span>
          <span>{option.value}/5{value === option.value && <Icon name="Check" className="ml-1 inline h-3 w-3" />}</span>
        </button>
      ))}
    </div>
  );
}
