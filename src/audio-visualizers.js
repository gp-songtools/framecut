'use strict';

// Audio-reactive visualizers ported from GP Song Tools' AuraLyrics Studio. Each frame is a
// function of the attached audio clip's source time: the analyser smoothing, beat envelopes,
// peak caps and shockwaves are replayed over a short window before the frame instead of being
// carried between frames, so preview, scrubbing and export draw the same picture.

const visualizerPresets = {
  radial: 'Radial Spectrum', equalizer: 'Cyber Skyline', waveform: 'Neon Oscilloscope',
  nebula: 'Cosmic Vortex', aurora: 'Aurora Ribbons', dualring: 'Dual Infinity', pulserings: 'Pulse Rings',
  mirrorbars: 'Mirror Bars', inferno: 'Inferno Spectrum', spiralburst: 'Spiral Burst', vumeter: 'VU Meter',
  ledmeter: 'LED Meter', dotspectrum: 'Dot Spectrum'
};
const visualizerPalettes = {
  cyberpunk: { label: 'Cyberpunk', primary: '#06b6d4', secondary: '#f43f5e', accent: '#ec4899', bgGradient: ['#030712', '#0f172a', '#1e1b4b'] },
  synthwave: { label: 'Synthwave', primary: '#a855f7', secondary: '#f97316', accent: '#fbbf24', bgGradient: ['#0f051d', '#1e0c38', '#2e0854'] },
  emerald: { label: 'Matrix Emerald', primary: '#10b981', secondary: '#06b6d4', accent: '#34d399', bgGradient: ['#02120b', '#062617', '#083321'] },
  hyperviolet: { label: 'Hyper Violet', primary: '#6366f1', secondary: '#d946ef', accent: '#ec4899', bgGradient: ['#0a081e', '#160d3d', '#270e5c'] },
  sunset: { label: 'Sunset Horizon', primary: '#f59e0b', secondary: '#e11d48', accent: '#8b5cf6', bgGradient: ['#1c0b05', '#2a0e19', '#1a0b2e'] },
  monochrome: { label: 'Monochrome', primary: '#f8fafc', secondary: '#94a3b8', accent: '#e2e8f0', bgGradient: ['#020617', '#090d16', '#0f172a'] }
};
const visualizerSources = { classic: 'Full mix', kick: 'Kick', bass: 'Bass', melody: 'Melody', vocal: 'Vocals' };
const visualizerDefaults = {
  preset: 'radial', palette: 'cyberpunk', reactsTo: 'classic', reactivity: 1.4, glow: 22,
  opacity: 1, width: 1, height: 1, x: 0, y: 0, backdrop: false
};
const visualizerRanges = {
  reactivity: [.5, 2.5], glow: [5, 35], opacity: [0, 1], width: [.05, 1], height: [.05, 1], x: [-.5, .5], y: [-.5, .5]
};
const visualizerSizeKeys = ['width', 'height'];

// Projects saved before width and height were separate store one uniform `size`.
function visualizerSize(settings) {
  return visualizerSizeKeys.map(key => settings[key] ?? settings.size ?? 1);
}

function upgradeVisualizerSettings(settings) {
  if (settings.size === undefined) return;
  [settings.width, settings.height] = visualizerSize(settings);
  delete settings.size;
}

function validVisualizerSettings(settings) {
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings) ||
      !Object.hasOwn(visualizerPresets, settings.preset) || !Object.hasOwn(visualizerPalettes, settings.palette) ||
      !Object.hasOwn(visualizerSources, settings.reactsTo) || typeof settings.backdrop !== 'boolean') return false;
  const inRange = (value, [min, max]) => Number.isFinite(value) && value >= min && value <= max;
  const legacy = settings.width === undefined && settings.height === undefined;
  if (legacy ? !inRange(settings.size, [.2, 1]) : settings.size !== undefined) return false;
  return Object.entries(visualizerRanges).every(([key, range]) =>
    (legacy && visualizerSizeKeys.includes(key)) || inRange(settings[key], range));
}

// Analysis matches AuraLyrics' AnalyserNode settings: 2048-point Blackman FFT, -100..-30 dB bytes,
// 0.82 smoothing at 60 Hz and a 130 ms beat release.
const vizRate = 32000;
const vizFftSize = 2048;
const vizFrameRate = 60;
const vizSmoothing = .82;
const vizSmoothingFrames = 16;
const vizReplayFrames = 120;
const vizBeatRelease = .13;
const vizCacheFrames = 1200;
const vizAudio = new WeakMap();

function visualizerAudio(asset) {
  let entry = vizAudio.get(asset);
  if (!entry) {
    entry = { samples: null, error: null, magnitudes: new Map(), frames: new Map() };
    vizAudio.set(asset, entry);
    entry.ready = decodeVisualizerAudio(asset).then(samples => {
      entry.samples = samples;
      if (!playback && !exporting) draw();
    }, error => {
      entry.error = error;
    });
  }
  return entry;
}

async function decodeVisualizerAudio(asset) {
  if (asset.sourceVideo) {
    const size = Math.ceil(asset.duration * vizRate);
    return withVideoAudioTrack(asset.sourceVideo, async (track, { AudioBufferSink }) => {
      if (!track || !await track.canDecode()) throw Error('This video’s audio could not be decoded.');
      const samples = new Float32Array(size);
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
        const from = Math.max(0, Math.ceil(timestamp * vizRate));
        const to = Math.min(size, Math.ceil((timestamp + buffer.duration) * vizRate));
        const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
        for (let i = from; i < to; i++) {
          const index = Math.min(buffer.length - 1, Math.max(0, Math.round((i / vizRate - timestamp) * buffer.sampleRate)));
          let value = 0;
          for (const channel of channels) value += channel[index];
          samples[i] = value / channels.length;
        }
      }
      return samples;
    });
  }
  const bytes = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.url)).arrayBuffer();
  const buffer = await new OfflineAudioContext(1, 1, vizRate).decodeAudioData(bytes);
  const samples = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
  }
  return samples;
}

