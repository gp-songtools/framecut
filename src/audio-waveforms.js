'use strict';

let audioAnalysisContext;
let videoAudioReader;
const pendingAudioDecodes = new WeakMap();
const audioWaveforms = new WeakMap();
const timelineWaveforms = [];
let waveformFrame = 0;

async function decodeSourceAudio(asset) {
  let pending = pendingAudioDecodes.get(asset);
  if (!pending) {
    audioAnalysisContext ??= new OfflineAudioContext(1, 1, 12000);
    pending = (async () => {
      const response = await fetch(asset.url);
      return audioAnalysisContext.decodeAudioData(await response.arrayBuffer());
    })();
    pendingAudioDecodes.set(asset, pending);
  }
  try {
    return await pending;
  } finally {
    if (pendingAudioDecodes.get(asset) === pending) pendingAudioDecodes.delete(asset);
  }
}

function createWaveform(duration) {
  const rate = 240;
  const count = Math.ceil(duration * rate);
  return { low: new Float32Array(count), high: new Float32Array(count), peak: .1, rate };
}

function collectWaveform(peaks, audio, timestamp) {
  const { low, high, rate } = peaks;
  const samplesPerBin = audio.sampleRate / rate;
  const sampleOffset = timestamp * audio.sampleRate;
  const firstBin = Math.max(0, Math.floor(timestamp * rate));
  const lastBin = Math.min(low.length, Math.ceil((timestamp + audio.duration) * rate));
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let bin = firstBin; bin < lastBin; bin++) {
      let min = low[bin], max = high[bin];
      const start = Math.max(0, Math.ceil(bin * samplesPerBin - sampleOffset));
      const end = Math.min(samples.length, Math.ceil((bin + 1) * samplesPerBin - sampleOffset));
      for (let sample = start; sample < end; sample++) {
        min = Math.min(min, samples[sample]);
        max = Math.max(max, samples[sample]);
      }
      low[bin] = min;
      high[bin] = max;
      peaks.peak = Math.max(peaks.peak, -min, max);
    }
  }
}

function loadVideoAudioReader() {
  videoAudioReader ??= (async () => {
    const url = URL.createObjectURL(new Blob([bundledBytes('videoAudioReader')], { type: 'text/javascript' }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  return videoAudioReader;
}

async function withVideoAudioTrack(asset, read) {
  const reader = await loadVideoAudioReader();
  const input = new reader.Input({ source: new reader.BlobSource(asset.file), formats: reader.ALL_FORMATS });
  try {
    return await read(await input.getPrimaryAudioTrack(), reader);
  } finally {
    input.dispose();
  }
}

function embeddedAudioWaveform(asset) {
  return withVideoAudioTrack(asset, async (track, { AudioBufferSink }) => {
    if (!track) return null;
    if (!await track.canDecode()) throw Error('The audio codec needs Web Audio decoding');
    const peaks = createWaveform(asset.duration);
    // Streaming from the file keeps container timestamps and avoids buffering the video in memory.
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
      collectWaveform(peaks, buffer, timestamp);
    }
    return peaks;
  });
}

async function analyzeWaveform(asset) {
  if (asset.type === 'video' && asset.file && globalThis.AudioDecoder) {
    try {
      return await embeddedAudioWaveform(asset);
    } catch {
      // Older formats or codecs can still be decodable through Web Audio.
    }
  }
  if (!globalThis.OfflineAudioContext) return null;
  const audio = await decodeSourceAudio(asset);
  const peaks = createWaveform(audio.duration);
  collectWaveform(peaks, audio, 0);
  return peaks;
}

function sourceWaveform(asset) {
  asset = asset.sourceVideo ?? asset;
  let entry = audioWaveforms.get(asset);
  if (!entry) {
    entry = { peaks: null };
    audioWaveforms.set(asset, entry);
    if (asset.url) {
      analyzeWaveform(asset).then(peaks => {
        entry.peaks = peaks;
        if (peaks) scheduleAudioWaveforms();
      }).catch(() => {});
    }
  }
  return entry.peaks;
}

function addTimelineWaveform(button, clip, asset) {
  const canvas = document.createElement('canvas');
  canvas.className = 'audio-waveform';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  if (clip.track === 'audio') canvas.dataset.tall = '1';
  button.prepend(canvas);
  timelineWaveforms.push({ canvas, clip, asset });
}

function paintWaveform(canvas, peaks, firstTime, lastTime, width, ratio) {
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.round((canvas.dataset.tall ? 40 : 14) * ratio);
  const layer = canvas.getContext('2d');
  const center = canvas.height / 2;
  const amplitude = (center - 1) / peaks.peak;
  const step = (lastTime - firstTime) / canvas.width;
  layer.fillStyle = '#99f6e4aa';
  layer.fillRect(0, Math.floor(center), canvas.width, 1);
  layer.fillStyle = '#5eead4';
  for (let x = 0; x < canvas.width; x++) {
    const first = Math.max(0, Math.floor((firstTime + x * step) * peaks.rate));
    const last = Math.min(peaks.high.length, Math.ceil((firstTime + (x + 1) * step) * peaks.rate));
    let low = 0, high = 0;
    for (let bin = first; bin < last; bin++) {
      low = Math.min(low, peaks.low[bin]);
      high = Math.max(high, peaks.high[bin]);
    }
    if (low || high) {
      const top = Math.floor(center - high * amplitude);
      layer.fillRect(x, top, 1, Math.max(1, Math.ceil(center - low * amplitude) - top));
    }
  }
}

function paintAudioWaveforms() {
  const scroll = $('scroll');
  const scale = zoom();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  for (const item of timelineWaveforms) {
    const { canvas, clip, asset } = item;
    const origin = clip.at * scale;
    const clipWidth = length(clip) * scale;
    // Give the viewport a small buffer so short scrolls can reuse the same drawing.
    const viewStart = scroll.scrollLeft - origin;
    const viewEnd = viewStart + scroll.clientWidth;
    if (viewEnd <= 0 || viewStart >= clipWidth) {
      canvas.hidden = true;
      continue;
    }
    const peaks = sourceWaveform(asset);
    if (!peaks) continue;
    const start = Math.max(0, Math.floor(viewStart / 128) * 128);
    const end = Math.min(clipWidth, Math.ceil(viewEnd / 128) * 128);
    const firstTime = clip.start + start / scale;
    const lastTime = Math.min(clip.end, clip.start + end / scale);
    const key = [start, end, firstTime, lastTime, ratio].join(':');
    if (item.key !== key) {
      item.key = key;
      canvas.style.left = start + 'px';
      canvas.style.width = (end - start) + 'px';
      paintWaveform(canvas, peaks, firstTime, lastTime, end - start, ratio);
    }
    canvas.hidden = false;
  }
}

function scheduleAudioWaveforms() {
  if (waveformFrame) return;
  waveformFrame = requestAnimationFrame(() => {
    waveformFrame = 0;
    paintAudioWaveforms();
  });
}
