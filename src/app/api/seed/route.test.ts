import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

it("refuses the shared credential seed", async () => {
  const response = await POST(
    new NextRequest("http://localhost/api/seed", { method: "POST" }),
  );
  expect(response.status).toBe(410);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("retired"),
  });
});
