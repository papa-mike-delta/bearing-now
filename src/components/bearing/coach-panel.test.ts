import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoachActivityList, CoachPanel } from "./coach-panel";

it("shows the activity feed inside the Coach panel", () => {
  const html = renderToStaticMarkup(createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(CoachPanel),
  ));
  expect(html).toContain("Coach");
  expect(html).toContain("Activity");
  expect(html).toContain("No Coach activity yet");
});

it("links each Coach write and conflict receipt from the feed", () => {
  const html = renderToStaticMarkup(createElement(CoachActivityList, {
    activity: [
      { id: "receipt 1", line: "Created Read" },
      { id: "receipt-2", line: "Refused update Read" },
    ],
  }));
  expect(html).toContain("Created Read");
  expect(html).toContain("Refused update Read");
  expect(html).toContain('href="/api/coach?receipt=receipt%201"');
  expect(html).toContain('href="/api/coach?receipt=receipt-2"');
});
