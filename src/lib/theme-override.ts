import postcss from "postcss";

export type ThemeVariables = {
  light: Record<string, string>;
  dark: Record<string, string>;
};

const VALUE_FUNCTIONS = new Set([
  "oklch", "oklab", "lch", "lab", "rgb", "rgba", "hsl", "hsla", "hwb",
  "color", "color-mix", "var", "calc", "min", "max", "clamp", "light-dark",
]);

export class ThemeOverride {
  static async parse(input: string): Promise<ThemeVariables> {
    if (typeof input !== "string" || !input.trim() || input.length > 100_000) {
      throw new Error("Provide a theme URL, CSS, or JSON (up to 100 KB).");
    }
    input = input.trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
      const url = new URL(input);
      if (url.origin !== "https://ui.shadcn.com" || url.username || url.password ||
          !["/create", "/create/", "/init", "/init/"].includes(url.pathname)) {
        throw new Error("Use an HTTPS theme URL from ui.shadcn.com/create.");
      }
      url.pathname = "/init";
      url.hash = "";
      // The builder fills these in interactively; the export endpoint requires them.
      const defaults = { base: "radix", style: "nova", baseColor: "neutral", theme: "neutral", iconLibrary: "lucide", font: "geist", radius: "default", menuAccent: "subtle", menuColor: "default" };
      for (const [name, value] of Object.entries(defaults)) {
        if (!url.searchParams.has(name)) url.searchParams.set(name, value);
      }
      const response = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Theme export failed (${response.status}).`);
      input = (await response.text()).trim();
      if (!input.startsWith("{") || input.length > 100_000) throw new Error("Expected a shadcn JSON theme export.");
    }
    if (input.startsWith("{") || input.startsWith("[") || input === "null") {
      const data = JSON.parse(input);
      const variables = data?.cssVars ?? data;
      const normalize = (map: unknown): Record<string, string> => {
        if (!map || typeof map !== "object" || Array.isArray(map)) throw new Error("Expected a variable map.");
        return Object.fromEntries(Object.entries(map).map(([name, value]) => [name.startsWith("--") ? name : `--${name}`, value]));
      };
      const shared = variables?.theme === undefined ? {} : normalize(variables.theme);
      return ThemeOverride.validate({
        light: { ...shared, ...normalize(variables?.light) },
        dark: { ...shared, ...normalize(variables?.dark) },
      });
    }
    const theme: ThemeVariables = { light: {}, dark: {} };
    const shared: Record<string, string> = {};
    const root = postcss.parse(input);
    for (const node of root.nodes) {
      const target = node.type === "rule"
        ? node.selector === ":root" ? theme.light : node.selector === ".dark" ? theme.dark : null
        : node.type === "atrule" && node.name === "theme" && ["", "inline"].includes(node.params) ? shared : null;
      if (!target) continue;
      for (const declaration of ("nodes" in node ? node.nodes : []) ?? []) {
        if (declaration.type === "comment") continue;
        if (declaration.type !== "decl" || !declaration.prop.startsWith("--") || declaration.important) {
          throw new Error("Theme blocks may contain only CSS custom properties.");
        }
        target[declaration.prop] = declaration.value;
      }
    }
    ThemeOverride.validate(theme);
    return ThemeOverride.validate({ light: { ...shared, ...theme.light }, dark: { ...shared, ...theme.dark } });
  }

  static validate(theme: ThemeVariables): ThemeVariables {
    for (const variables of [theme.light, theme.dark]) {
      if (!variables || typeof variables !== "object" || Array.isArray(variables) || !Object.keys(variables).length) {
        throw new Error("Include non-empty light and dark variable maps.");
      }
      for (const [name, value] of Object.entries(variables)) {
        if (!/^--[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) throw new Error(`Invalid custom property: ${name}`);
        if (typeof value !== "string" || !value.trim() || value.length > 2000 ||
            !/^[a-zA-Z0-9\s#%.,()+*/'"_-]+$/.test(value) || /\/\*|\*\//.test(value)) {
          throw new Error(`Invalid value for ${name}`);
        }
        for (const match of value.matchAll(/([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\(/g)) {
          if (!VALUE_FUNCTIONS.has(match[1].toLowerCase())) throw new Error(`Unsupported CSS function in ${name}`);
        }
        // Check balanced strings and functions as well as the restricted token set.
        postcss.parse(`:root { ${name}: ${value}; }`);
      }
    }
    return theme;
  }

  static serialize(theme: ThemeVariables): string {
    ThemeOverride.validate(theme);
    return ([ [":root", theme.light], [".dark", theme.dark] ] as const)
      .map(([selector, variables]) => `${selector} {\n${Object.entries(variables)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`)
      .join("\n\n") + "\n";
  }
}
