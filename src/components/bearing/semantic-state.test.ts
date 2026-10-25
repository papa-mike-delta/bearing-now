import { expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScaleChoices, FinanceAmount, PriorityBadge, StatusBadge } from "./semantic-state";

it.each(["Mood", "Energy"] as const)("renders named %s choices with pressed state and a visible selected check", (scale) => {
  const html = renderToStaticMarkup(createElement(ScaleChoices, { scale, value: 3, onChange: vi.fn() }));
  expect(html).toContain(`role="group" aria-label="${scale}"`);
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(4);
  expect(html).toContain(`${scale}: ${scale === "Mood" ? "Okay" : "Steady"}, 3 of 5`);
  expect(html).toContain("3/5");
  expect(html).toContain("lucide-check");
  expect(html).toContain('aria-hidden="true"');
});
it("renders state labels and finance direction even when colors are unavailable", () => {
  expect(renderToStaticMarkup(createElement(StatusBadge, { status: "snoozed" }))).toContain("Snoozed");
  expect(renderToStaticMarkup(createElement(PriorityBadge, { priority: 4 }))).toContain("Priority Urgent");
  expect(renderToStaticMarkup(createElement(FinanceAmount, { kind: "expense", amount: 20 }))).toContain("Expense −$20");
  expect(renderToStaticMarkup(createElement(FinanceAmount, { kind: "goal", amount: 20 }))).toContain("Savings goal $20");
});
