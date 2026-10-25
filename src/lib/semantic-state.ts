import { PRIORITY_META, STATUS_META, type ItemStatus } from "./constants";

export const MOOD_OPTIONS = [
  { value: 1, label: "Low", icon: "Frown", color: "var(--mood-1)" },
  { value: 2, label: "Meh", icon: "Meh", color: "var(--mood-2)" },
  { value: 3, label: "Okay", icon: "Smile", color: "var(--mood-3)" },
  { value: 4, label: "Good", icon: "SmilePlus", color: "var(--mood-4)" },
  { value: 5, label: "Great", icon: "Laugh", color: "var(--mood-5)" },
];
export const CHECK_IN_ENERGY_OPTIONS = [
  { value: 1, label: "Drained", icon: "BatteryLow", color: "var(--checkin-energy-1)" },
  { value: 2, label: "Low", icon: "BatteryLow", color: "var(--checkin-energy-2)" },
  { value: 3, label: "Steady", icon: "BatteryMedium", color: "var(--checkin-energy-3)" },
  { value: 4, label: "Strong", icon: "BatteryFull", color: "var(--checkin-energy-4)" },
  { value: 5, label: "Charged", icon: "BatteryCharging", color: "var(--checkin-energy-5)" },
];
export type CheckInScale = "Mood" | "Energy";
export function scaleOptions(scale: CheckInScale) { return scale === "Mood" ? MOOD_OPTIONS : CHECK_IN_ENERGY_OPTIONS; }
export function scaleValueText(scale: CheckInScale, value: number): string {
  const option = scaleOptions(scale).find((option) => option.value === value);
  return option ? `${option.label}, ${value} of 5` : "Not recorded";
}
export function statusCue(status: string) {
  return Object.hasOwn(STATUS_META, status) ? STATUS_META[status as ItemStatus] : { name: status || "Unknown status", color: "var(--muted-foreground)" };
}
export function priorityCue(priority: number) { return PRIORITY_META.find((p) => p.value === priority) ?? { name: "Unknown", color: "var(--muted-foreground)" }; }
export function financeCue(kind: unknown) {
  switch (kind) {
    case "income": return { label: "Income", icon: "ArrowDownLeft", color: "var(--income)", sign: "+" };
    case "expense": return { label: "Expense", icon: "ArrowUpRight", color: "var(--expense)", sign: "−" };
    case "goal": return { label: "Savings goal", icon: "Target", color: "var(--type-goal)", sign: "" };
    default: return { label: "Amount", icon: "Wallet", color: "var(--muted-foreground)", sign: "" };
  }
}

export function formatFinanceAmount(kind: unknown, amount: unknown): string {
  if (amount == null || (typeof amount === "string" && !amount.trim())) return "—";
  const cue = financeCue(kind), number = Number(amount);
  return Number.isFinite(number) ? `${number < 0 ? "−" : cue.sign}$${Math.abs(number).toLocaleString()}` : "—";
}
