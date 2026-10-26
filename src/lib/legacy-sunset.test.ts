import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const root = join(process.cwd(), "src");
const forbidden = [
  /@\/lib\/domain/,
  /@\/lib\/coach/,
  /@\/lib\/dates/,
  /@\/lib\/hooks/,
  /@\/lib\/constants/,
  /@\/lib\/seed/,
  /@\/store\/bearing/,
  /\bItemDomain\b/,
  /\bCoachTools\b/,
  /(?<![\w])db\.item\b/,
  /(?<![\w])db\.project\b/,
  /(?<![\w])db\.link\b/,
  /(?<![\w])db\.domain\b/,
  /(?<![\w])db\.review\b/,
  /(?<![\w])db\.tag\b/,
  /(?<![\w])db\.habitLog\b/,
  /(?<![\w])db\.reminder\b/,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "legacy-sunset.test.ts") return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

it("keeps the product tree off the legacy domain and Coach", () => {
  expect(() => statSync(join(root, "lib/domain"))).toThrow();
  expect(() => statSync(join(root, "lib/coach"))).toThrow();
  const hits = files(root).flatMap((path) => {
    if (!/\.(ts|tsx)$/.test(path)) return [];
    const text = readFileSync(path, "utf8");
    return forbidden
      .filter((pattern) => pattern.test(text))
      .map((pattern) => `${path}: ${pattern}`);
  });
  expect(hits).toEqual([]);
});
