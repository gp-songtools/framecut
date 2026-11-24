# Framecut handoff: Claude session, 2026-11-23

## Phase 2 plan: GP Song Tools Drive folder and placing clips (decided 2026-11-23; steps 1–5 done)

The owner answered all questions on 2026-11-23. Wait for the owner to start it.

**Phase 1 (done):** the "Save Timed Lyrics to Song Spec" button in the lyrics dialog writes the Timed lyrics section, and "Use Song Spec Lyrics" fills the lyrics box from the spec's Lyrics section. `src/songspec.js` is the v1.1.0 copy of the GP Song Tools library, and `tests/song-spec.test.js` covers it. GP Producer writes Video sequence and reads Timed lyrics.

**Standard Google Drive folder for every GP Song Tools app, one per song:**

```
My Drive/
  GP Song Tools/
    <Song title>/
      <song>.songspec.md   the song spec (cross-device copy)
      lyrics/              Lyricpad (.txt), LRC exports
      audio/               masters (GP Mastering), generated clips (Randomash), stems
      images/              GP Producer anchors and keyframes, cover art
      clips/               GP Producer video clips, named by file tag (01_Intro_00-12.mp4)
      exports/             finished videos (Framecut, AuraLyrics Studio)
      projects/            app project files (.framecut, GP Producer .zip)
```

**Rules**
- The folder is named from the spec `title`, with characters Drive can't take removed. Untitled songs ask for a title first.
- New spec setting `drive_folder` = the folder's Drive ID (survives renames). Any tool may fill it, only while empty. This is Song Spec 1.2.0, additive, schema 1.
- The `.songspec.md` in the folder is the cross-device copy. The shared Song spec panel gets **Save to Drive** and **Open from Drive**. The browser copy stays the working copy.
- Each tool writes only its own subfolders. All tools may read all.
- One Google client for every tool: reuse Lyricpad's Google Cloud project (client ID in lyricpad `js/config.js`, starts `514325867394-`), scope `drive.file` only (non-sensitive).
- New shared library `songdrive.js` in toolsmenu next to `songspec.js`, with byte-identical copies in the tools, checked by `check-copies.js`. It covers sign-in (Google Identity Services token client, loaded on click only), find/create the song folder and subfolders, resumable upload for video, list, download, and Save/Open the spec.

**Google setup (done by the owner, 2026-11-23):** consent screen renamed "GP Song Tools" (no verification needed), Drive API enabled, app in Production, authorized origin `https://gp-songtools.github.io` covers every tool. A Google Picker API key is needed only if a tool must open files our apps didn't create. If that happens, ask the owner through the secure credential form, never in chat.

