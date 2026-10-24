import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeOverride } from "./theme-override";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected network request"))));
afterEach(() => vi.unstubAllGlobals());

it("imports light and dark CSS variables while discarding unrelated rules", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.css"));
  expect(theme.light).toEqual({ "--background": "oklch(1 0 0)", "--primary": "oklch(0.488 0.243 264.376)", "--radius": "0.625rem" });
  expect(theme.dark).toEqual({ "--background": "oklch(0.145 0 0)", "--primary": "oklch(0.424 0.199 265.638)" });
  expect(ThemeOverride.serialize(theme)).toBe(":root {\n  --background: oklch(1 0 0);\n  --primary: oklch(0.488 0.243 264.376);\n  --radius: 0.625rem;\n}\n\n.dark {\n  --background: oklch(0.145 0 0);\n  --primary: oklch(0.424 0.199 265.638);\n}\n");
});

it.each([
  "red; color: red",
  "red} body {display:none",
  "</style><script>alert(1)</script>",
  "url(https://example.com/track)",
  "u\\72l(https://example.com/track)",
  "expression(alert(1))",
  "red !important",
  "red/*comment*/",
  "var(--color",
])("refuses unsafe variable value %s even when serializing stored data", (value) => {
  expect(() => ThemeOverride.serialize({ light: { "--primary": value }, dark: { "--primary": "black" } })).toThrow();
});

it.each([":root { --primary: red; }", ".dark { --primary: black; }", "body { color: red; }", ":root { --primary: red; color: red; } .dark { --primary: black; }"])("refuses incomplete or non-variable theme declarations", async (css) => {
  await expect(ThemeOverride.parse(css)).rejects.toThrow();
});

it("rejects invalid variable names and empty maps", () => {
  expect(() => ThemeOverride.serialize({ light: { "color": "red" }, dark: { "--primary": "black" } })).toThrow();
  expect(() => ThemeOverride.serialize({ light: {}, dark: {} })).toThrow();
});

it("imports shadcn registry JSON, including shared extended variables, and round-trips normalized JSON", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.json"));
  expect(theme.light["--primary"]).toBe("oklch(0.488 0.243 264.376)");
  expect(theme.dark["--primary"]).toBe("oklch(0.424 0.199 265.638)");
  expect(theme.light["--font-heading"]).toBe("var(--font-sans)");
  expect(theme.dark["--shadow-sm"]).toBe("0 1px 2px 0 rgb(0 0 0 / 0.05)");
  expect(await ThemeOverride.parse(JSON.stringify(theme))).toEqual(theme);
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
});

it("keeps shared variables from an exported Tailwind theme block", async () => {
  const theme = await ThemeOverride.parse(fixture("theme.css") + '\n@theme inline { --font-heading: "Geist", sans-serif; --shadow-sm: 0 1px 2px rgb(0 0 0 / 5%); }');
  expect(theme.light["--font-heading"]).toBe('"Geist", sans-serif');
  expect(theme.dark["--shadow-sm"]).toBe("0 1px 2px rgb(0 0 0 / 5%)");
});

it.each(["{}", "null", "[]", '{"light":{"primary":1},"dark":{"primary":"black"}}', '{"light":[],"dark":{}}', '{"cssVars":{"theme":{"radius":"1rem"}}}'])("rejects malformed JSON themes: %s", async (input) => {
  await expect(ThemeOverride.parse(input)).rejects.toThrow();
});

it("resolves a create URL through the JSON export endpoint, preserving its theme options", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  const theme = await ThemeOverride.parse("https://ui.shadcn.com/create?theme=blue&baseColor=neutral&preset=abc");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("https://ui.shadcn.com/init?theme=blue&baseColor=neutral&preset=abc"), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
  expect(theme.dark["--primary"]).toBe("oklch(0.424 0.199 265.638)");
});

it("supplies required builder defaults for a minimal create URL", async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(fixture("theme.json")));
  await ThemeOverride.parse("https://ui.shadcn.com/create?theme=blue");
  const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
  expect(url.searchParams.get("theme")).toBe("blue");
  expect(url.searchParams.get("base")).toBe("radix");
  expect(url.searchParams.get("style")).toBe("nova");
  expect(url.searchParams.get("font")).toBe("geist");
});

it.each([
  "https://example.com/create", "https://ui.shadcn.com.evil.test/create",
  "http://ui.shadcn.com/create", "https://ui.shadcn.com:8443/create",
  "https://user:pass@ui.shadcn.com/create", "https://ui.shadcn.com/other",
  "file:///etc/passwd", "https://ui.shadcn.com@127.0.0.1/create",
])("refuses unapproved theme URL %s before fetching", async (url) => {
  await expect(ThemeOverride.parse(url)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});

it("surfaces upstream errors and rejects redirects or HTML instead of importing the builder page", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow("503");
  vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow();
  vi.mocked(fetch).mockResolvedValueOnce(new Response("<html>Builder</html>"));
  await expect(ThemeOverride.parse("https://ui.shadcn.com/create")).rejects.toThrow();
});

it("preserves optional semantic overrides, non-hex values and extended palette variables", async () => {
  const theme = { light: { "--type-task": "hsl(210 70% 35%)", "--domain-health": "var(--primary)", "--income": "oklch(0.4 0.1 150)" }, dark: { "--type-task": "oklch(0.8 0.1 240)", "--mood-5": "color-mix(in oklch, var(--chart-2) 60%, white)" } };
  expect(await ThemeOverride.parse(ThemeOverride.serialize(theme))).toEqual(theme);
});
