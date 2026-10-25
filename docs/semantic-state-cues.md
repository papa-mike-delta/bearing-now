# Meaning without color

Semantic color remains an accent. Item cards and Agenda entries also show status
names, priority labels and finance direction. Shared badges use the existing
status/priority vocabulary. Finance amounts distinguish Income, Expense and
Savings goal; unknown legacy kinds use Amount rather than being called expenses.
Existing Item type icons and names remain in place. Completion controls announce
the Item and its pressed state.

`src/lib/semantic-state.ts` supplies pure labels for mood/energy scales, state
fallbacks and finance presentation. `ScaleChoices` is shared by dashboard check-in
and the full journal editor. Every option displays its label and numeric value,
announces the scale/label/value, and exposes `aria-pressed`. A border, bold label
and check glyph identify selection without relying on hue. Reflection sliders
expose names and descriptive `aria-valuetext` on the actual slider thumbs and
retain keyboard value changes. Their compact drawings sit in 44px touch targets.

Chart legends identify solid and dashed series. Mood/energy, activity and habit
charts provide expandable, captioned data tables with column headers and full
values; users do not need to hover. Habit cells show a check or minus as well as
color, and expose date/state names. Their layout scrolls locally so the glyphs
remain readable on a phone. Existing exports remain available.

Icon-only navigation, archive/delete, tag removal and graph search controls have
contextual names. The Icon helper hides decorative SVGs from the accessibility
tree by default; controls carry their own names. Selected filter controls expose
pressed state, with check marks on the audited filters. Review cards announce
expanded state and show mood/energy descriptions before expansion.

This work preserves saved status/priority/scale values, the Item/Link model,
explicit-save behavior, leases and receipt handling. It introduces no schema or
API contract changes.

Validation includes pure/SSR tests for labels, fallbacks and rendered control
semantics, plus browser role/name/value/pressed-state checks, keyboard selection,
monochrome imported colors, grayscale and forced-colors screenshots. The browser
accessibility representation is checked; this does not claim a native screen-reader
or operating-system high-contrast certification. Existing touch, typography,
draft, write and theme regressions remain relevant.
