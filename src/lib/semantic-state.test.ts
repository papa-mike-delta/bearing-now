import { expect, it } from "vitest";
import { financeCue, formatFinanceAmount, priorityCue, scaleValueText, statusCue } from "./semantic-state";

it.each(["inbox", "active", "done", "archived", "snoozed"])("names %s without color", (status) => expect(statusCue(status).name.toLowerCase()).toBe(status));
it("handles legacy states and invalid priorities defensively", () => {
  expect(statusCue("constructor").name).toBe("constructor");
  expect(priorityCue(99).name).toBe("Unknown");
});
it.each([["income", "Income", "+$100"], ["expense", "Expense", "−$100"], ["goal", "Savings goal", "$100"], ["unknown", "Amount", "$100"]])("keeps %s distinct from other finance kinds", (kind, label, amount) => {
  expect(financeCue(kind).label).toBe(label);
  expect(formatFinanceAmount(kind, 100)).toBe(amount);
});
it("does not duplicate negative signs or invent an amount for malformed metadata", () => {
  expect(formatFinanceAmount("expense", -100)).toBe("−$100");
  expect(formatFinanceAmount("income", "invalid")).toBe("—");
  expect(formatFinanceAmount("income", null)).toBe("—");
  expect(formatFinanceAmount("income", "")).toBe("—");
});
it.each(["Mood", "Energy"] as const)("announces labels and values for %s", (scale) => {
  for (let value = 1; value <= 5; value++) expect(scaleValueText(scale, value)).toContain(`${value} of 5`);
  expect(scaleValueText(scale, 0)).toBe("Not recorded");
});
