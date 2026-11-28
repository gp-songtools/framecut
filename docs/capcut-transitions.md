# How CapCut desktop renders transitions

Static analysis of the installed Windows app, CapCut **9.7.1.4203**, done on 2026-11-28. It covers how a transition is timed, how its two inputs are fed, and what could not be determined.

## Short answers

| Question | Answer | Confidence |
| --- | --- | --- |
| Overlap or frozen end frames? | Overlap transitions extend each clip by half the transition duration across the cut. CapCut falls back to duplicated frames when there is not enough media past the trim edge. | Extension arithmetic and UI messages verified. Decoding of the extra source frames inferred. |
| Progress and easing? | `progress = clamp((t - start) / (end - start), 0, 1)`. The engine applies no easing before handing it to the effect. | Verified. Easing inside an effect package is unknown. |
| First and last frame? | The active window is half-open, `start <= t < end`. The first frame gets 0. The last frame inside the window gets less than 1. | Window test verified. Per-frame values inferred. |
| How does a dissolve blend? | **Not determined.** No dissolve shader was found in the program folder. | Gamma-space blending is a low-confidence inference. |
| Sync while seeking and decoding? | One pipeline time drives a list of clips. The transition requires both inputs to be valid at that time. A decoded frame is checked against the requested time with a 999-unit tolerance. | Checks verified. How the pipeline waits for both decoders is unknown. |

## Scope, method and labels