const vizFft = (() => {
  const n = vizFftSize, half = n >> 1, bits = Math.log2(n);
  const window = new Float64Array(n);
  for (let i = 0; i < n; i++) window[i] = .42 - .5 * Math.cos(2 * Math.PI * i / n) + .08 * Math.cos(4 * Math.PI * i / n);
  const reverse = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float64Array(half), sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos(2 * Math.PI * i / n);
    sin[i] = -Math.sin(2 * Math.PI * i / n);
  }
  const re = new Float64Array(n), im = new Float64Array(n);
  return (samples, centre) => {
    const start = centre - half;
    for (let i = 0; i < n; i++) {
      const at = start + i;
      re[reverse[i]] = (at >= 0 && at < samples.length ? samples[at] : 0) * window[i];
      im[reverse[i]] = 0;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const h = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < h; j++) {
          const k = j * step, a = i + j, b = a + h;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    const out = new Float32Array(half);
    for (let k = 0; k < half; k++) out[k] = Math.hypot(re[k], im[k]) / n;
    return out;
  };
})();

function cachedVizFrame(map, frame, build) {
  let value = map.get(frame);
  if (value) {
    map.delete(frame);
  } else {
    value = build();
    if (map.size >= vizCacheFrames) map.delete(map.keys().next().value);
  }
  map.set(frame, value);
  return value;
}

function vizMagnitudes(entry, frame) {
  return cachedVizFrame(entry.magnitudes, frame, () =>
    vizFft(entry.samples, Math.round(frame / vizFrameRate * vizRate)));
}

// AnalyserNode-style smoothing written as a weighted sum of the preceding spectra.
function vizFrame(entry, frame) {
  return cachedVizFrame(entry.frames, frame, () => {
    const half = vizFftSize >> 1;
    const smoothed = new Float64Array(half);
    let weight = 0;
    for (let j = 0; j < vizSmoothingFrames && frame - j >= 0; j++) {
      const w = (1 - vizSmoothing) * vizSmoothing ** j;
      const magnitudes = vizMagnitudes(entry, frame - j);
      for (let k = 0; k < half; k++) smoothed[k] += w * magnitudes[k];
      weight += w;
    }
    const freq = new Uint8Array(half);
    const scale = 255 / 70;
    for (let k = 0; k < half; k++) {
      const value = smoothed[k] / weight;
      const db = value > 0 ? 20 * Math.log10(value) : -Infinity;
      freq[k] = Math.max(0, Math.min(255, Math.floor(scale * (db + 100))));
    }
    const time = new Uint8Array(half);
    const centre = Math.round(frame / vizFrameRate * vizRate) - (half >> 1);
    for (let i = 0; i < half; i++) {
      const sample = entry.samples[centre + i] ?? 0;
      time[i] = Math.max(0, Math.min(255, Math.floor(128 * (1 + sample))));
    }
    return { freq, time };
  });
}

// Shared analysis state read by the ported drawing code.
let vizFreq = null;
let vizTime = null;
const vizClock = { t: 0, dt: 1 / vizFrameRate, songTime: 0, playing: true };
const vizFrameScale = () => vizClock.dt * 60;
const vizEase = k60 => 1 - (1 - k60) ** (vizClock.dt * 60);
const vizHzToBin = hz => hz * vizFftSize / vizRate;
const vizFullSpectrum = [40, 16000];
let vizSpectrumRange = vizFullSpectrum;

function vizSpectrumPeak(loHz, hiHz) {
  const n = vizFreq.length;
  const b0 = vizHzToBin(loHz), b1 = vizHzToBin(hiHz);
  const i0 = Math.max(0, Math.ceil(b0)), i1 = Math.min(n - 1, Math.floor(b1));
  if (i1 < i0) {
    const c = Math.min(n - 1.001, Math.max(0, (b0 + b1) / 2));
    const i = Math.floor(c), fraction = c - i;
    return (vizFreq[i] * (1 - fraction) + vizFreq[i + 1] * fraction) / 255;
  }
  let m = 0;
  for (let i = i0; i <= i1; i++) if (vizFreq[i] > m) m = vizFreq[i];
  return m / 255;
}

function vizBandAverage(loHz, hiHz) {
  const g = Math.max(1, Math.round(vizFftSize / 512));
  const n = vizFreq.length;
  const i0 = Math.floor(vizHzToBin(loHz) / g) * g;
  const i1 = Math.min(n, Math.ceil(vizHzToBin(hiHz) / g) * g);
  let sum = 0, count = 0;
  for (let i = i0; i < i1; i += g) {
    let m = 0;
    for (let k = i; k < i + g && k < n; k++) if (vizFreq[k] > m) m = vizFreq[k];
    sum += m;
    count++;
  }
  return count ? sum / count / 255 : 0;
}

function vizSpectrumRaw(t, w = 1 / 64) {
  const [lo, hi] = vizSpectrumRange;
  const tc = Math.max(0, Math.min(1, t));
  const f0 = lo * (hi / lo) ** Math.max(0, tc - w / 2);
  const f1 = lo * (hi / lo) ** Math.min(1, tc + w / 2);
  return vizSpectrumPeak(f0, f1);
}

function vizSampleSpectrum(t, w) {
  const raw = Math.min(1, vizSpectrumRaw(t, w) * (1 + t * .25));
  return Math.max(0, (raw - .35) / .65) ** 1.7;
}

function vizShapeBar(v, reactivity) {
  const x = v * reactivity * .8;
  return x <= .7 ? x : .7 + .3 * Math.tanh((x - .7) / .3);
}

function vizRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

// Spectral-flux beat engine from AuraLyrics.
const vizBeatBands = { kick: [45, 300], bass: [20, 140], melody: [250, 2000], vocal: [300, 3400] };
const vizFluxLag = .033;
const vizByteToLinear = new Float32Array(256).map((_, b) => 10 ** ((b / 255 * 70 - 100) / 20) / .0316);

function createVizBeatEngine() {
  return Object.fromEntries(Object.keys(vizBeatBands).map(name => [name, {
    level: 0, norm: 0, env: 0, floor: 1, ceil: 0, past: [], flux: 0, hist: [], peak: 0,
    onset: false, strength: 0, lastOnset: -Infinity, listenFrom: null
  }]));
}

function updateVizBeatEngine(bands) {
  const { dt, t } = vizClock;
  const releaseK = 1 - Math.exp(-dt / vizBeatRelease);
  const attackK = vizEase(.65);
  const peakDecay = Math.exp(-dt / 1.5);
  for (const [name, [lo, hi]] of Object.entries(vizBeatBands)) {
    const b = bands[name];
    b.onset = false;
    const n = vizFreq.length;
    const i0 = Math.max(1, Math.round(vizHzToBin(lo)));
    const i1 = Math.min(n - 1, Math.max(i0, Math.round(vizHzToBin(hi))));
    const count = i1 - i0 + 1;
    const current = new Float32Array(count);
    let sum = 0;
    for (let i = i0; i <= i1; i++) {
      sum += vizFreq[i] / 255;
      current[i - i0] = vizByteToLinear[vizFreq[i]];
    }
    const level = sum / count;
    let reference = null;
    for (let k = b.past.length - 1; k >= 0; k--) {
      if (b.past[k].t <= t - vizFluxLag + 1e-6) { reference = b.past[k]; break; }
    }
    if (!reference && b.past.length) reference = b.past[0];
    let flux = 0;
    const songStart = !b.past.length && vizClock.songTime <= .1;
    if (b.listenFrom === null) b.listenFrom = t;
    if (reference || songStart) {
      for (let i = 0; i < count; i++) {
        const d = current[i] - (reference ? reference.bins[i] : 0);
        if (d > 0) flux += d;
      }
      flux /= count;
    }
    b.past.push({ t, bins: current });
    while (b.past.length > 2 && b.past[1].t <= t - vizFluxLag + 1e-6) b.past.shift();
    b.level = level;
    b.floor = level < b.floor ? level : b.floor + (level - b.floor) * vizEase(.02);
    b.ceil = level > b.ceil ? level : b.ceil - (b.ceil - level) * vizEase(.008);
    b.norm = Math.max(0, Math.min(1, (level - b.floor) / Math.max(.08, b.ceil - b.floor))) ** 1.5;
    if (songStart) {
      if (flux > .004) { b.onset = true; b.lastOnset = t; b.strength = 1; b.peak = Math.max(b.peak, flux); }
      b.flux = flux;
      b.env += (b.norm - b.env) * (b.norm > b.env ? attackK : releaseK);
      continue;
    }
    b.hist.push(t, flux);
    while (b.hist.length > 2 && b.hist[0] < t - 1) b.hist.splice(0, 2);
    let mean = 0;
    const m = b.hist.length / 2;
    for (let k = 1; k < b.hist.length; k += 2) mean += b.hist[k];
    mean /= m;
    let variance = 0;
    for (let k = 1; k < b.hist.length; k += 2) variance += (b.hist[k] - mean) ** 2;
    const sd = Math.sqrt(variance / m);
    b.peak = Math.max(flux, b.peak * peakDecay);
    const threshold = Math.max(m >= 6 ? mean + 1.5 * sd : 0, b.peak * .45, .004);
    if (flux > threshold && t - b.lastOnset > .1 && t - b.listenFrom >= .5) {
      b.onset = true;
      b.lastOnset = t;
      b.strength = Math.min(1, flux / Math.max(1e-6, b.peak));
    }
    b.flux = flux;
    b.env += (b.norm - b.env) * (b.norm > b.env ? attackK : releaseK);
  }
}

function createVizRuntime() {
  return {
    pulse: { level: 0, waves: [] }, infernoPeaks: [], vu: { level: -20, peakUntil: 0 },
    ledPeaks: [], dotLevels: []
  };
}

