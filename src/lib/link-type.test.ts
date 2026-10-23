import { describe, expect, it } from "vitest";
import { LinkType } from "./link-type";

describe("LinkType", () => {
  it.each([
    "advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at",
  ])("accepts %s", (value) => {
    expect(LinkType.isValid(value)).toBe(true);
    expect(LinkType.parse(value)).toBe(value);
  });

  it.each([
    "related", "blocks", "parent", "subtask", "references", "depends-on",
    "", "ADVANCES", " advances ", "unknown", null, undefined, 1, {}, [[]],
  ])("rejects %j", (value) => {
    expect(LinkType.isValid(value)).toBe(false);
    expect(() => LinkType.parse(value)).toThrow("Invalid Link type");
  });
});
