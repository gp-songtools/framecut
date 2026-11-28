# Framecut design system (Master)

The source of truth for how Framecut looks. The tokens live on `:root` in [`src/index.html`](../../src/index.html); this file explains them. Change both together.

Page-specific deviations go in `pages/<page>.md`. A page file, when present, overrides this one. `pages/editor.md` holds the design plan for the editor (the only page; its dialogs and menus count as parts of it).

- **Product:** a browser video editor for music videos: multi-track timeline, effects, transitions, keyframes, audio sync and waveforms, stickers, audio visualizers, lyric text, song spec and Google Drive hand-offs. One offline HTML file.
- **Audience:** songwriters and producers in the GP Song Tools suite, hobbyist to semi-pro, often editing late at night, on a laptop or desktop; sometimes checking a cut on a phone.
- **Feel:** a professional editing suite (the calm, dense, dark workspace people know from desktop NLEs), part of the GP Song Tools family.
- **Made with:** the ui-ux-pro-max skill (2026-11-26). How each decision was reached is under [Provenance](#provenance).

## 1. UI style: Cutting room

Dark first, based on the skill's **Dark Mode (OLED)** style with the density and focus discipline of its **Adobe Spectrum** (creative tools) style: deep slate instead of pure black, panels in three layers, high-contrast text, bright colour only where it means something. A light theme is designed alongside it and chosen by `prefers-color-scheme`. The preview monitor stays near-black in both themes so footage is judged against a neutral surround.

The one signature idea: **every track has a colour, and so does every clip on it.** Video, Audio, Text, Overlay and Effects each own a hue that marks the track header chip, the clip's top edge and tint, and the matching Media/Inspector section. Everything else stays quiet: hairline borders, flat panels, no gradients, no glow. The sky `--accent` is reserved for the current selection, the playhead and the one primary action (Export).

## 2. Colour palette

Structure from the skill's **Short Video Editor** profile (`#0F172A` slate background, `#192134` card, muted `#94A3B8`). Its pink primary and blue CTA are replaced by Framecut's suite colour `--fc` (sky), as GP Song Tools requires; pink moves to the Overlay track.

### Roles

| Role | Token | Dark | Light | Use |
|---|---|---|---|---|
| Background | `--bg` | `#0B1120` | `#EEF2F7` | App chrome behind panels |
| Panel | `--panel` | `#111827` | `#FFFFFF` | Media, Inspector, timeline header |
| Panel 2 | `--panel-2` | `#172033` | `#F6F8FB` | Lanes, grouped sections, inputs |
| Raised | `--raised` | `#1F2A40` | `#E6EBF2` | Buttons, hover, chips |
| Border | `--line` | `#26324A` | `#D5DCE6` | Hairline dividers (decorative) |
| Border strong | `--line-ctl` | `#71809A` | `#6B7A90` | Input and control outlines (3:1+) |
| Text | `--ink` | `#F1F5F9` | `#0B1120` | Body, labels, values |
| Muted | `--muted` | `#A7B3C6` | `#475569` | Secondary labels, units, captions |
| Accent | `--accent` | `#38BDF8` | `#0369A1` | Selection, playhead, primary button, focus |
| On accent | `--on-accent` | `#0B1120` | `#FFFFFF` | Text on accent |
| Danger | `--err` | `#F87171` | `#B91C1C` | Errors, destructive confirmation |
| Monitor | `--monitor` | `#05070C` | `#05070C` | Preview surround, both themes |
| Focus ring | `--ring` | `#38BDF8` | `#0369A1` | 2px outline, 2px offset |

### Track colours (categorical)

| Track | Token | Dark | Light |
|---|---|---|---|
| Video | `--t-video` | `#818CF8` | `#4F46E5` |
| Audio | `--t-audio` | `#2DD4BF` | `#0F766E` |
| Text | `--t-text` | `#FBBF24` | `#92400E` |
| Overlay | `--t-overlay` | `#F472B6` | `#BE185D` |
| Effects | `--t-fx` | `#C084FC` | `#7E22CE` |

Rules: clip bodies are the track colour mixed 18–24% into `--panel-2`; clip top edge 3px in full colour; clip labels use `--ink`. A track colour always sits next to the track's name, never alone. Extracted-audio lanes reuse `--t-audio`.

### Contrast (checked with a WCAG script)

| Pair | Dark | Light |
|---|---|---|
| Text on bg / panel / raised | 17.2 / 16.2 / 13.1 | 16.7 / 18.8 / 15.7 |
| Muted on bg / panel / raised | 8.9 / 8.4 / 6.8 | 6.7 / 7.6 / 6.3 |
| Accent on panel (as text) | 8.3 | 5.9 |
| On-accent on accent | 8.8 | 5.9 |
| Track colours on panel 2 (lowest) | 5.5 (video) | 4.6 (text) |
| Control outline on panel / raised | 4.4 / 3.6 | 4.4 / 3.6 |
| Text on monitor | 18.4 | 18.4 |

## 3. Typography

The suite's fonts, self-hosted and embedded by `build.py` (no network request).

| Role | Font | Where |
|---|---|---|
| Headings, brand | **Space Grotesk** 600–700 | Brand, panel titles, dialog titles |
| Everything else | **Atkinson Hyperlegible Next** 400 / 700 | Labels, buttons, inputs, captions, **all numbers** |

- Numbers (timecodes, ruler, slider values, durations) are Atkinson Hyperlegible Next with `font-variant-numeric: tabular-nums`, so 1/l/I and 0/O never blur and digits don't jitter while playing. No monospace for numbers.
- **Minimum size 13px** anywhere, 14px for anything you read as a sentence. This editor is denser than the suite's landing pages, so 13px is the one deviation from the suite's 14px rule, and only for single-word or numeric labels (ruler ticks, track mute, chip captions).
- Never a weight below 400.

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 13px | Ruler ticks, chips, tile captions, badges |
| `--fs-sm` | 14px | Body, buttons, inputs, Inspector labels, footer |
| `--fs-md` | 15px | Clip names in the Inspector, transport timecode |
| `--fs-lg` | 17px | Panel titles |
| `--fs-xl` | 20px | Dialog titles, brand |

Panel and section titles: Space Grotesk 600, tracking −0.01em. Section labels inside panels: sentence case, 14px, 700, `--muted` (no uppercase tracking).

## 4. Spacing, shape and layout

- **Spacing (4pt, dense):** 4 · 8 · 12 · 16 · 24 · 32 px (`--s-1` … `--s-6`).
- **Radius by hierarchy:** `--r-sm` 6 (inputs, buttons, clips, chips) · `--r-md` 10 (panels' inner cards, tiles) · `--r-lg` 14 (dialogs, menus).
- **Elevation:** panels are flat (borders, no shadow). Only floating layers (dialogs, menus, popovers) get one shadow token `--shadow-pop`.
- **Workspace layout (≥1101px):** header 56px · three-column workspace (Media 264px · Preview fluid · Inspector 300px) · timeline. 
- **Tablet (731–1100px):** Media and Inspector narrow (220/260px).
- **Phone (≤730px):** single column in edit order: header (brand + Export, other actions in a scrolling action row) · Preview · Timeline · Inspector · Media. No horizontal page scroll at 375–390px; only the timeline lanes scroll sideways, inside their own box.

## 5. Components

- **Buttons:** 32px tall on desktop (36px with coarse pointers, 44px for the main transport and the primary button on phones), `--raised` fill, 1px `--line`, `--r-sm`, 14px 700. Hover: lighter fill. Pressed: `aria-pressed="true"` toggles (Snap, magnet, Range) get an accent-tinted fill and accent outline, plus a check-style text state, so state is never colour alone. Disabled: 45% opacity, `cursor: not-allowed`.
- **Primary:** Export only. `--accent` fill, `--on-accent` text.
- **Icons:** one inline SVG set (Lucide-style 1.75px stroke, 16px) for transport, undo/redo, split, import, drive, export, chevrons. Decorative next to text (`aria-hidden`); icon-only buttons carry `aria-label`. Sticker artwork stays emoji: it is content, not UI.
- **Inputs:** 32px, `--panel-2`, 1px `--line-ctl`, 14px text (16px on phones so iOS doesn't zoom). Number fields right-aligned, tabular.
- **Sliders:** 4px track in `--raised`, filled part in `--accent`, 14px thumb.
- **Panels:** `--panel`, separated by 1px `--line`; title row 44px.
- **Clips:** track-tinted, 3px top edge in track colour, `--r-sm`, name chip in `--ink` on a 70% panel scrim. Selected: 2px `--accent` outline + inner 1px `--bg` line.
- **Dialogs:** `--panel`, `--r-lg`, `--shadow-pop`, 24px padding, title in Space Grotesk 20px, scrim `rgb(5 7 12 / .6)`; primary action on the right.

## 6. Motion

Subtle tier (skill motion dial 3): 120–160ms colour and opacity transitions on hover, focus and press; dialogs fade/scale in 160ms. No looping or decorative animation in the chrome. `prefers-reduced-motion: reduce` removes all chrome transitions. Preview playback and effect previews are content and are not affected.

## 7. Anti-patterns for a video editor

- Pure `#000` chrome with full-white text; neon glow; gradient washes.
- Accent colour used decoratively (it means "selected" or "the main action").
- Text under 13px, light weights, or monospace timecodes that confuse 0/O.
- Colour as the only signal (toggle state, track type, errors).
- Emoji or unicode glyphs as UI icons.
- A white preview surround in light mode; the monitor stays dark.
- Exported video using any UI colour.
- Horizontal page scroll on phones; hover-only controls.

## 8. Pre-delivery checklist

- [ ] Tokens only, no raw hex in component rules
- [ ] Contrast checked in both themes
- [ ] Visible focus ring on every control; icon-only buttons labelled
- [ ] 390px and 1440px: no horizontal page scroll, nothing clipped
- [ ] Reduced motion: chrome transitions off
- [ ] Numbers render in Atkinson Hyperlegible Next with tabular figures; nothing below 13px

## Provenance

| Decision | Source (ui-ux-pro-max bundled search, 2026-11-26) | Status |
|---|---|---|
| `--design-system` "video editor creative tool professional dark timeline", density 8, variance 4, motion 3 | Hero-Centric pattern, Dark Mode (OLED), Short Video Editor colours, Inter | Style and colour structure used; hero pattern rejected (this is an app, not a landing page); Inter replaced by the suite fonts |
| `--domain color` "video editing creative studio" | Short Video Editor (`#0F172A`, `#192134`, `#94A3B8`, pink `#EC4899`) | Structure used; pink moved to the Overlay track; accent is the suite's `--fc` |
| `--domain style` "pro tool dense interface" | Adobe Spectrum (creative tools: dense but legible controls, strong focus) | Used for density and focus rules |
| `--domain typography` "timecode tabular numbers readable" | Corporate Trust (Lexend + Source Sans 3, readability) | Rejected in favour of the suite's Atkinson Hyperlegible Next, chosen for the same reason |
| Accessibility, touch, motion, layout | Quick Reference sections 1–7 | Applied throughout and in section 8 |
