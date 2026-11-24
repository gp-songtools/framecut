from base64 import b64encode
from gzip import compress
from pathlib import Path
from json import dumps, loads

root = Path(__file__).resolve().parent
source = root / "src"
image = b64encode((source / "demo.jpg").read_bytes()).decode("ascii")
script = "\n".join((source / name).read_text(encoding="utf-8") for name in (
    "text-animations.js", "text-atmosphere.js", "animation-panel.js", "overlays.js", "subject-tracking.js",
    "body-detail-tracking.js", "body-compositing.js", "effects.js", "preset-controls.js", "timeline-range.js",
    "track-mixer.js", "audio-waveforms.js", "extracted-audio.js", "audio-fades.js", "audio-visualizers.js", "project-files.js",
    "songspec.js", "songdrive.js", "song-spec.js", "framecut-drive.js", "place-clips.js", "lyrics-timing.js", "lyric-transcription.js", "lyrics.js", "editor.js"))
script = script.replace("/* DEMO_IMAGE */", "data:image/jpeg;base64," + image)
font_dir = source / "fonts"
title_fonts = loads((font_dir / "fonts.json").read_text(encoding="utf-8"))
font_faces = []
for family, faces in title_fonts.items():
    for filename, weight, style in faces:
        data = b64encode((font_dir / filename).read_bytes()).decode("ascii")
        font_faces.append(
            f'@font-face{{font-family:{dumps(family)};font-weight:{weight};font-style:{style};'
            f'src:url(data:font/woff2;base64,{data}) format("woff2")}}'
        )
script = script.replace("/* BUNDLED_TITLE_FONTS */", ", ".join(dumps(family) for family in title_fonts))
vendor = source / "person-model"
graph = (vendor / "model-stride16.json").read_text(encoding="utf-8")
manifest = loads(graph)["weightsManifest"]
weights = b"".join((vendor / path).read_bytes() for group in manifest for path in group["paths"])
portrait = b64encode((vendor / "portrait.jpg").read_bytes()).decode("ascii")
script = script.replace("/* SUBJECT_PREVIEW */", "data:image/jpeg;base64," + portrait)
def bundle_bytes(element_id, filename, directory=vendor, gzip=False):
    data = (directory / filename).read_bytes()
    if gzip:
        data = compress(data, compresslevel=6, mtime=0)
    data = b64encode(data).decode("ascii")
    return f'<script type="text/plain" id="{element_id}">{data}</script>'


wasm_files = ("tfjs-backend-wasm.wasm", "tfjs-backend-wasm-simd.wasm", "tfjs-backend-wasm-threaded-simd.wasm")
notices = "\n\n".join((vendor / filename).read_text(encoding="utf-8") for filename in
                      ("NOTICE", "TFJS-LICENSE", "BODYPIX-LICENSE"))
model_code = (source / "person-model.js").read_text(encoding="utf-8")
vision_vendor = source / "vision-model"
vision_files = {
    "bodyVisionRuntime": "vision_bundle.mjs",
    "bodyVisionWasmLoader": "vision_wasm_internal.js",
    "bodyVisionWasmBinary": "vision_wasm_internal.wasm",
    "bodyVisionFace": "face_landmarker.task",
    "bodyVisionHand": "hand_landmarker.task",
}
vision_notices = "\n\n".join((vision_vendor / filename).read_text(encoding="utf-8")
                           for filename in ("NOTICE.md", "LICENSE"))
media_reader = source / "media-reader"
media_reader_notices = "\n\n".join((media_reader / filename).read_text(encoding="utf-8")
                                  for filename in ("NOTICE.md", "LICENSE"))
whisper_vendor = source / "whisper-model"
whisper_files = {
    filename: f"whisperAsset{index}" for index, filename in enumerate((
        "transformers.iife.js", "ort-wasm-simd.wasm", "ort-wasm.wasm",
        "config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json",
        "tokenizer_config.json", "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx",
    ))
}
whisper_notices = "\n\n".join((whisper_vendor / filename).read_text(encoding="utf-8") for filename in (
    "NOTICE.md", "TRANSFORMERS-LICENSE", "ONNX-RUNTIME-LICENSE", "ONNX-RUNTIME-NOTICES", "WHISPER-LICENSE"
))
bundle = "\n".join((
    bundle_bytes("personRuntime", "tf.min.js"),
    bundle_bytes("personWasmRuntime", "tf-backend-wasm.min.js"),
    *(bundle_bytes(f"personWasm{index}", filename) for index, filename in enumerate(wasm_files)),
    f'<script type="application/json" id="personGraph">{graph}</script>',
    f'<script type="text/plain" id="personWeights">{b64encode(weights).decode("ascii")}</script>',
    f'<script type="text/plain" id="personModelNotices">{notices}</script>',
    *(bundle_bytes(element_id, filename, vision_vendor) for element_id, filename in vision_files.items()),
    f'<script type="text/plain" id="bodyVisionNotices">{vision_notices}</script>',
    bundle_bytes("videoAudioReader", "mediabunny.min.mjs", media_reader),
    f'<script type="text/plain" id="videoAudioReaderNotices">{media_reader_notices}</script>',
    bundle_bytes("whisperWorker", "whisper-worker.js", source),
    f'<script type="application/json" id="whisperFiles">{dumps(whisper_files)}</script>',
    *(bundle_bytes(element_id, filename, whisper_vendor, gzip=True) for filename, element_id in whisper_files.items()),
    f'<script type="text/plain" id="whisperNotices">{whisper_notices}</script>',
    f'<script>{model_code}</script>',
))
page = (source / "index.html").read_text(encoding="utf-8").replace("<!-- PERSON_MODEL_BUNDLE -->", bundle)
page = page.replace("/* BUNDLED_TITLE_FONT_FACES */", "\n".join(font_faces))
(root / "index.html").write_text(page.replace("/* APP_SCRIPT */", script), encoding="utf-8")
