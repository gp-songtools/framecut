'use strict';

self.onmessage = async ({ data: { files, samples } }) => {
  const modelRoot = 'https://framecut.invalid/whisper-tiny/';
  try {
    for (const [name, data] of Object.entries(files)) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
      files[name] = await new Response(stream).arrayBuffer();
    }
    self.fetch = async input => {
      const url = input.url ?? String(input);
      const name = url.startsWith(modelRoot) && url.slice(modelRoot.length);
      const data = name && Object.hasOwn(files, name) && files[name];
      if (!data) return new Response(null, { status: 404 });
      return new Response(data, { headers: {
        'Content-Length': data.byteLength,
        'Content-Type': name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'
      } });
    };
    const runtime = URL.createObjectURL(new Blob([files['transformers.iife.js']], { type: 'text/javascript' }));
    try {
      importScripts(runtime);
    } finally {
      URL.revokeObjectURL(runtime);
    }
    const { env, pipeline } = self.FramecutWhisper;
    env.localModelPath = 'https://framecut.invalid/';
    env.allowRemoteModels = false;
    env.useBrowserCache = false;
    const wasm = env.backends.onnx.wasm;
    wasm.numThreads = 1;
    wasm.wasmPaths = {
      'ort-wasm-simd.wasm': modelRoot + 'ort-wasm-simd.wasm',
      'ort-wasm.wasm': modelRoot + 'ort-wasm.wasm'
    };
    const transcribe = await pipeline('automatic-speech-recognition', 'whisper-tiny', { quantized: true });
    self.postMessage({ status: 'Transcribing the selected clip…' });
    const result = await transcribe(samples, {
      task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: 'word'
    });
    self.postMessage({ words: (result.chunks ?? []).map(({ text, timestamp }) => ({
      word: text, start: timestamp?.[0], end: timestamp?.[1]
    })) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
