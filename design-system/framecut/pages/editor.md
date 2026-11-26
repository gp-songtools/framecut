# Editor: design plan (overrides MASTER where it differs)

Written with the frontend-design skill on top of `../MASTER.md`. The editor is Framecut's only page; its header menus, dialogs (Export, Place clips, Open from Drive, Import lyrics), popovers (animation menu, cut menu) and the Song spec panel are parts of it and follow this plan.

## Brief, restated

- **Subject:** a music-video editing suite in one offline browser file.
- **Audience:** songwriters and producers of the GP Song Tools suite; laptop first, phone for checking.
- **Primary job:** cut picture to a song: place clips on tracks, line them up with the audio and lyrics, add effects and text, export.
- **The request:** look professional. Readable numbers and small text. Fully responsive. Populated with realistic sample data.

## Tokens (compact)

| Name | Dark | Use |
|---|---|---|
| Slate night | `#0B1120` | App background |
| Bench | `#111827` | Panels |
| Lane | `#172033` | Timeline lanes, fields |
| Sky (`--fc`) | `#38BDF8` | Selection, playhead, Export |
| Paper | `#F1F5F9` | Text |
| Track hues | indigo `#818CF8` · teal `#2DD4BF` · amber `#FBBF24` · pink `#F472B6` · violet `#C084FC` | Video · Audio · Text · Overlay · Effects |

Type: Space Grotesk for the brand and panel/dialog titles; Atkinson Hyperlegible Next for everything else, tabular figures for every number.

## Layout concept

The workspace reads like a desk: source on the left, the picture in the middle, details on the right, and time running underneath. The timeline is the largest region, because it's where the work happens. Everything is left-aligned; numbers are right-aligned in their fields.

Desktop (1440):
```
┌ Framecut ▢ │ Above the Clouds ✎ │            New  Open  Save  Drive ▾ │ [Export] ┐
├─ Media ────────┬──────────── Preview (dark monitor) ──────────┬─ Inspector ───────┤
│ Import  │ bin  │                                              │ Clip name         │
│ thumbs grid    │              16:9 picture                    │ Timing            │
│ Song spec ▸    │                                              │ Transform …       │
│ Stickers …     │  ⏮  ▶  ⏭        00:12.40 / 00:48.00         │ (scrolls)         │
├────────────────┴──────────────────────────────────────────────┴───────────────────┤
│ ↶ ↷ │ Split  Delete  Ripple │ ☑Snap ☑Magnet │ +Text  Lyrics │ Range Loop │ Zoom ─● │
│ ruler  00:00   00:02   00:04 …                                                    │
│ ▌Text     [Above the Clouds]   [lyric] [lyric]                                    │
│ ▌Overlay        [★ sticker]                                                       │
│ ▌Effects   [Glow ─────────]                                                       │
│ ▌Video   [Dolomites][Dolomites zoom][…]                                           │
│ ▌Audio   [≋≋≋≋ waveform ≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋]                                       │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Space play  S split  ⌘Z undo                     Privacy & credits  More  Source  │
```

Phone (390): one column in editing order. Header holds brand + Export; New/Open/Save/Drive sit in a horizontally scrollable action row (its own box, not the page). Preview full width with transport. Then the timeline (toolbar wraps to two rows; lanes scroll sideways inside their box). Then Inspector, then Media. 44px targets for transport and Export.

Considered and dropped: a left icon rail with switchable panels (common NLE trope, but it hides Media's many sections behind a click and adds a navigation layer this one-page tool doesn't need).

## The one memorable thing

**The timecode.** The transport readout is set large (22px) in Atkinson Hyperlegible Next tabular figures, current time in Paper and total in muted, like the counter on a deck. It's the number people watch most, and it's where the "highly readable numbers" request is most visible. Everything around it stays quiet.

Second, quieter: the track-colour system (MASTER §2) ties each lane header, clip and Inspector section together.

## Principles

1. Quiet chrome, loud picture: the monitor is the darkest, calmest area; the UI never competes with the footage.
2. Colour means something: sky = selected/primary, track hue = track type, red = error. Nothing decorative.
3. Every number is legible: Atkinson, tabular, 13px minimum, right-aligned in fields.
4. State is never colour alone: pressed toggles show a check mark and a filled style; disabled shows reduced opacity and a not-allowed cursor.
5. Labels say what happens, in sentence case ("Import media", "Export video", "Place clips…").

## Review against the brief (and against generic defaults)

| Draft choice | Problem | Revision |
|---|---|---|
| Uppercase tracked section labels ("TIMING", "TRANSFORM") | A generic template tell; harder to read at small sizes | Sentence-case 14px 700 labels in `--muted` |
| Footer hint "Space to play · S to split · …" | Middle-dot meta string; low scannability | `<kbd>` keycaps with plain words: `Space` Play `S` Split |
| Monospace timecodes (current build) | Generic data-label default, 0/O confusion | Atkinson tabular figures |
| Single near-black + one bright accent | Default trait #2 | Kept dark-first (the suite and the footage demand it) but the background is a blue slate with three surface layers, and the identity is carried by the five track hues, not one accent |
| Identical rounded cards for every Media section | SaaS-card kit | Sections are separated by hairlines inside one panel; only thumbnails and tiles have radius |
| Unicode glyph icons (✂ ↶ ▶) | Inconsistent rendering across fonts | One inline SVG icon set |

Checked against the brief: professional (NLE layout, restrained colour, consistent icons), readable numbers (Atkinson tabular, 13px floor), responsive (three layouts, no page scroll at 390), populated (sample project below).

## Sample data

The built-in demo project ("Above the Clouds") is extended so every track and panel shows real content on first load:
- Video: three clips cut from the Dolomites still (wide, slow push-in, warm grade), with a cross-dissolve.
- Audio: "Above the Clouds (demo mix)", a 48-second synthesized song generated in the browser, so the waveform and visualizer have real material.
- Text: the opening title plus timed lyric lines.
- Overlay: one sticker. Effects: one spanning effect clip.
- Test-only: screenshot scripts seed the shared song spec store with the suite's example spec, so the Song spec panel shows populated rows without the app writing to anyone's real spec.