// State-only steps for the modes that integrate over time, replayed before the drawn frame.
function updateVizModeState(settings, rt, bands) {
  const { reactivity } = settings;
  switch (settings.preset) {
    case 'pulserings': {
      const band = bands[settings.reactsTo === 'classic' ? 'kick' : settings.reactsTo];
      rt.pulse.level = band.env;
      if (band.onset) rt.pulse.waves.push({ r: .1, alpha: .9 });
      for (const wave of rt.pulse.waves) {
        wave.r += .008 * vizFrameScale();
        wave.alpha *= .94 ** vizFrameScale();
      }
      rt.pulse.waves = rt.pulse.waves.filter(wave => wave.alpha > .03);
      return;
    }
    case 'inferno':
      for (let i = 0; i < 128; i++) {
        const v = vizShapeBar(vizSampleSpectrum(i / 127, 1 / 128), reactivity);
        const peak = rt.infernoPeaks[i];
        rt.infernoPeaks[i] = peak === undefined || v > peak ? v : Math.max(0, peak - .006 * vizFrameScale());
      }
      return;
    case 'ledmeter': {
      const { cols, rows } = rt.ledGrid;
      if (rt.ledPeaks.length !== cols) rt.ledPeaks = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        const on = Math.round(vizShapeBar(vizSampleSpectrum(c / (cols - 1), 1 / cols), reactivity) * rows);
        rt.ledPeaks[c] = Math.max(on, rt.ledPeaks[c] - .12 * vizFrameScale());
      }
      return;
    }
    case 'dotspectrum': {
      const cols = rt.dotCols;
      if (rt.dotLevels.length !== cols) rt.dotLevels = new Array(cols).fill(0);
      for (let c = 0; c < cols; c++) {
        const v = vizShapeBar(vizSampleSpectrum(c / (cols - 1), 1 / cols), reactivity);
        rt.dotLevels[c] += (v - rt.dotLevels[c]) * vizEase(.35);
      }
      return;
    }
    case 'vumeter': {
      let sum = 0;
      for (let i = 0; i < vizTime.length; i++) sum += ((vizTime[i] - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / vizTime.length);
      let target = 20 * Math.log10(Math.max(rms, 1e-5)) + 9 + 20 * Math.log10(Math.max(.1, reactivity) / 1.4);
      if (settings.reactsTo !== 'classic') target = vizVuMin + bands[settings.reactsTo].env * (vizVuMax - vizVuMin);
      target = Math.max(vizVuMin - 2, Math.min(vizVuMax + 1, target));
      rt.vu.level += (target - rt.vu.level) * vizEase(target > rt.vu.level ? .3 : .07);
      if (rt.vu.level > 0) rt.vu.peakUntil = vizClock.t * 1000 + 400;
    }
  }
}

function drawVizRadialSpectrum(ctx, width, height, palette, bassEnergy, reactivity, glow) {
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * .22 * (1 + bassEnergy * .15);
  const bars = 96;
  const angleStep = Math.PI * 2 / bars;
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.secondary;
  const orb = ctx.createRadialGradient(cx, cy, 10, cx, cy, baseRadius);
  orb.addColorStop(0, palette.primary + '40');
  orb.addColorStop(.7, palette.secondary + '25');
  orb.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = orb;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(2, baseRadius * 2 * Math.PI / bars * .65);
  ctx.lineCap = 'round';
  for (let i = 0; i < bars; i++) {
    const value = vizSpectrumRaw((i < bars / 2 ? i : bars - i) / (bars / 2) * .8, 1.6 / bars);
    const barHeight = Math.max(4, value * Math.min(width, height) * .28 * reactivity);
    const angle = i * angleStep - Math.PI / 2;
    const x1 = cx + Math.cos(angle) * (baseRadius + 4);
    const y1 = cy + Math.sin(angle) * (baseRadius + 4);
    const x2 = cx + Math.cos(angle) * (baseRadius + barHeight);
    const y2 = cy + Math.sin(angle) * (baseRadius + barHeight);
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, palette.primary);
    gradient.addColorStop(1, palette.secondary);
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * .75, 0, Math.PI * 2);
  ctx.stroke();
}

function drawVizCyberEqualizer(ctx, width, height, palette, bassEnergy, reactivity, glow) {
  const bars = 64;
  const barWidth = width * .8 / bars;
  const startX = width * .1;
  const baselineY = height * .65;
  const maxH = height * .45;
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  for (let i = 0; i < bars; i++) {
    const value = vizSpectrumRaw(i / (bars - 1) * .92, .92 / bars);
    const h = Math.max(6, value * maxH * reactivity);
    const x = startX + i * barWidth;
    const y = baselineY - h;
    const gradient = ctx.createLinearGradient(x, baselineY, x, y);
    gradient.addColorStop(0, palette.primary);
    gradient.addColorStop(.7, palette.secondary);
    gradient.addColorStop(1, '#ffffff');
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 1, y, barWidth - 2, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y - 4, barWidth - 2, 2.5);
    const reflection = ctx.createLinearGradient(x, baselineY, x, baselineY + h * .35);
    reflection.addColorStop(0, palette.primary + '50');
    reflection.addColorStop(1, 'transparent');
    ctx.fillStyle = reflection;
    ctx.fillRect(x + 1, baselineY + 2, barWidth - 2, h * .35);
  }
}

