"use client";

import { useItems } from "@/lib/hooks";
import { useBearing } from "@/store/bearing";
import { Icon } from "./icon";
import { motion } from "framer-motion";
import { fmtDate, smartDate } from "@/lib/dates";

export function SubscriptionsOverview() {
  const { data } = useItems({ type: "finance", status: "active,done" });
  const { openItemDetail, openItemEditor } = useBearing();

  const items = data?.items || [];
  const subscriptions = items.filter((i: any) => i.metadata?.recurring && i.metadata?.recurring !== "one-time");
  const income = items.filter((i: any) => i.metadata?.kind === "income");
  const expenses = items.filter((i: any) => i.metadata?.kind === "expense" && (!i.metadata?.recurring || i.metadata?.recurring === "one-time"));
  const goals = items.filter((i: any) => i.metadata?.kind === "goal");

  const monthlySubTotal = subscriptions.reduce((s: number, s2: any) => s + (Number(s2.metadata?.amount) || 0), 0);
  const yearlySubTotal = monthlySubTotal * 12;
  const monthlyIncome = income.reduce((s: number, i: any) => s + (Number(i.metadata?.amount) || 0), 0);
  const monthlyExpenses = expenses.reduce((s: number, i: any) => s + (Number(i.metadata?.amount) || 0), 0);
  const net = monthlyIncome - monthlyExpenses - monthlySubTotal;

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-4"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-income/15 text-income">
            <Icon name="Wallet" className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Wealth overview</h3>
        </div>
        <p className="text-xs text-muted-foreground">Track income, expenses, subscriptions, and savings goals.</p>
        <button
          onClick={() => openItemEditor({ type: "finance" })}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-income hover:underline"
        >
          <Icon name="Plus" className="h-3 w-3" /> Add a transaction
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Monthly cashflow card */}
      <div className="rounded-2xl border border-income/20 bg-gradient-to-br from-income/5 to-transparent p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-income/15 text-income">
            <Icon name="TrendingUp" className="h-3.5 w-3.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold">Monthly cashflow</h3>
            <p className="text-xs text-muted-foreground">Income minus expenses & subscriptions</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-income/10 p-2.5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-income">Income</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-income">${monthlyIncome.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-expense/10 p-2.5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-expense">Expenses</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-expense">${(monthlyExpenses + monthlySubTotal).toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-muted p-2.5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net</p>
            <p className={`mt-0.5 text-base font-bold tabular-nums ${net >= 0 ? "text-income" : "text-expense"}`}>
              {net >= 0 ? "+" : "−"}${Math.abs(net).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Subscriptions card */}
      {subscriptions.length > 0 && (
        <div className="rounded-2xl border border-priority-high/20 bg-gradient-to-br from-priority-high/5 to-transparent p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-priority-high/15 text-priority-high">
                <Icon name="Repeat" className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Subscriptions</h3>
                <p className="text-xs text-muted-foreground">
                  ${monthlySubTotal.toFixed(2)}/mo · ${yearlySubTotal.toFixed(0)}/yr
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            {subscriptions.slice(0, 5).map((s: any, i: number) => (
              <motion.button
                key={s.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => openItemDetail(s.id)}
                className="group flex w-full items-center gap-2 rounded-lg border border-border/40 bg-background/40 p-2 text-left transition-all hover:bg-background"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-priority-high/10 text-priority-high">
                  <Icon name="CreditCard" className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.metadata?.recurring} · next {smartDate(s.dueDate)}
                  </p>
                </div>
                <span className="text-xs font-bold tabular-nums text-expense">
                  ${Number(s.metadata?.amount).toFixed(2)}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Savings goals */}
      {goals.length > 0 && (
        <div className="rounded-2xl border border-type-bookmark/20 bg-gradient-to-br from-type-bookmark/5 to-transparent p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-type-bookmark/15 text-type-bookmark">
              <Icon name="Target" className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold">Savings goals</h3>
          </div>
          <div className="space-y-2">
            {goals.map((g: any, i: number) => {
              const target = Number(g.metadata?.amount) || 0;
              const current = Number(g.metadata?.current) || 0;
              const pct = target > 0 ? Math.round((current / target) * 100) : 0;
              return (
                <motion.button
                  key={g.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => openItemDetail(g.id)}
                  className="block w-full text-left"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{g.title}</span>
                    <span className="text-muted-foreground">
                      ${current.toLocaleString()} / ${target.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.05 }}
                      className="h-full rounded-full bg-gradient-to-r from-type-bookmark to-type-bookmark"
                    />
                  </div>
                  <p className="mt-0.5 text-right text-xs font-medium text-type-bookmark">{pct}%</p>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
