# Framecut

## Project summary

- Framecut is a browser-based video editor built with vanilla JavaScript, Canvas 2D, Web Audio, WebAssembly, and MediaRecorder. `build.py` bundles `src/` into a standalone `index.html` for offline use and GitHub Pages.

## Commands

- Run commands from the directory containing `build.py`. The current Windows checkout is `C:\Users\pcare\Framecut\Framecut`.
- Build on Windows with `py build.py`. Use `python build.py` on the GitHub Actions Ubuntu runner with Python 3.12. The build uses only Python’s standard library.
- If the sandboxed Windows launcher reports `No installed Python found!`, run `py` with approved host access to the installed Python.
- Open the generated page in Chrome with `& 'C:\Program Files\Google\Chrome\Application\chrome.exe' (Resolve-Path .\index.html).Path` in PowerShell.
- For a served check, run `py -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/` in Chrome.
- Syntax-check changed JavaScript with `node --check src/editor.js`, substituting each changed file. There is no checked-in lint or test runner.
  Run `node --test tests/lyrics-timing.test.js` for lyric alignment regressions.
- Test the edited flow in desktop Chrome using generated media. For rendering changes, check preview and an actual export. Inspect the streams with `ffprobe -v error -show_entries stream=codec_type,codec_name -of compact output.webm`.
- On an authorized release, run `git push origin main`. Confirm `origin` is `https://github.com/gp-songtools/framecut.git` first.
- Dispatch the existing workflow with `gh workflow run pages.yml --repo gp-songtools/framecut --ref main` when an authorized redeploy is needed.
- Find the run with `gh run list --repo gp-songtools/framecut --workflow pages.yml --limit 1`. Monitor it with `gh run watch <run-id> --repo gp-songtools/framecut --interval 8 --exit-status`.
- Smoke-test the deployed change at `https://gp-songtools.github.io/framecut/` after the build and deploy jobs succeed.

## Architecture and key files

- Edit `src/index.html` for markup and CSS. `build.py` concatenates the shared-scope JS files in a fixed order and embeds vendor assets, models, and fonts.
- Keep `assets` and `clips` distinct in `src/editor.js`. Assets hold media elements and blob URLs. Clips reference an asset ID and store editable timeline settings.
- Use `clip.at` for timeline position and `clip.start` / `clip.end` for source in/out in seconds. Convert with `clip.start + position - clip.at`.
- Use `snapshot()` / `remember()` for undoable edits. History clones clips and stores aspect ratio and track mix. Assets stay available across undo/redo.
- Use `refresh()` when an edit needs to update timeline, Inspector, and preview. Use `renderFrame()` as the shared compositing path for preview and export.
- Keep cut transitions separate from clip animations. Cut transitions belong to adjacent visual clips. `animation-panel.js` handles presets, previews, drag/drop, timeline spans, and clipboard actions.
- Keep text In, Out, and Loop in `text-animations.js` and `text-atmosphere.js`. Video and image clips use In, Out, and Combo.
- Reuse `overlays.js` for layer transforms and `preset-controls.js` for per-preset settings. Keep draggable timeline diamonds and Inspector lists in sync with source-time keyframes.
- Route clip effects and spanning effect-track clips through `effects.js`. Keep Video, Body, and Photo branches distinct. Generative Photo effects are deferred.
- Use `person-model.js` and `subject-tracking.js` for masks and subject lock. Use `body-detail-tracking.js` for MediaPipe face/hand landmarks and `body-compositing.js` for occlusion, outlines, and trails.
- Keep waveform analysis in `audio-waveforms.js`. Cache peaks by source asset. Use bundled Mediabunny for timestamp-aware video audio and Web Audio decoding for standalone audio and fallback.
- Use `extracted-audio.js` for independent audio playback and lanes. Extracted clips have `track: 'audio'` and a unique `audioTrack` lane ID.
- Use `timelineTrack(clip)` for operations scoped to a specific lane. `track-mixer.js` combines clip volume/keyframes, the track mixer, and `audio-fades.js` gain.
- Use `timeline-range.js` for timeline range selection and preview looping.
- Use `audio-visualizers.js` for audio clip visualizers ported from AuraLyrics. `clip.visualizer` holds the settings. Each frame is a function of source time: stateful analysis is replayed over the preceding two seconds, so preview, scrubbing and export match.
- Use `song-spec.js` for read-only Song Spec input. Keep `src/songspec.js` byte-identical to the GP Song Tools canonical copy. Use timed LRC for lyric clips.
- Use `lyrics-timing.js` for word alignment and attach timings in source time. Use `lyric-transcription.js` for audio from the selected trim and transcription providers.
- Use `project-files.js` for offline project files. Save a versioned JSON manifest plus original media bytes in one `.framecut` file. Stage restored media before replacing the active project.
- Export in `renderExport()` through canvas capture and the Web Audio mix with MediaRecorder. The browser creates the output download from a blob.
- Deploy via `.github/workflows/pages.yml`. Actions rebuilds from committed source and publishes only `_site/index.html`.