**Work order (one PR each)**
1. **Done 2026-11-23** (toolsmenu #26 merged; song spec 1.2.0 copied to the seven tools in one PR each, all merged): toolsmenu: folder standard in `SPEC.md` (a draft is in section 8), `drive_folder` setting (Song Spec 1.2.0), `songdrive.js`, panel Save to Drive / Open from Drive; tests with a mocked Drive API; copy the libraries to all tools.
2. **Done (local files), merged:** Framecut: **Place clips...** on the Video sequence row of the From the song spec box, from local files first.
   - Match files to Video sequence lines by exact name, then by the `NN_` scene number. List unmatched files for confirmation.
   - Song time 0 = the selected full-song audio clip (`timeline = audio.at + (t - audio.start)`), else timeline 0.
   - Checkbox **Keep the full clips** (off by default: trim each clip to its scene length from its name or the next line).
   - Checkbox **Replace existing clips** (off by default: when on, a scene that already has a clip gets the new one; scenes without a clip get theirs added in both cases).
   - List missing clips. One undo step. Respect the magnet.
3. **Done, merged (GP Producer):** **Add clip files...** (match to scenes by file tag; tick Downloaded and File tag applied), **Save clips to Drive** into `clips/` (anchors and keyframes into `images/`), project .zip into `projects/`. The CSP must allow Google sign-in and Drive hosts.
4. Framecut: Google Drive as a second source for Place clips (reads `clips/`); **Save export to Drive** into `exports/`; project files into `projects/`.
   - **Done 2026-11-23, merged:** `src/songdrive.js` (bundled copy) and `src/framecut-drive.js`: **Place clips from Drive...**, **Save to Google Drive too** in the export dialog, header **Drive** menu (save/open project, save last export). Checked in a browser with a mocked Drive; real Drive not tried here.
5. **Done 2026-11-24** (toolsmenu About hand-off now describes the shipped flow, Privacy lists Framecut's Drive requests, SPEC.md and the GP Producer docs updated). Docs: About hand-off from "coming next" to shipped; Privacy Google Drive entries for each tool; User Guides.
6. Last: Lyricpad migration from its flat `Lyricpad/` Drive folder to each song's `lyrics/`, offering a one-time move of existing songs.
7. Later: GP Mastering (`gp-songtools/gp-master`) adopts the song spec (it has no copy of `songspec.js` yet, and `check-copies.js` does not list it), then saves masters into each song's `audio/` folder with `songdrive.js`. Randomash is in the same position for its generated clips.

**Testing:** Drive is mocked in browser tests, because the build sandbox can't sign in to Google. Real Drive confirmed by the owner on 2026-11-23 in Earprint (Drive turned on there first): sign-in, Save to Drive (resumable upload) and Open from Drive all work.

## Earlier work (2026-11-23)

Repo: `gp-songtools/framecut`. All of this work is merged and deployed to GitHub Pages (see `git log` for the current head). No Claude PRs are open and there are no uncommitted changes.

Read `CLAUDE.md` on `origin/main` first. Since #16, it requires the subagent workflow for every task:
1. `haiku-helper` explores, searches, and checks git state.
2. `sonnet-worker` implements, tests, and builds.
3. The primary session plans, reviews, pushes, and opens PRs against `main`. The user merges them.

## Shipped this session

| PR | Branch | What |
|---|---|---|
| [#10](https://github.com/gp-songtools/framecut/pull/10) | `claude/fix-lyric-onset` | Repairs stretched opening lyric words, adds a clip-wide level onset, and sets `force_full_sequences: false` in `whisper-worker.js`, so in-browser Whisper no longer throws on cuts that end mid-word |
| [#12](https://github.com/gp-songtools/framecut/pull/12) | `claude/fix-lyric-onset-2` | Treats the opening words that start at 0 s as one run (up to 12 words). Handles stretched words before a pause, an unfinished phrase before a gap, and a whole line squeezed in at 0 s (using the phrase end) |
| [#13](https://github.com/gp-songtools/framecut/pull/13) | `claude/fix-lyric-onset-3` | `lyricLevelEnvelope()` and `lyricOnsetBefore()`: a local onset search back from the end of the stretched run, so earlier sound in the intro can't trip it |
| [#11](https://github.com/gp-songtools/framecut/pull/11) | `claude/audio-visualizers` | 13 AuraLyrics visualizer presets on audio clips (`src/audio-visualizers.js`) |
| [#14](https://github.com/gp-songtools/framecut/pull/14) | `claude/visualizer-resize` | Preview handles to move and resize the visualizer. Width and Height replace Size |
| [#15](https://github.com/gp-songtools/framecut/pull/15) | `claude/visualizer-corner-fix` | Fixes left/top corner resizing collapsing the box. Corner hit test picks the nearest handle |
| [#16](https://github.com/gp-songtools/framecut/pull/16) | `claude/claude-md-delegation` | CLAUDE.md line making the subagent workflow required |
| [#17](https://github.com/gp-songtools/framecut/pull/17) | `claude/apply-text-style` | **Apply style to all text** button for text clips |

## Lyric first-line timing: shelved by the user

- **Reference:** `Split Up_vocals_master.mp3`. It stays on the user's machine and out of Git. Its first vocal starts at 7.20 s, per the user's correct LRC.
- **Groq's raw response:** `This` 0–5.02, `October.` 5.02–7.48, `One` 10.92. Segment 0 runs 0–7.
- **History:**
  - Deployed after #10: `00:00.025`.
  - After #12: 6.28 s with alignment on, 6.2 s with it off (user-reported).
- **#13:** on a synthetic stand-in for the song (real Groq JSON mocked, loud intro hit at 0.3 s), it gives 7.27 s. It's merged, but the user hasn't confirmed it on the real recording.
- **Next step if resumed:** rerun Groq on the real file with alignment on and off, on the full clip and a trimmed clip. To capture the raw response, run this curl (PowerShell, from the folder with the mp3):
  `curl.exe https://api.groq.com/openai/v1/audio/transcriptions -H "Authorization: Bearer $env:GROQ_API_KEY" -F "file=@Split Up_vocals_master.mp3" -F model=whisper-large-v3 -F response_format=verbose_json -F "timestamp_granularities[]=word" -F "timestamp_granularities[]=segment" -F temperature=0 -o groq.json`
- **Key code:** `src/lyrics-timing.js` (`normalizeLyricWords`, `repairOpeningLyricWords`, `detectLyricOnset`, `lyricLevelEnvelope`, `lyricOnsetBefore`). In `src/lyrics.js`, `runLyricTranscription` builds `clipAudio = { onset, envelope }` before the samples are transferred to the worker.
- **Tests:** `node --test tests/lyrics-timing.test.js` passes 14/14.

## Audio visualizers

- **Settings:** `clip.visualizer` on audio clips (including extracted audio): `preset, palette, reactsTo, reactivity, glow, opacity, width, height, x, y, backdrop`.
  - Older projects may store a uniform `size`. `visualizerSize()` reads it, and `upgradeVisualizerSettings()` converts it when the visualizer is edited.
  - `validVisualizerSettings()` in `project-files.js` rejects settings that mix `size` with width/height.
- **Rendering:** each frame is a pure function of source time.
  - Audio is decoded per asset at 32 kHz.
  - 2048-point FFT frames are cached at 60 per second.
  - Smoothing, the beat engine and per-preset state are replayed over the preceding 2 s.
  - Visualizers draw after overlays and before text, in `renderFrame()`.
- **Preview handles:** `overlays.js` hooks for `track === 'audio'`.
  - Code: `visualizerBounds()` and `dragVisualizerBox()` in `audio-visualizers.js`.
  - An unselected visualizer is only hit where no video or image is under the pointer.
- **Possible follow-ups:**
  - Edge (side) handles; there are only corner handles now.
  - Several visualizers per clip; the user said this isn't needed.
- **Testing done (headless Chromium):**
  - All 13 presets render.
  - Scrubbing gives the same frame.
  - Trims, split, undo and Save/Open work.
  - Extracted audio drives the visualizer.
  - The MP4 export plays.
  - All four corners resize in both directions.
- **Not tested:** desktop Chrome on Windows.

## Apply style to all text

- **Code:** `applyTitleStyleToAll()` and `titleStyleCopyFields` in `src/editor.js`. The Inspector button is `#applyTextStyle`, shown only when another title clip exists.
- **Copied:** size, font, colour, B/I/U/S, `textAppearance`, `overlayMotion`, `textIn/Out/Loop` with durations, and `presetOptions`.
  - Transform: explicit `overlayX/Y/Size/Rotation/Opacity` values from `overlayTransformAt`, or `overlayKeys` shifted by `target.start - source.start`.
- **Not copied:** id, track, text, at, start, end.
- **Undo:** the whole apply is one step.
- **Not tested:** the static fallback when no shifted keyframe fits a target.
- The user confirmed it works after deploy.

## Environment notes for the next session

- **Builds:** this was a Linux cloud container, so builds used `python3 build.py` rather than `py build.py`.
- **Tests:** browser tests used Playwright with the preinstalled Chromium. Test audio was synthetic (espeak-ng plus numpy) and stayed in the session scratchpad.
- **Worktrees:** local ones are all clean and merged, so they're safe to delete: `framecut-docs`, `framecut-onset`, `framecut-onset2`, `framecut-textstyle`, `framecut-viz`.
- **Branches:** `claude/vibrant-dijkstra-u14lkc`, the session's assigned branch, was never used. Remote `claude/*` branches for merged PRs can be deleted.
- **Codex:** I didn't touch any `codex/*` branches.
  - `codex/detect-vocal-onset` had an uncommitted `force_full_sequences: false` change in `src/whisper-worker.js`. The same change shipped in #10, so Codex can drop it.
  - That worktree's `.onset-diagnostic/` holds private audio and must stay out of commits.
