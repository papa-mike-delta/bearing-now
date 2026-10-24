import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/lib/session";
import { proxy } from "./proxy";

const request = (path: string, token?: string) => new NextRequest(`http://localhost${path}`, {
  headers: token ? { cookie: `lifeos-session=${token}` } : {},
});

it.each(["/", "/login"])("redirects a signed-in visit to %s to /app", (path) => {
  const response = proxy(request(path, createSession("u1", "a@example.com", true)));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/app");
});

it.each([
  ["no cookie", undefined],
  ["a forged cookie", "forged"],
  ["a session still awaiting 2FA", createSession("u1", "a@example.com", false)],
])("serves the landing page uncached with %s", (_label, token) => {
  const response = proxy(request("/", token));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