## Decisions and constraints

- Keep the one-file offline build. Bundle dependencies, fonts, and models locally. Cloud Whisper and the browser speech service are optional, user-initiated requests.
- Make editor changes in `src/`. Root `index.html` and `_site/` are generated and ignored by Git.
- Treat `main` as a deployment branch. Preserve the existing repository files and history. Push only when the user authorizes it.
- Keep imported media, drafts, personal test files, and credentials out of Git and the Pages artifact. The deployed app and repository are public.
- Save changes explicitly with Save Project and resume with Open Project. Project files include media and settings. Undo history starts fresh on open.
- Keep snapping toggleable and independent of the main-track magnet. Dragging and trimming snap to nearby clip edges and the playhead with a guide.
- With the magnet on, keep the visual track contiguous on move, trim, and Delete. Insert new visual clips at the boundary nearest the playhead.
- With the magnet off, append new visual clips and preserve gaps on regular Delete. Keep Ripple Delete scoped to the selected lane.
- Reuse the Inspector’s paired slider and exact-value controls with their history handling.
- Keep effect intensity, layer transforms, and volume independently keyframeable. Retain easing and curve editing for intensity and transforms.
- Give each extraction its own lane and media element. Copy source timing, mix settings, volume keys, and fades. Silence the video’s embedded audio after extraction.
- Keep duration controls and handles for regular audio, extracted audio, and video with readable embedded audio. Apply fades on top of existing volume automation and mute.
- Keep background removal and replacement on-device. Preserve feather, expand/shrink, and smoothing in preview and transparent export. Keep mask preview as a preview aid.
- For CapCut comparisons, use verified read-only inspection evidence and label inference. Skip User Data, drafts, and personal media.

## Known gotchas

- A Pages project lives under `/framecut/`. Keep it working from that subpath, `file://`, and normal static hosting.
- Use Git and Actions to deploy the large single-file build. Keep the generated copy out of commit history.
- The person model uses single-threaded WASM with CPU fallback. Face and hand models load from bundled blobs. The current build works without cross-origin isolation.
- MediaRecorder codec support varies by browser. Keep the supported-format checks, retain the transparent VP8 WebM path, and use Chrome as the verified baseline.
- Export records in real time. Keep the tab open during export. Check actual encoded alpha over a contrasting background when changing the mask pipeline.
- `decodeAudioData()` can shift audio that starts late relative to video. Use the timestamp-aware reader for embedded waveforms where available.
- Waveforms reflect original source audio. Trim, move, split, zoom, and scroll should change the mapping or viewport while mix level leaves the waveform shape alone.
- Fade lengths are in seconds, share the clip duration, and clamp when trimmed. Splitting keeps the fades at the outside edges.
- Keep genuinely silent videos free of fade controls. Hide embedded audio controls after extraction. Keep video fade handles clear of cut controls and keyframe diamonds.
- Validate both pupil origins and gaze through head turns. Match palms to the locked subject and handle hand occlusion. Keep wings behind the shoulders and trails consistent across playback, scrubbing, and export.

- # Multi-Agent Delegation Rules
When acting as the primary session (Opus), operate as a **Tech Lead and Architect**. Conserve primary context and rate limits by delegating execution work to specialized subagents whenever possible.
- **Required in every session:** Follow the Orchestration Workflow below for every task. Use `haiku-helper` for exploration, searches, and git status/log/diff checks, and `sonnet-worker` for implementation, tests, and builds. The primary session plans, reviews the changes, and handles pushes and PRs.
## Available Subagents
1. **`haiku-helper` (Fast Scout & Clerk)**
- **When to delegate:** File discovery, searching across the codebase (`Grep`/`Glob`), checking git status or commit logs, reading configuration files, and summarizing documentation.
- **Constraint:** Read-only tasks. Do not ask `haiku-helper` to write or edit code.
2. **`sonnet-worker` (Builder & Tester)**
- **When to delegate:** Implementing features from a finalized specification, writing unit or integration tests, refactoring isolated modules, fixing localized bugs, and running test/build suites.
- **Constraint:** Always provide clear requirements, target file paths, and expected behavior when invoking `sonnet-worker`.
## Orchestration Workflow
1. **Explore First:** Before planning changes, dispatch `haiku-helper` to locate relevant files and summarize existing patterns.
2. **Design & Plan:** Synthesize the findings in the main session and outline the architectural plan or edge cases.
3. **Delegate Implementation:** Hand off well-scoped coding, refactoring, and test-writing tasks to `sonnet-worker`. You may launch multiple `sonnet-worker` instances in parallel for independent modules.
4. **Review & Verify:** Inspect the changes made by `sonnet-worker` (or have `haiku-helper` summarize `git diff`) to ensure architectural alignment before concluding the task.