Inspected read-only: `%LOCALAPPDATA%\CapCut\Apps\9.7.1.4203\` (program folder only). User Data, drafts, caches and media were not opened. CapCut was not run.

| File | Role | SHA-256 |
| --- | --- | --- |
| `videoeditor.dll` | Draft and timeline model (`lvve`, `lyra`) | `5b10d494602e1b31226bfe4e408788a07a0a2f7ba16a8dabc672277005218512` |
| `cccreator.dll` | Playback engine (`vesdk`, `TE*`) and effect engine (`AmazingEngine`) | `bc706ec9adafe474bd0d3a105470ab8e0b7386beb0dd301842a6fe4a69299897` |
| `VECreator.dll` | Desktop UI | `492f40554f2405dc91867953d7fe51bf546d8dfa4d1417aeb22d34e3166827d8` |
| `Resources\po\en.po` | English UI text | `36e60ace2f9dd8288900a86b2d0024c818b2e1ddd0c34b56e81d8ecf43af5f89` |

Tools:

- REA `inspect_native_exports` for file identity and export inventories (`cccreator.dll`: 7,410 exports, evidence `ev_891b44f1…`; `videoeditor.dll`: evidence `ev_e46be475…`). REA evidence lives in the session that produced it.
- Disassembly with Python `capstone` and `pefile`, and string searches with `ripgrep`. REA's decompiler (Ghidra) was not run on these DLLs, which are 73 to 281 MB.

Addresses below are RVAs. "String" means text read from the file.

- **Verified**: read directly in the shipped code, data or text. This is static evidence, not observed behaviour.
- **Inferred**: a conclusion drawn from verified facts.
- **Unknown**: the evidence does not settle it.

Many small accessors in these DLLs share one address (identical code folding), so a disassembler can label them with unrelated names. Field accessors cited here were identified from the full alias list at each address.

## 1. Overlap and handles

### Verified

- Each transition in the draft model has a `duration` and an `is_overlap` flag. A schema string in `videoeditor.dll` maps `is_overlap` to the effect resource's `common_attr.is_overlap`, so it is a property of the chosen transition.
- The transition is attached to the outgoing (left) video segment. `addVideoTransition` (`videoeditor.dll` `0x2909700`) rejects the last segment ("Can't apply transition effects to the last video segment").
- The same function rejects a duration longer than half the segment's duration ("The video is too short to apply the transition effect"). One flag skips this check, probably the AI-transition flag (inferred).
- Segment positions on the timeline stay back to back. `DraftUpdate::adjust_track_target_start_time` (`0x10b7360`) lays out starts from segment durations and does not subtract the transition duration.
- A draft repair task (`0x1f4ac40`) reports "transition segment time conflict" when the right segment starts later than the left segment ends, compared in frames.
- A helper at `videoeditor.dll` `0x28bc2a0` computes a segment's effective duration as:

  ```
  duration
    + previous segment's transition duration / 2   (only if it is an overlap transition)
    + this segment's transition duration / 2       (only if it is an overlap transition)
  ```

  Its callers are the video animation and speed-change code.
- A re-validation routine (`0x28ba3e0`) removes a transition when the clip duration it is given is under 200,000 (microseconds), and shortens a transition that is too long relative to half that duration, aligned to frames.
- UI text in `en.po`, keys `not_enough_length_outside_edge_duplicate_frames` and `length_guranteed_by_repeat_frames` (spelling as shipped): "Clips are too short for a transition. Create duplicate frames to add transition and maintain the original length of clips."
- `VECreator.dll` references the first key from the trim-left, trim-right and transition-trim handlers (`main_timeline_segment_video_view_model.cpp`, `main_timeline_segment_transition_view_model.cpp`).

### Inferred

- For an overlap transition of duration D at a cut, the window is `cut - D/2` to `cut + D/2`. The outgoing clip plays D/2 past its out point and the incoming clip starts D/2 before its in point, using source media outside the trim.
- Total timeline length does not change.
- When the source has too little media past the edge, CapCut repeats frames to fill the gap. Which frame repeats (probably the boundary frame) and whether only the missing part is filled are not verified.

### Unknown

- How a transition with `is_overlap = false` gets its two inputs. The half-duration extension above skips it.
- The exact engine call that moves each clip's source in and out points. The model builds a `vesdk` `VideoTransition` (path, duration, `is_overlap`, subtype, adjustment parameters; builder at `0x28b15a0`) and passes it to `NewVEWrapper::insertVideoTransition` (`0x16403b0`). I did not follow it into the engine's sequence code.

## 2. Progress, easing, first and last frame

All addresses in this section are in `cccreator.dll`.

### Verified

- `AmazingEngine::TransitionSegment::renderSegment` (`0x119c380`) computes:

  ```
  progress = clamp((t - segmentStart) / (segmentEnd - segmentStart), 0.0, 1.0)
  ```

- It then takes one of two paths, chosen by the setting `enable_transition_ii` (described in the DLL as a "new transition, which is not depend on EffectManager"):
  - On: writes `progress` as a double into the effect instance and sets a `transition_duration` parameter to `end - start`.
  - Off: calls `bef_effect_seek_transition` (`0x14f3390`) with `progress`.
- Neither path applies an easing curve between the division and the hand-off.
- `setTimeRange` (`0x119d270`) stores start and end. On the older path it also calls `bef_effect_set_transition_duration(end - start)`.
- The time-range test, `Segment::checkValidUs` (`0x11d9eb0`), accepts `start <= t < end`. A separate "force" argument bypasses the comparison with `t`.
- `TransitionSegment::checkValidUs` (`0x119aec0`) also requires both input segments to pass their own time test.

### Inferred

- With N frames in the window and frame-aligned times, progress runs 0, 1/N, … (N-1)/N. The first transition frame shows the outgoing clip with weight 1 (if the effect is a plain mix), and the first frame after the window is the incoming clip alone. A frame at exactly 1.0 is not rendered.
- Any ease-in or ease-out belongs to the individual transition package (its shader or script).

### Unknown

- Which `enable_transition_ii` value this installation uses.
- The easing used by any particular transition, including "Dissolve".

## 3. Blending, dissolves and fades

### Verified

- The engine binds the two clips to a transition as `#TransitionInput0` and `#TransitionInput1` (`updateSegment`, `0x119dc80`). The blend itself is done by the loaded transition resource.
- The draft stores a resource ID and a file path for each transition. Searching the program folder's file names and its readable shader and script files found no dissolve or crossfade transition shader. (The one `Dissolve` match is a layer blend-mode option in `LumiLayer.lua`.)
- Of the 260 `.rt` render-target files under `Resources`, 10 are readable text and all declare `RGBA8`. The other 250 are binary and were not decoded. None sits in a transition resource.
- Some shaders convert to linear light themselves, for example `Resources\areaLocked\AmazingFeature\effects\GaussianBlur\MatAndShader\GaussianBlur.frag` (`pow(x, 2.2)`, then `pow(x, 1/2.2)`). This is a blur, not a transition.
- `cccreator.dll` embeds HDR conversion shaders (HLG to SDR and PQ) that re-encode their output with a transfer curve.

