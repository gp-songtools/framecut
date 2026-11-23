# Offline lyric transcription

- Transformers.js 2.17.2 and its distribution assets from the
  [npm package](https://www.npmjs.com/package/@xenova/transformers/v/2.17.2),
  licensed under Apache 2.0. The original minified JavaScript entry is repackaged
  as a classic worker script for offline file URLs with esbuild 0.25.12:
  `esbuild transformers.min.js --bundle --platform=browser --format=iife --global-name=FramecutWhisper --legal-comments=inline --minify --outfile=transformers.iife.js`.
- ONNX Runtime Web 1.14.0 by Microsoft, included in that distribution and
  licensed under MIT. See the accompanying third-party notices.
- Xenova's quantized [Whisper Tiny ONNX conversion](https://huggingface.co/Xenova/whisper-tiny/tree/5332fcc35e32a33b86612b9a57a89be7906102b1),
  revision 5332fcc35e32a33b86612b9a57a89be7906102b1, published under Apache 2.0.
- [Whisper](https://github.com/openai/whisper) by OpenAI is licensed under MIT.
