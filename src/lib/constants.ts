import { domainColor, itemColor } from "./product-colors";

// bearing.now — shared constants

export type DomainKey =
  | "mind_soul"
  | "time_action"
  | "health"
  | "wealth"
  | "network"
  | "growth"
  | "creativity"
  | "admin";

export interface DomainMeta {
  key: DomainKey;
  name: string;
  short: string;
  description: string;
  icon: string; // lucide icon name
  color: string; // CSS color value
  order: number;
}

export const DOMAINS: DomainMeta[] = [
  {
    key: "mind_soul",
    name: "Mind & Soul",
    short: "Mind",
    description: "Core values, visions, fears, affirmations, therapy notes, meditation.",
    icon: "Compass",
    color: domainColor({ key: "mind_soul" }),
    order: 0,
  },
  {
    key: "time_action",
    name: "Time & Action",
    short: "Action",
    description: "Tasks, habits, routines, deep work blocks, bucket lists.",
    icon: "Hourglass",
    color: domainColor({ key: "time_action" }),
    order: 1,
  },
  {
    key: "health",
    name: "Health & Body",
    short: "Health",
    description: "Sleep, fitness, nutrition, symptoms, medications, appointments.",
    icon: "HeartPulse",
    color: domainColor({ key: "health" }),
    order: 2,
  },
  {
    key: "wealth",
    name: "Wealth & Career",
    short: "Wealth",
    description: "Income, expenses, subscriptions, bills, savings goals, career.",
    icon: "TrendingUp",
    color: domainColor({ key: "wealth" }),
    order: 3,
  },
  {
    key: "network",
    name: "Network",
    short: "Network",
    description: "Contacts, important dates, interaction logs, follow-ups, gifts, pets.",
    icon: "Users",
    color: domainColor({ key: "network" }),
    order: 4,
  },
  {
    key: "growth",
    name: "Growth",
    short: "Growth",
    description: "Reading list, courses, skill building, saved articles, takeaways.",
    icon: "BookOpen",
    color: domainColor({ key: "growth" }),
    order: 5,
  },
  {
    key: "creativity",
    name: "Creativity & Joy",
    short: "Joy",
    description: "Idea vault, side projects, media log, hobbies, travel, events.",
    icon: "Palette",
    color: domainColor({ key: "creativity" }),
    order: 6,
  },
  {
    key: "admin",
    name: "Admin",
    short: "Admin",
    description: "Document vault, home maintenance, inventory, grocery lists, recipes.",
    icon: "Home",
    color: domainColor({ key: "admin" }),
    order: 7,
  },
];

export const DOMAIN_MAP: Record<string, DomainMeta> = Object.fromEntries(
  DOMAINS.map((d) => [d.key, d]),
);

export type ItemType =
  | "task"
  | "note"
  | "journal"
  | "habit"
  | "event"
  | "finance"
  | "contact"
  | "idea"
  | "goal"
  | "document"
  | "bookmark"
  | "milestone"
  | "routine"
  | "symptom"
  | "medication"
  | "affirmation"
  | "vision";

export interface ItemTypeMeta {
  type: ItemType;
  name: string;
  icon: string;
  color: string;
  hasDate?: boolean;
  completable?: boolean;
}

export const ITEM_TYPES: ItemTypeMeta[] = [
  { type: "task", name: "Task", icon: "CheckSquare", color: itemColor("task"), hasDate: true, completable: true },
  { type: "note", name: "Note", icon: "StickyNote", color: itemColor("note") },
  { type: "journal", name: "Journal", icon: "BookHeart", color: itemColor("journal"), hasDate: true },
  { type: "habit", name: "Habit", icon: "Repeat", color: itemColor("habit") },
  { type: "event", name: "Event", icon: "Calendar", color: itemColor("event"), hasDate: true },
  { type: "finance", name: "Finance", icon: "Wallet", color: itemColor("finance"), hasDate: true },
  { type: "contact", name: "Contact", icon: "User", color: itemColor("contact") },
  { type: "idea", name: "Idea", icon: "Lightbulb", color: itemColor("idea") },
  { type: "goal", name: "Goal", icon: "Target", color: itemColor("goal"), hasDate: true },
  { type: "document", name: "Document", icon: "FileText", color: itemColor("document") },
  { type: "bookmark", name: "Bookmark", icon: "Bookmark", color: itemColor("bookmark") },
  { type: "milestone", name: "Milestone", icon: "Flag", color: itemColor("milestone"), hasDate: true, completable: true },
  { type: "routine", name: "Routine", icon: "ListChecks", color: itemColor("routine") },
  { type: "symptom", name: "Symptom", icon: "Thermometer", color: itemColor("symptom"), hasDate: true },
  { type: "medication", name: "Medication", icon: "Pill", color: itemColor("medication"), hasDate: true },
  { type: "affirmation", name: "Affirmation", icon: "Heart", color: itemColor("affirmation") },
  { type: "vision", name: "Vision", icon: "Eye", color: itemColor("vision") },
];

export const ITEM_TYPE_MAP: Record<string, ItemTypeMeta> = Object.fromEntries(
  ITEM_TYPES.map((t) => [t.type, t]),
);

export type ItemStatus = "inbox" | "active" | "done" | "archived" | "snoozed";

export const STATUS_META: Record<ItemStatus, { name: string; color: string }> = {
  inbox: { name: "Inbox", color: "var(--status-inbox)" },
  active: { name: "Active", color: "var(--status-active)" },
  done: { name: "Done", color: "var(--status-done)" },
  archived: { name: "Archived", color: "var(--status-archived)" },
  snoozed: { name: "Snoozed", color: "var(--status-snoozed)" },
};

export const PRIORITY_META = [
  { value: 0, name: "None", color: "var(--priority-none)" },
  { value: 1, name: "Low", color: "var(--priority-low)" },
  { value: 2, name: "Medium", color: "var(--priority-medium)" },
  { value: 3, name: "High", color: "var(--priority-high)" },
  { value: 4, name: "Urgent", color: "var(--priority-urgent)" },
];

export const ENERGY_META = [
  { value: 0, name: "—", color: "var(--energy-none)" },
  { value: 1, name: "Low", color: "var(--energy-low)" },
  { value: 2, name: "Medium", color: "var(--energy-medium)" },
  { value: 3, name: "High", color: "var(--energy-high)" },
];

export const REVIEW_PROMPTS = {
  daily: {
    wins: "What went well today?",
    challenges: "What didn't go as planned?",
    learnings: "What did you learn?",
    gratitude: "What are you grateful for?",
    priorities: "What's your top focus for tomorrow?",
  },
  weekly: {
    wins: "What were this week's wins?",
    challenges: "What drained you or blocked progress?",
    learnings: "What did you learn about yourself?",
    gratitude: "Who or what are you grateful for this week?",
    priorities: "What 3 things matter most next week?",
  },
};
