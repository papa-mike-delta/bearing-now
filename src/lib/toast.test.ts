import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

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
  const [content, options] = call.mock.calls[0] as [ReactElement<{ href: string; children: string; className?: string }>, { duration?: number; description?: string }];
  expect(options).toEqual({ duration: 3000 });
  expect(content.props.children).toBe(ok ? "Created Read" : "Refused update Read");
  expect(content.props.children).not.toMatch(/\n/);
  expect(content.props.href).toBe("/api/coach?receipt=receipt%201");
  expect(content.type).toBe("a");
  expect(content.props.className).toContain("truncate");
}

it.each([true, false])("shows a one-line Coach receipt toast that auto-dismisses in 3 seconds (ok=%s)", (ok) => {
  receiptToast(ok);
});
