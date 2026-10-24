import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const toast = vi.hoisted(() => ({
  success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), promise: vi.fn(), dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import { notify } from "./toast";

beforeEach(() => vi.resetAllMocks());

function receiptToast(ok: boolean) {
  notify.receipt(ok ? "Created Read" : "Refused update Read", "receipt 1", ok);
  const call = ok ? toast.success : toast.error;
  expect(call).toHaveBeenCalledTimes(1);
  expect(ok ? toast.error : toast.success).not.toHaveBeenCalled();
  const [content, options] = call.mock.calls[0] as [ReactElement<{ children: string }>, { duration?: number; description?: string }];
  expect(options).toEqual({ duration: 3000 });
  expect(content.props.children).toBe(ok ? "Created Read" : "Refused update Read");
  expect(content.props.children).not.toMatch(/\n/);
  const html = renderToStaticMarkup(content);
  expect(html).toContain('href="/api/coach?receipt=receipt%201"');
  expect(html).toContain("truncate");
  expect(html).toContain("max-w-72");
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noreferrer"');
}

it.each([true, false])("shows a one-line Coach receipt toast that auto-dismisses in 3 seconds (ok=%s)", (ok) => {
  receiptToast(ok);
});

it("links an ordinary refusal to its session-scoped receipt route", () => {
  notify.receipt("This Item changed", "receipt /1", false, "user");
  expect(toast.error).toHaveBeenCalledTimes(1);
  const [content, options] = toast.error.mock.calls[0] as [ReactElement, { duration: number }];
  expect(renderToStaticMarkup(content)).toContain('href="/api/receipts/receipt%20%2F1"');
  expect(options.duration).toBe(6000);
});
