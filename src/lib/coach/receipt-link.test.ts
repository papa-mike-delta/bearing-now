import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoachReceiptLink, coachReceiptHref } from "./receipt-link";

it("builds a receipt href", () => {
  expect(coachReceiptHref("receipt 1")).toBe("/api/coach?receipt=receipt%201");
});

it("renders one truncated receipt link", () => {
  const html = renderToStaticMarkup(createElement(CoachReceiptLink, { receiptId: "receipt 1", className: "max-w-full", children: "Created Read" }));
  expect(html).toContain('href="/api/coach?receipt=receipt%201"');
  expect(html).toContain("Created Read");
  expect(html).toContain("truncate");
  expect(html).toContain("underline");
  expect(html).toContain("max-w-full");
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer"');
  expect(html).not.toContain("\n");
});
