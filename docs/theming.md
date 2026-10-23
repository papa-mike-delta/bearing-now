# Theme overrides

The override flow follows ADR-0003. `ThemeOverride` is the shared boundary for
parsing CSS, JSON, or a shadcn/create URL, validating custom properties, and
serializing light and dark variable maps. It keeps the extended variable surface
(including chart, sidebar, font, radius, and shadow variables).

The generate script writes `src/app/theme-override.css`, imported after
`globals.css`. The authenticated settings route stores normalized maps in the
existing `Setting` model under `theme-<userId>`. A separate key avoids overwriting
other preferences during an import; no schema change is needed. The app loads
the stored override after the generated stylesheet and updates it immediately
after import. The existing Light/Dark/System control chooses the variant.

Only custom properties are serialized. Other rules and imports in an exported
stylesheet are discarded. Variable names and values are validated before saving
and when loading stored data. URL imports accept only HTTPS `ui.shadcn.com/create`
URLs (or its `/init` export endpoint); redirects are refused.

Generate a deployment default:

```sh
npm run theme:generate -- 'https://ui.shadcn.com/create?theme=blue&baseColor=neutral'
```

The create URL's query parameters are passed to shadcn's `/init` JSON endpoint.
Restart the development server or rebuild after generating. The script never
writes `globals.css`.

In Settings → Appearance & Notifications, paste a create URL, exported CSS, or
JSON and select **Import theme**. JSON accepts `{ "light": {...}, "dark": {...} }`
or shadcn's `{ "cssVars": { "theme": {...}, "light": {...}, "dark": {...} } }`.
Names may include or omit `--`; both variants must contain variables. The
optional `theme` map provides shared variables. **Reset imported theme** restores
the deployment default. Imported font variables can reference fonts already
available in the app; imports never load external font files or stylesheets.

Tests live at the agreed `ThemeOverride` and settings route seams, with CSS/JSON
fixtures and mocked network responses. Tests never fetch live themes.
