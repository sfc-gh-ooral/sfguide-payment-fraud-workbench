# Design: Ferrovane Fraud Desk

The look and feel of this pack's app and landing page. Everything here is fictional: the product
(Ferrovane), the bank in the data (Northwind Financial), and every person, merchant, and account.

## Brand

- **Name:** Ferrovane Fraud Desk. A coined name (ferro, iron + vane, the weather vane that turns the
  moment the wind shifts): a steady instrument that shows which way money is moving, fast.
- **Audience:** fraud analysts and fraud-operations leads working a queue under an SLA, often on the
  night shift, plus the model-risk people who tune thresholds.
- **Voice:** a calm shift lead. Evidence first, verdict second. Short labels ("Signals", "Evidence",
  "Decision"), exact IDs in monospace, every number says what it was measured on. No alarmism and no
  hype: the app shows a score and its reasons, and the analyst decides.
- **Logo mark** (inline SVG, no image files): a hexagon (a nod to the H3 cells on the map) holding a
  vane arrow that points up and right.

```html
<svg viewBox="0 0 32 32" aria-hidden="true">
  <path d="M16 2.5 28 9.25v13.5L16 29.5 4 22.75V9.25Z" fill="#12161B" stroke="#C8F542" stroke-width="1.6"/>
  <path d="M10 21.5 21.5 10M14.5 10H21.5V17" fill="none" stroke="#C8F542" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="10" cy="21.5" r="2.2" fill="#FF4D8D"/>
</svg>
```

## Design direction

**Night-shift operations console.** Dark by default (a light theme is one click away), dense, and
instrument-like: data typography in monospace, hairline rules, glowing signal colors used only where
they mean something.

### Palette (tokens in `app/globals.css`, exposed to Tailwind with `@theme`)

| Token | Dark (default) | Light | Use |
| --- | --- | --- | --- |
| `bg` (graphite) | `#0A0C0F` | `#F4F6F2` | Page, with a faint 32 px dot grid |
| `surface` | `#12161B` | `#FFFFFF` | Panels, tables, drawer |
| `surface-2` | `#1A2027` | `#EDF1EA` | Table headers, insets, skeletons |
| `line` | `#262E38` | `#D6DCD2` | Hairlines and grid lines |
| `ink` | `#E8EDF2` | `#0E1216` | Text |
| `muted` | `#97A3B0` | `#535E69` | Secondary text (AA on `bg` and `surface` in both themes) |
| `signal` (lime) | `#C8F542` | `#4C6E00` | Brand, primary action, focus ring, model score, series 1 |
| `fraud` (magenta) | `#FF5C97` | `#BE1858` | Confirmed fraud, losses, overdue SLA, high priority |
| `link` (cyan) | `#46D2FF` | `#086C93` | Links, devices and IPs in the graph, info |
| `warn` (amber) | `#FFB547` | `#875600` | SLA under 2 h, medium priority, rules |
| `clear` (mint) | `#3EDBA0` | `#0D7650` | False positive, cleared, Live badge |
| `ai` (violet) | `#B49CFF` | `#6236D1` | AI panels and the "Sample AI response" label |

Lime on graphite is the brand moment; magenta is reserved for fraud so the eye goes to it first.
Text on lime buttons is `#0A0C0F` (contrast 15:1).

### Typography

- UI: the system sans stack (`-apple-system, "Segoe UI", Inter, Roboto, sans-serif`), 13–14 px body,
  tight tracking on headings.
- Data: the system monospace stack (`ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`)
  with tabular figures for IDs, amounts, scores, timers, and eyebrow labels (uppercase, 10–11 px,
  0.14 em tracking). Monospace-forward data is this pack's signature.

### Layout model

- **Top bar, no sidebar.** Logo, five tabs, an environment badge (Sample or Live), a role chip
  ("Fraud analyst · Tier 2"), and a theme toggle.
- **Signal ticker** under the top bar: the newest open alerts scroll past as monospace chips
  (pauses on hover, static when the reader prefers reduced motion).
- Content on a 12-column grid, max width 1440 px. Panels are square-cornered (6 px radius) with
  hairline borders, not floating rounded cards.
- On phones the tabs move to a fixed **bottom tab bar**, panels stack, and tables become row cards.
  No horizontal page scroll at 390 px.
- **Detail drawer** slides in from the right on the alert queue; the full case is its own screen.

### Density, charts, motion

- Dense: 36 px table rows, 12 px gaps, KPI tiles with a sparkline and a week-over-week delta.
- Charts (Recharts): thin 1.5 px lines, lime area gradients for volume, magenta for fraud, dashed
  amber reference lines for thresholds; custom dark tooltips and explicit legends.
- Maps and the link graph are hand-drawn SVG (no tiles, no CDN), with a soft glow on flagged points.
- Motion: 160 ms fades and slides, skeleton shimmer while loading, counters that tick up on first
  paint, a pulsing dot on the Live badge and on overdue SLAs, a streaming text reveal for AI output.
  Everything honors `prefers-reduced-motion`.

## How this pack differs from the rest of the catalog

Looked at the landing pages and Try apps of: Auto Finance Portfolio Analytics (Odometer), Workforce
Intelligence, Client Account Views (Quillstone Advisor Desk), Continuous Control Testing
(Tallyward), Market Data Discovery (Tidemere), and the shared v1 template used by the original
pipeline packs.

| Pack | Their look | What Ferrovane avoids |
| --- | --- | --- |
| Odometer | Dark green left sidebar, big gradient hero banner, rounded KPI tiles with corner blobs | No sidebar, no hero banner in the app, no corner blobs; square instrument panels |
| Workforce Intelligence | Purple sidebar, serif display type, warm cream canvas, gradient headline | No serif, no gradient text, no cream; graphite and monospace |
| Quillstone | Saffron on charcoal, advisor-desk layout | No orange/saffron accent; lime + magenta signal pair |
| Tallyward | Paper and vermilion, ledger grid, light-first | Dark-first, dot grid instead of ledger lines, no vermilion |
| Tidemere | Glacier blue and raspberry, navy rail, topographic contours | No blue rail or contour art; top bar + ticker |
| v1 template | Navy sidebar, blue accent, rounded cards | Every element of it |

No other pack uses a top bar with a ticker, a bottom tab bar on phones, a lime/magenta palette, or a
monospace data face.

## Landing page (`docs/index.html`)

Same brand, its own composition: a graphite hero split between a problem-first headline and an
inline SVG "link constellation" (accounts, devices, and IPs, with the mule ring glowing magenta),
then a three-step "signal → evidence → decision" strip, a screenshot gallery with captions naming
each Snowflake capability, a capabilities table, and the disclaimer. It follows the reader's color
scheme (dark by default). No CDN scripts or web fonts.