function drawVizNeonWaveform(ctx, width, height, palette, bassEnergy, glow) {
  const cy = height * .52;
  const len = Math.min(256, vizTime.length);
  const sliceWidth = width / len;
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.secondary;
  const layers = [
    { color: palette.secondary, amp: 1.2, width: 3.5 },
    { color: palette.primary, amp: .85, width: 2 },
    { color: '#ffffff', amp: .5, width: 1.5 }
  ];
  layers.forEach((layer, index) => {
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.width;
    ctx.beginPath();
    let x = 0;
    for (let i = 0; i < len; i++) {
      const offset = (vizTime[i] / 128 - 1) * height * .3 * layer.amp * (1 + bassEnergy * .5);
      const y = cy + offset + Math.sin(i * .05 + vizClock.t * 3 * (index + 1)) * 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  });
}

function drawVizCosmicVortex(ctx, width, height, palette, bassEnergy, glow) {
  const cx = width / 2;
  const cy = height / 2;
  const time = vizClock.t * 1.5;
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  for (let r = 0; r < 8; r++) {
    const radius = (r + 1) * 35 + bassEnergy * 60;
    const points = 36;
    ctx.strokeStyle = r % 2 === 0 ? palette.primary : palette.secondary;
    ctx.lineWidth = 2 + r % 2;
    ctx.beginPath();
    for (let p = 0; p <= points; p++) {
      const angle = p / points * Math.PI * 2;
      const wobble = Math.sin(angle * 6 + time * (r + 1)) * (15 + bassEnergy * 30);
      const x = cx + Math.cos(angle) * (radius + wobble);
      const y = cy + Math.sin(angle) * (radius + wobble);
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function drawVizAuroraRibbons(ctx, width, height, palette, bassEnergy, glow) {
  const time = vizClock.t;
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  for (let ribbon = 0; ribbon < 4; ribbon++) {
    const baseH = height * (.35 + ribbon * .12);
    const gradient = ctx.createLinearGradient(0, baseH - 120, width, baseH + 120);
    gradient.addColorStop(0, (ribbon % 2 === 0 ? palette.primary : palette.secondary) + '60');
    gradient.addColorStop(1, (ribbon % 2 === 0 ? palette.secondary : palette.primary) + '20');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 25) {
      const wave1 = Math.sin(x * .003 + time + ribbon) * (40 + bassEnergy * 80);
      const wave2 = Math.cos(x * .007 - time * .5) * 25;
      ctx.lineTo(x, baseH + wave1 + wave2);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawVizDualInfinity(ctx, width, height, palette, bassEnergy, glow) {
  const cy = height * .5;
  const r = Math.min(width, height) * .16 * (1 + bassEnergy * .2);
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.secondary;
  [width * .4, width * .6].forEach((cx, index) => {
    ctx.strokeStyle = index === 0 ? palette.primary : palette.secondary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    const spikes = 32;
    for (let s = 0; s < spikes; s++) {
      const a = s / spikes * Math.PI * 2 + (index === 0 ? vizClock.t : -vizClock.t);
      const len = 5 + vizSpectrumRaw(s / (spikes - 1) * .85, .85 / spikes) * 45;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len));
      ctx.stroke();
    }
  });
}

function drawVizPulseRings(ctx, width, height, palette, reactivity, glow, rt) {
  const cx = width / 2;
  const cy = height / 2;
  const unit = Math.min(width, height);
  const lvl = Math.min(1.6, rt.pulse.level * (reactivity / 1.4));
  const coreR = unit * (.045 + lvl * .055);
  const haloR = unit * (.3 + lvl * .12);
  const halo = ctx.createRadialGradient(cx, cy, coreR * .5, cx, cy, haloR);
  halo.addColorStop(0, palette.primary + '40');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  ctx.strokeStyle = palette.primary;
  const rings = 5;
  for (let i = 1; i <= rings; i++) {
    const spread = 1 + lvl * .35 + lvl * .5 * (i / rings);
    const r = coreR + unit * .042 * i * spread;
    ctx.globalAlpha = Math.max(.12, Math.min(1, (.9 - i * .14) * (.6 + lvl * .5)));
    ctx.lineWidth = Math.max(1.5, unit * .0045 * (1 + lvl * .8) * (1 - i * .1));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.secondary;
  ctx.shadowColor = palette.secondary;
  for (const wave of rt.pulse.waves) {
    ctx.globalAlpha = wave.alpha;
    ctx.lineWidth = Math.max(1.5, unit * .003);
    ctx.beginPath();
    ctx.arc(cx, cy, wave.r * unit, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = glow * 2;
  ctx.shadowColor = palette.primary;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(.35, palette.primary);
  core.addColorStop(1, palette.primary + 'cc');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();
}

function drawVizMirrorBars(ctx, width, height, palette, reactivity, glow) {
  const half = 40;
  const total = half * 2;
  const cy = height / 2;
  const marginX = width * .06;
  const slot = (width - marginX * 2) / total;
  const barW = Math.max(2, slot * .68);
  const maxH = height * .3;
  const gradient = ctx.createLinearGradient(0, cy - maxH, 0, cy + maxH);
  gradient.addColorStop(0, palette.accent);
  gradient.addColorStop(.42, palette.primary);
  gradient.addColorStop(.58, palette.primary);
  gradient.addColorStop(1, palette.accent);
  ctx.beginPath();
  for (let k = 0; k < total; k++) {
    const d = k < half ? half - 1 - k : k - half;
    const v = vizShapeBar(vizSampleSpectrum(d / (half - 1), 1 / half), reactivity);
    const h = Math.max(height * .006, v * maxH);
    vizRoundRect(ctx, marginX + k * slot + (slot - barW) / 2, cy - h, barW, h * 2, barW / 2);
  }
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = .35;
  ctx.fillStyle = palette.primary;
  ctx.fillRect(marginX, cy - 1, width - marginX * 2, 2);
  ctx.globalAlpha = 1;
}

function drawVizInfernoSpectrum(ctx, width, height, palette, bassEnergy, reactivity, glow, rt) {
  const bars = 128;
  const baseY = height * .9;
  const maxH = height * .5;
  const slot = width / bars;
  const barW = Math.max(1, slot * .62);
  const gradient = ctx.createLinearGradient(0, baseY, 0, baseY - maxH);
  gradient.addColorStop(0, palette.secondary);
  gradient.addColorStop(.6, palette.primary);
  gradient.addColorStop(1, '#ffffff');
  const floor = ctx.createLinearGradient(0, baseY - height * .12, 0, baseY + height * .04);
  floor.addColorStop(0, 'rgba(0,0,0,0)');
  floor.addColorStop(1, palette.secondary + Math.round(40 + Math.min(1, bassEnergy) * 80).toString(16).padStart(2, '0'));
  ctx.fillStyle = floor;
  ctx.fillRect(0, baseY - height * .12, width, height * .16);
  ctx.beginPath();
  const caps = [];
  for (let i = 0; i < bars; i++) {
    const v = vizShapeBar(vizSampleSpectrum(i / (bars - 1), 1 / bars), reactivity);
    const h = Math.max(height * .004, v * maxH);
    const x = i * slot + (slot - barW) / 2;
    ctx.rect(x, baseY - h, barW, h);
    caps.push([x, baseY - Math.max(h, (rt.infernoPeaks[i] ?? 0) * maxH) - height * .008]);
  }
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.secondary;
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = .85;
  const capH = Math.max(2, height * .004);
  for (const [x, y] of caps) ctx.fillRect(x, y, barW, capH);
  ctx.globalAlpha = 1;
}

function drawVizSpiralBurst(ctx, width, height, palette, bassEnergy, reactivity, glow) {
  const cx = width / 2;
  const cy = height / 2;
  const unit = Math.min(width, height);
  const t = vizClock.t;
  const r0 = unit * (.11 + bassEnergy * .025);
  const layers = [
    { n: 96, r: r0 * 1.5, maxLen: unit * .2, rot: t * .2, twist: .25, alpha: 1 },
    { n: 72, r: r0, maxLen: unit * .1, rot: -t * .35, twist: -.35, alpha: .75 }
  ];
  ctx.lineCap = 'round';
  ctx.shadowBlur = glow;
  ctx.shadowColor = palette.primary;
  for (const layer of layers) {
    ctx.beginPath();
    for (let i = 0; i < layer.n; i++) {
      const s = i / layer.n;
      const d = s < .5 ? s * 2 : (1 - s) * 2;
      const v = vizShapeBar(vizSampleSpectrum(d * .85, 1.7 / layer.n), reactivity);
      const len = Math.max(unit * .008, v * layer.maxLen);
      const a1 = layer.rot + s * Math.PI * 2;
      const a2 = a1 + layer.twist * (len / layer.maxLen);
      ctx.moveTo(cx + Math.cos(a1) * layer.r, cy + Math.sin(a1) * layer.r);
      ctx.lineTo(cx + Math.cos(a2) * (layer.r + len), cy + Math.sin(a2) * (layer.r + len));
    }
    ctx.lineWidth = Math.max(2, Math.PI * 2 * layer.r / layer.n * .45);
    ctx.strokeStyle = palette.primary;
    ctx.globalAlpha = layer.alpha;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const vizVuMin = -20, vizVuMax = 3;
const vizVuPosition = vu => {
  const lo = 10 ** (vizVuMin / 20), hi = 10 ** (vizVuMax / 20);
  return (10 ** (vu / 20) - lo) / (hi - lo);
};

function drawVizVuMeter(ctx, width, height, palette, bassEnergy, glow, rt) {
  const unit = Math.min(width, height);
  const px = width / 2;
  const py = height / 2 + unit * .22;
  const R = unit * .42;
  const A = 50 * Math.PI / 180;
  const angleFor = vu => -A + Math.max(-.03, Math.min(1.04, vizVuPosition(vu))) * 2 * A;
  const point = (angle, r) => [px + Math.sin(angle) * r, py - Math.cos(angle) * r];
  const arc = (r, a1, a2) => {
    ctx.beginPath();
    ctx.arc(px, py, r, a1 - Math.PI / 2, a2 - Math.PI / 2);
  };
  ctx.lineCap = 'butt';
  ctx.shadowBlur = glow * .6;
  ctx.shadowColor = palette.primary;
  ctx.strokeStyle = palette.primary;
  ctx.lineWidth = Math.max(2, unit * .006);
  arc(R, -A, angleFor(0));
  ctx.stroke();
  ctx.strokeStyle = ctx.shadowColor = '#ef4444';
  ctx.lineWidth = Math.max(3, unit * .014);
  arc(R + unit * .004, angleFor(0), A);
  ctx.stroke();
  ctx.font = '600 ' + Math.round(unit * .03) + 'px Xirod, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels = { '-20': '20', '-10': '10', '-7': '7', '-5': '5', '-3': '3', 0: '0', 3: '+3' };
  for (const mark of [-20, -15, -10, -7, -5, -4, -3, -2, -1, 0, 1, 2, 3]) {
    const angle = angleFor(mark);
    const major = labels[mark] !== undefined;
    const [x1, y1] = point(angle, R);
    const [x2, y2] = point(angle, R + unit * (major ? .045 : .028));
    ctx.strokeStyle = mark > 0 ? '#ef4444' : palette.primary;
    ctx.lineWidth = Math.max(1.5, unit * (major ? .004 : .0025));
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (major) {
      const [lx, ly] = point(angle, R + unit * .08);
      ctx.fillStyle = mark > 0 ? '#f87171' : palette.primary;
      ctx.shadowBlur = 0;
      ctx.fillText(labels[mark], lx, ly);
      ctx.shadowBlur = glow * .6;
    }
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = palette.primary + 'cc';
  ctx.font = '700 ' + Math.round(unit * .045) + 'px Xirod, sans-serif';
  ctx.fillText('VU', px, py - R * .42);
  const peakOn = vizClock.t * 1000 < rt.vu.peakUntil;
  const [lampX, lampY] = point(A + .12, R * .78);
  ctx.fillStyle = peakOn ? '#ef4444' : '#3f1d1d';
  ctx.shadowBlur = peakOn ? glow * 1.5 : 0;
  ctx.shadowColor = '#ef4444';
  ctx.beginPath();
  ctx.arc(lampX, lampY, unit * .014, 0, Math.PI * 2);
  ctx.fill();
  const [nx, ny] = point(angleFor(rt.vu.level), R * 1.04);
  ctx.strokeStyle = ctx.shadowColor = palette.secondary;
  ctx.shadowBlur = glow;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, unit * .006);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.fillStyle = ctx.shadowColor = palette.primary;
  ctx.shadowBlur = glow * 1.5;
  ctx.beginPath();
  ctx.arc(px, py, unit * (.026 + bassEnergy * .006), 0, Math.PI * 2);
  ctx.fill();
}

function vizLedGrid(width, height) {
  return {
    cols: Math.max(12, Math.min(64, Math.round(width / 26))),
    rows: Math.max(6, Math.min(28, Math.round(height / 22)))
  };
}

function drawVizLedMeter(ctx, width, height, palette, reactivity, glow, rt) {
  const { cols, rows } = rt.ledGrid;
  const padX = width * .02, padY = height * .04;
  const cellW = (width - padX * 2) / cols;
  const cellH = (height - padY * 2) / rows;
  const gapX = Math.max(1, cellW * .16);
  const gapY = Math.max(1, cellH * .3);
  const lit = new Path2D(), dim = new Path2D(), peaks = new Path2D();
  for (let c = 0; c < cols; c++) {
    const on = Math.round(vizShapeBar(vizSampleSpectrum(c / (cols - 1), 1 / cols), reactivity) * rows);
    const peakRow = Math.round(rt.ledPeaks[c] ?? 0) - 1;
    const x = padX + c * cellW + gapX / 2;
    for (let r = 0; r < rows; r++) {
      const y = height - padY - (r + 1) * cellH + gapY / 2;
      const target = r < on ? lit : r === peakRow && peakRow >= on ? peaks : dim;
      target.rect(x, y, cellW - gapX, cellH - gapY);
    }
  }
  ctx.fillStyle = palette.primary;
  ctx.globalAlpha = .07;
  ctx.fill(dim);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = glow * .6;
  ctx.shadowColor = palette.primary;
  ctx.fill(lit);
  ctx.fillStyle = ctx.shadowColor = palette.accent;
  ctx.fill(peaks);
}

function drawVizDotSpectrum(ctx, width, height, palette, glow, rt) {
  const cols = rt.dotCols;
  const padX = width * .02;
  const top = height * .08, bottom = height * .92;
  const slot = (width - padX * 2) / cols;
  const radius = Math.max(2.5, Math.min(slot * .4, height * .06));
  const stems = new Path2D();
  for (let c = 0; c < cols; c++) {
    const x = padX + (c + .5) * slot;
    stems.moveTo(x, top);
    stems.lineTo(x, bottom);
  }
  ctx.strokeStyle = palette.primary;
  ctx.globalAlpha = .35;
  ctx.lineWidth = Math.max(1, slot * .1);
  ctx.stroke(stems);
  ctx.globalAlpha = 1;
  const dots = new Path2D();
  for (let c = 0; c < cols; c++) {
    const x = padX + (c + .5) * slot;
    const y = bottom - (rt.dotLevels[c] ?? 0) * (bottom - top);
    dots.moveTo(x + radius, y);
    dots.arc(x, y, radius, 0, Math.PI * 2);
  }
  ctx.fillStyle = ctx.shadowColor = palette.primary;
  ctx.shadowBlur = glow;
  ctx.fill(dots);
}

function drawVizPreset(ctx, settings, w, h, palette, drive, glow, rt) {
  const { reactivity } = settings;
  switch (settings.preset) {
    case 'equalizer': return drawVizCyberEqualizer(ctx, w, h, palette, drive, reactivity, glow);
    case 'waveform': return drawVizNeonWaveform(ctx, w, h, palette, drive, glow);
    case 'nebula': return drawVizCosmicVortex(ctx, w, h, palette, drive, glow);
    case 'aurora': return drawVizAuroraRibbons(ctx, w, h, palette, drive, glow);
    case 'dualring': return drawVizDualInfinity(ctx, w, h, palette, drive, glow);
    case 'pulserings': return drawVizPulseRings(ctx, w, h, palette, reactivity, glow, rt);
    case 'mirrorbars': return drawVizMirrorBars(ctx, w, h, palette, reactivity, glow);
    case 'inferno': return drawVizInfernoSpectrum(ctx, w, h, palette, drive, reactivity, glow, rt);
    case 'spiralburst': return drawVizSpiralBurst(ctx, w, h, palette, drive, reactivity, glow);
    case 'vumeter': return drawVizVuMeter(ctx, w, h, palette, drive, glow, rt);
    case 'ledmeter': return drawVizLedMeter(ctx, w, h, palette, reactivity, glow, rt);
    case 'dotspectrum': return drawVizDotSpectrum(ctx, w, h, palette, glow, rt);
    default: return drawVizRadialSpectrum(ctx, w, h, palette, drive, reactivity, glow);
  }
}

let vizLayerCanvas;

// Draws the visualizer attached to an audio clip at a timeline position.
function drawClipVisualizer(target, clip, position) {
  const settings = clip.visualizer;
  const asset = assets.get(clip.asset);
  if (!settings || !asset) return;
  const entry = visualizerAudio(asset);
  if (!entry.samples) return;
  const sourceTime = clip.start + position - clip.at;
  const frame = Math.max(0, Math.round(sourceTime * vizFrameRate));
  const palette = visualizerPalettes[settings.palette] ?? visualizerPalettes.cyberpunk;
  const { width, height } = target.canvas;
  // AuraLyrics tunes its pixel sizes at 1080p, so draw in that reference space.
  const scale = Math.min(width, height) / 1080;
  const [sizeW, sizeH] = visualizerSize(settings);
  const boxW = width / scale * sizeW, boxH = height / scale * sizeH;
  const rt = createVizRuntime();
  rt.ledGrid = vizLedGrid(boxW, boxH);
  rt.dotCols = Math.max(16, Math.min(80, Math.round(boxW / 22)));
  const bands = createVizBeatEngine();
  let drive = 0;
  for (let replay = Math.max(0, frame - vizReplayFrames); replay <= frame; replay++) {
    ({ freq: vizFreq, time: vizTime } = vizFrame(entry, replay));
    vizClock.t = vizClock.songTime = replay / vizFrameRate;
    vizSpectrumRange = settings.reactsTo === 'classic' ? vizFullSpectrum : vizBeatBands[settings.reactsTo];
    updateVizBeatEngine(bands);
    const bass = vizBandAverage(0, 1380);
    drive = settings.reactsTo === 'classic' ? bass : bands[settings.reactsTo].env;
    updateVizModeState(settings, rt, bands);
  }
  const direct = settings.opacity >= 1;
  if (!direct && settings.opacity <= 0) return;
  let ctx = target;
  if (!direct) {
    vizLayerCanvas ??= document.createElement('canvas');
    if (vizLayerCanvas.width !== width || vizLayerCanvas.height !== height) {
      vizLayerCanvas.width = width;
      vizLayerCanvas.height = height;
    }
    ctx = vizLayerCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
  }
  ctx.save();
  if (settings.backdrop) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    palette.bgGradient.forEach((color, i) => gradient.addColorStop(i / (palette.bgGradient.length - 1), color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  const cx = width / 2 + settings.x * width, cy = height / 2 + settings.y * height;
  ctx.translate(cx - boxW * scale / 2, cy - boxH * scale / 2);
  ctx.scale(scale, scale);
  drawVizPreset(ctx, settings, boxW, boxH, palette, drive, settings.glow * scale, rt);
  ctx.restore();
  vizSpectrumRange = vizFullSpectrum;
  if (!direct) {
    target.save();
    target.globalAlpha = settings.opacity;
    target.drawImage(vizLayerCanvas, 0, 0);
    target.restore();
  }
}

function drawAudioVisualizers(ctx, position) {
  for (const clip of clips) {
    if (clip.track !== 'audio' || !clip.visualizer) continue;
    const asset = assets.get(clip.asset);
    // Start decoding before the playhead reaches the clip.
    if (asset) visualizerAudio(asset);
    if (position >= clip.at && position < clip.at + length(clip)) drawClipVisualizer(ctx, clip, position);
  }
}

// Selection bounds in canvas pixels, shaped like overlayPose() for the preview handles.
function visualizerBounds(clip) {
  const [sizeW, sizeH] = visualizerSize(clip.visualizer);
  return {
    x: canvas.width * (.5 + clip.visualizer.x), y: canvas.height * (.5 + clip.visualizer.y),
    halfW: canvas.width * sizeW / 2, halfH: canvas.height * sizeH / 2, angle: 0, offsetY: 0
  };
}

// Moves the box, or drags one corner while the opposite corner stays put.
function dragVisualizerBox(settings, original, corner, dx, dy) {
  const [minSize, maxSize] = visualizerRanges.width;
  const [minOffset, maxOffset] = visualizerRanges.x;
  const [sizeW, sizeH] = visualizerSize(original);
  let next;
  if (corner) {
    const [sx, sy] = corner;
    const edge = (center, size, delta, sign) => {
      const fixed = center - sign * size / 2;
      const moved = clamp(center + sign * size / 2 + delta, fixed + sign * minSize, fixed + sign * maxSize);
      const resized = clamp(Math.abs(moved - fixed), minSize, maxSize);
      return [resized, clamp(fixed + sign * resized / 2 - .5, minOffset, maxOffset)];
    };
    const [width, x] = edge(.5 + original.x, sizeW, dx, sx);
    const [height, y] = edge(.5 + original.y, sizeH, dy, sy);
    next = { width, height, x, y };
  } else {
    next = { width: sizeW, height: sizeH, x: clamp(original.x + dx, minOffset, maxOffset), y: clamp(original.y + dy, minOffset, maxOffset) };
  }
  for (const [key, value] of Object.entries(next)) settings[key] = Number(value.toFixed(4));
  delete settings.size;
}

function appendVisualizerInspector(clip, panel) {
  const section = document.createElement('div');
  section.className = 'section';
  section.id = 'visualizerSettings';
  const title = document.createElement('h3');
  title.textContent = 'Visualizer';
  section.append(title);
  const choice = (label, id, options, value, change) => {
    const row = document.createElement('label');
    row.className = 'field visual-choice';
    row.textContent = label;
    const select = document.createElement('select');
    select.id = id;
    for (const [key, name] of options) select.add(new Option(name, key));
    select.value = value;
    select.onchange = () => {
      remember();
      change(select.value);
      refresh();
    };
    row.append(select);
    section.append(row);
  };
  const settings = clip.visualizer;
  if (settings) upgradeVisualizerSettings(settings);
  choice('Preset', 'visualizerPreset', [['', 'None'], ...Object.entries(visualizerPresets)], settings?.preset ?? '', preset => {
    if (preset) {
      clip.visualizer = { ...visualizerDefaults, ...clip.visualizer, preset };
      upgradeVisualizerSettings(clip.visualizer);
    }
    else delete clip.visualizer;
  });
  if (settings) {
    choice('Palette', 'visualizerPalette', Object.entries(visualizerPalettes).map(([key, { label }]) => [key, label]),
      settings.palette, palette => settings.palette = palette);
    choice('Reacts to', 'visualizerReactsTo', Object.entries(visualizerSources), settings.reactsTo,
      source => settings.reactsTo = source);
    const sliders = [['Reactivity', 'reactivity', '.05'], ['Glow', 'glow', '1'], ['Opacity', 'opacity', '.05'],
      ['Width', 'width', '.01'], ['Height', 'height', '.01'], ['Horizontal', 'x', '.01'], ['Vertical', 'y', '.01']];
    for (const [label, key, step] of sliders) {
      const [min, max] = visualizerRanges[key];
      inspectorSliderField(label, settings[key], min, max, value => settings[key] = value, step, section);
    }
    const backdrop = document.createElement('label');
    backdrop.className = 'field';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'visualizerBackdrop';
    box.checked = settings.backdrop;
    box.onchange = () => {
      remember();
      settings.backdrop = box.checked;
      refresh();
    };
    backdrop.append(box, ' Palette backdrop');
    section.append(backdrop);
  }
  panel.append(section);
}
