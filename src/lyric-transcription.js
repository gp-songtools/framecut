'use strict';

const lyricSampleRate = 16000;
const lyricCloudLimit = 25000000;
const lyricCloudProviders = {
  groq: { label: 'Groq', url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
  openai: { label: 'OpenAI', url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' }
};

async function decodeLyricClip(asset, clip, signal) {
  const size = Math.round((clip.end - clip.start) * lyricSampleRate);
  if (size < 1) throw Error('The selected audio clip is empty.');
  if (asset.sourceVideo) {
    return withVideoAudioTrack(asset.sourceVideo, async (track, { AudioBufferSink }) => {
      if (!track || !await track.canDecode()) throw Error('This video’s extracted audio could not be decoded.');
      const samples = new Float32Array(size);
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(clip.start, clip.end)) {
        signal.throwIfAborted();
        const from = Math.max(0, Math.ceil((timestamp - clip.start) * lyricSampleRate));
        const to = Math.min(size, Math.ceil((timestamp + buffer.duration - clip.start) * lyricSampleRate));
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        for (let i = from; i < to; i++) {
          const sample = Math.max(0, (clip.start + i / lyricSampleRate - timestamp) * buffer.sampleRate);
          const left = Math.min(Math.floor(sample), buffer.length - 1);
          const right = Math.min(left + 1, buffer.length - 1);
          let value = 0;
          for (const channel of channels) value += channel[left] + (channel[right] - channel[left]) * (sample - left);
          samples[i] = value / channels.length;
        }
      }
      return samples;
    });
  }
  const context = new OfflineAudioContext(1, size, lyricSampleRate);
  const bytes = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.url, { signal })).arrayBuffer();
  signal.throwIfAborted();
  const buffer = await context.decodeAudioData(bytes);
  signal.throwIfAborted();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0, clip.start);
  return (await context.startRendering()).getChannelData(0);
}

function encodeLyricWav(samples) {
  const header = new DataView(new ArrayBuffer(44));
  header.setUint32(0, 0x52494646); // RIFF
  header.setUint32(4, 36 + samples.length * 2, true);
  header.setUint32(8, 0x57415645); // WAVE
  header.setUint32(12, 0x666d7420); // fmt
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, lyricSampleRate, true);
  header.setUint32(28, lyricSampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  header.setUint32(36, 0x64617461); // data
  header.setUint32(40, samples.length * 2, true);
  const pcm = new DataView(new ArrayBuffer(samples.length * 2));
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    pcm.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Blob([header, pcm], { type: 'audio/wav' });
}

async function transcribeLyricsInCloud(samples, provider, key, signal) {
  const { label, url, model } = lyricCloudProviders[provider];
  const form = new FormData();
  form.append('file', encodeLyricWav(samples), 'clip.wav');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form, signal });
  } catch {
    signal.throwIfAborted();
    throw Error('Could not reach ' + label + '. Check your connection or choose In-browser Whisper.');
  }
  if (response.status === 401 || response.status === 403) throw Error(label + ' rejected the API key or its permissions.');
  if (!response.ok) throw Error(label + ' transcription failed (HTTP ' + response.status + ').');
  const { words, segments } = await response.json();
  return { words: Array.isArray(words) ? words : [], segments: Array.isArray(segments) ? segments : [] };
}

async function transcribeLyricsOnDevice(samples, signal, setStatus) {
  const manifest = JSON.parse($('whisperFiles').textContent);
  const files = Object.fromEntries(Object.entries(manifest).map(([name, id]) => [
    name, Uint8Array.fromBase64?.($(id).textContent) ?? bundledBytes(id)
  ]));
  signal.throwIfAborted();
  const entry = URL.createObjectURL(new Blob([bundledBytes('whisperWorker')], { type: 'text/javascript' }));
  let worker;
  try {
    worker = new Worker(entry);
    return await new Promise((resolve, reject) => {
      const abort = () => finish(reject, signal.reason);
      const finish = (callback, value) => {
        signal.removeEventListener('abort', abort);
        callback(value);
      };
      signal.addEventListener('abort', abort, { once: true });
      worker.onerror = () => finish(reject, Error('Could not start the bundled Whisper worker.'));
      worker.onmessage = ({ data }) => {
        if (data.status) setStatus(data.status);
        else if (data.error) finish(reject, Error('In-browser Whisper could not transcribe this clip. ' + data.error));
        else finish(resolve, data);
      };
      worker.postMessage({ files, samples }, [samples.buffer, ...Object.values(files).map(bytes => bytes.buffer)]);
    });
  } finally {
    worker?.terminate();
    URL.revokeObjectURL(entry);
  }
}

function lyricLiveRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Older Chromium accepts and ignores the track argument, then listens to the microphone.
  const chromium = navigator.userAgentData?.brands.find(({ brand }) => brand === 'Chromium');
  const chromiumVersion = Number(chromium?.version ?? /\b(?:Headless)?Chrome\/(\d+)/.exec(navigator.userAgent)?.[1]);
  if (!Recognition || !(chromiumVersion >= 142)) {
    throw Error('Live Browser Listener needs Chrome 142 or later with audio-track speech recognition.');
  }
  return Recognition;
}

function listenToLyricBuffer(Recognition, context, buffer, from, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';
    const source = context.createBufferSource();
    source.buffer = buffer;
    const destination = context.createMediaStreamDestination();
    const track = destination.stream.getAudioTracks()[0];
    source.connect(destination);
    const segments = [];
    let started, phraseStart, lastEnd = from, timer, drainTimer, settled = false;
    let nextResult = 0;
    const position = () => started === undefined ? from : Math.min(buffer.duration, from + context.currentTime - started);
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(drainTimer);
      signal.removeEventListener('abort', abort);
      const cursor = position();
      if (started !== undefined) source.stop();
      source.disconnect();
      track.stop();
      if (error) {
        try { recognition.abort(); } catch { /* The browser may have already ended the session. */ }
        reject(error);
      } else resolve({ segments, cursor });
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    recognition.onstart = () => {
      if (settled) return;
      clearTimeout(timer);
      started = context.currentTime;
      source.start(started, from);
    };
    recognition.onspeechstart = () => { phraseStart = position(); };
    recognition.onresult = event => {
      for (let i = Math.max(nextResult, event.resultIndex); i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) break;
        nextResult = i + 1;
        const text = result[0].transcript.trim();
        if (!text) continue;
        const end = position();
        const estimatedStart = end - Math.max(.25, text.split(/\s+/).length * .26);
        const start = Math.min(Math.max(from, end - .001), Math.max(lastEnd, phraseStart ?? estimatedStart));
        segments.push({ text, start, end });
        phraseStart = undefined;
        lastEnd = end;
      }
    };
    recognition.onerror = ({ error }) => {
      if (error !== 'no-speech') finish(Error('The browser speech service could not listen (' + error + '). Try In-browser Whisper.'));
    };
    recognition.onend = () => finish();
    source.onended = () => {
      if (settled) return;
      drainTimer = setTimeout(() => {
        timer = setTimeout(() => finish(), 2500);
        try { recognition.stop(); } catch { finish(); }
      }, 600);
    };
    timer = setTimeout(() => finish(Error('The browser speech service did not start. Try In-browser Whisper.')), 12000);
    try {
      recognition.start(track);
    } catch {
      finish(Error('This browser could not listen to the audio track. Try In-browser Whisper.'));
    }
  });
}

async function transcribeLyricsLive(samples, context, signal) {
  const Recognition = lyricLiveRecognition();
  const buffer = context.createBuffer(1, samples.length, lyricSampleRate);
  buffer.copyToChannel(samples, 0);
  const segments = [];
  let cursor = 0;
  while (cursor < buffer.duration - .001) {
    const result = await listenToLyricBuffer(Recognition, context, buffer, cursor, signal);
    segments.push(...result.segments);
    if (result.cursor <= cursor + .001) throw Error('The browser speech service stopped listening. Try In-browser Whisper.');
    cursor = result.cursor;
  }
  return { segments };
}