### Inferred (low confidence)

- Transition shaders receive ordinary gamma-encoded 8-bit textures for SDR material, so a plain `mix(a, b, progress)` would blend encoded values, not linear light, unless the shader converts. For such a mix the weights sum to 1, so there is no dip in encoded values, while displayed light dips mid-way between very different colours. That last point is arithmetic, not an observation of CapCut.

### Unknown

- What CapCut's dissolve shader actually does: linear or gamma-correct, whether it dips, and its easing.
- How "fade to black" and "flash to white" transitions are built. They are presumably downloaded transition packages, and the download cache is under User Data, which was out of scope.

### Audio fades (related, separate from picture transitions)

- Verified: the engine has an `AudioFadeInOutProcessor` that takes fade-in and fade-out durations and a `curve_type`, and exports setters for fade-in and fade-out curves.
- Verified: the draft model flags audio and video segments that need an automatic crossfade (`need_crossfade_in`, `need_crossfade_out`).
- Verified: one audio reader path (`getOutputAudioFrameFromAVFrame`, `0x823260`) multiplies samples by `powf(148.413, x)`, that is e^(5x), with x ramping up from -1. This is an exponential rise from about -43 dB to unity.
- Unknown: whether that path serves the user-facing clip fades, which curve each `curve_type` selects, and the fade-out shape.

## 4. Keeping both clips in sync

All addresses are in `cccreator.dll`.

### Verified

- `TESequenceReaderUnit2::processInputStream` (`0x515ac0`) logs one `pipelineTime` together with a clip count (`clips=%zu`) and the frame's media and presentation timestamps. It creates or reuses decode task queues named `VE-readerQueue`.
- `getSeekVideoFrame` (`0xed3950`, log tag `VEdru3`) compares the returned frame with the request and logs "seek frame error" unless `pts - 999 <= request <= pts + frameDuration + 999`. It logs the mismatch; I saw no retry in this function.
- A transition is only valid when both input segments are valid at the same time (section 2).
- `bef_effect_seek_transition` compares each input texture's ID, width and height with the cached one and rebuilds its wrapper only when they differ.
- The effect engine has a `PREPARE_SEEK` mode (`0x1213760`, "seek fake frame next"). In it, video and transition segments skip their effect update.
- Strings show FFmpeg seeking with `AVSEEK_FLAG_BACKWARD`, a "seekInternal withoutFlush" path, a decoder frame cache (`TEDecoderFrameCachePool`) and a seek cache (`VECache Seek`).
- A separate "AITransition - Frame do not match the request time!" check exists for AI transitions.

### Inferred

- Both transition clips are entries in the clip list for a given `pipelineTime`, each mapped to its own source time and decoded on its own queue.
- A backward seek lands on a keyframe and decodes forward to the target. Small forward steps avoid a flush.
- `PREPARE_SEEK` is a preload pass that initialises resources before the real seek.
- The tolerance units are microseconds, so the slack is just under 1 ms.

### Unknown

- Whether the compositor blocks until both frames arrive, drops a late frame, or reuses the previous one during playback.
- Whether the two inputs have separate decoder instances when both clips come from the same source file.
- Whether export uses stricter waiting than preview.

## How to settle the open questions

A runtime test with generated media would answer the blend and easing questions without reading any resource files. It needs someone to run CapCut, which creates a draft in User Data, so it was not part of this inspection.

1. Make two clips with spare media on both sides: solid colours (for example pure red and pure green) with a burned-in frame number.
2. Trim both, add a 1 s Dissolve at the cut, and export.
3. Read the exported frames. Mid-transition values near 128/128 for red/green indicate encoded-space mixing; values near 186/186 indicate linear-light mixing. Plotting the weight per frame shows the easing and the end values. The frame numbers show whether source frames past the cut or repeated frames were used.
4. Repeat with clips that have no spare media, and with a black-fade transition.

Colour conversion and compression shift the exported values, so compare against frames outside the transition rather than against exact numbers.
