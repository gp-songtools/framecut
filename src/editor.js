'use strict';

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const context = canvas.getContext('2d');
const assets = new Map();
const backgroundImages = new Map();
const backgroundRequests = new WeakMap();
const cutoutLayers = new WeakMap();
const defaultBackgroundColor = '#1b2635';
const demo = new Image();
demo.src = '/* DEMO_IMAGE */';
assets.set('demo', { name: 'Dolomites at dawn', type: 'image', duration: 36000, media: demo, thumb: demo.src });
const lyricLines = [
  [6.5, 10.5, 'Morning breaks on the ridge'], [12, 16, 'Gold spills over the stone'], [17.5, 21.5, 'Mist lifts from the valley floor'],
  [23, 27, 'We rise above the clouds'], [28.5, 33, 'Every peak is a door'], [35, 39.5, 'Carry the light, carry me home'],
  [41, 46, 'Above the clouds, we are free']
];
const initial = [
  { id: 'opening', asset: 'demo', track: 'visual', at: 0, start: 0, end: 16, volume: 1,
    transition: { to: 'push-in', type: 'Cross Dissolve', duration: 1.2 } },
  { id: 'push-in', asset: 'demo', track: 'visual', at: 16, start: 0, end: 16, volume: 1,
    effect: 'Soft Glow',
    overlayKeys: [
      { at: 0, transform: { overlayX: 50, overlayY: 50, overlaySize: 100, overlayRotation: 0, overlayOpacity: 100 }, easing: 'Ease In/Out' },
      { at: 16, transform: { overlayX: 46, overlayY: 52, overlaySize: 128, overlayRotation: 0, overlayOpacity: 100 } }],
    transition: { to: 'golden-hour', type: 'Cross Dissolve', duration: 1.2 } },
  { id: 'golden-hour', asset: 'demo', track: 'visual', at: 32, start: 0, end: 16, volume: 1,
    overlayKeys: [
      { at: 0, transform: { overlayX: 54, overlayY: 50, overlaySize: 124, overlayRotation: 0, overlayOpacity: 100 }, easing: 'Ease In/Out' },
      { at: 16, transform: { overlayX: 50, overlayY: 50, overlaySize: 100, overlayRotation: 0, overlayOpacity: 100 } }] },
  { id: 'opening-title', track: 'title', text: 'Above the Clouds', at: 0, start: 0, end: 3.6, size: 68, textIn: 'Slide Up', textOut: 'Slide Up' },
  ...lyricLines.map(([at, end, text], index) => ({
    id: 'lyric-' + index, track: 'title', text, at, start: 0, end: end - at, size: 44, textIn: 'Slide Up', textOut: 'Slide Up' })),
  { id: 'demo-sparkles', track: 'overlay', preset: 'Sparkles', at: 4, start: 0, end: 4,
    overlayX: 88, overlayY: 20, overlaySize: 30, overlayRotation: 0, overlayOpacity: 100, overlayMotion: '' },
  { id: 'demo-glow', track: 'effect', effect: 'Light Leaks', at: 26, start: 0, end: 6 }
];
let clips = structuredClone(initial);
let selected = 'opening';

// Renders the demo song (92 BPM, A minor) with Web Audio, then adds it as an ordinary audio asset and clip.
async function demoSongWav() {
  const rate = 44100, seconds = 48, beat = 60 / 92, bar = beat * 4;
  const context = new OfflineAudioContext(2, rate * seconds, rate);
  const master = context.createGain();
  master.gain.value = .8;
  // Sections differ in level on purpose: quiet intro, fuller verse, loud chorus, so the waveform shows the song's shape.
  master.connect(context.destination);
  const noise = context.createBuffer(1, rate, rate);
  let seed = 7;
  for (let i = 0; i < rate; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    noise.getChannelData(0)[i] = seed / 2147483648 - 1;
  }
  const tone = (type, freq, at, length, level, target = master, attack = .01) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + attack);
    gain.gain.setTargetAtTime(0, at + length * .6, length * .15);
    osc.connect(gain).connect(target);
    osc.start(at);
    osc.stop(at + length);
  };
  const hat = (at, level) => {
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = noise;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + .06);
    source.connect(filter).connect(gain).connect(master);
    source.start(at, 0, .08);
  };
  const kick = (at, level) => {
    const osc = context.createOscillator(), gain = context.createGain();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + .12);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(.001, at + .32);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + .35);
  };
  const hz = note => 440 * 2 ** ((note - 69) / 12);
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const roots = [33, 29, 36, 31];
  const arpeggio = [0, 1, 2, 1];
  for (let b = 0; b * bar < seconds; b++) {
    const start = b * bar, chord = chords[b % 4], root = roots[b % 4];
    const verse = b >= 4, chorus = b >= 10 && b < 16, outro = b >= 16;
    const pad = context.createGain();
    pad.gain.value = chorus ? .14 : verse ? .06 : .055;
    pad.connect(master);
    for (const note of chord) {
      tone('sawtooth', hz(note), start, bar * 1.05, .5, pad, .4);
      tone('triangle', hz(note + 12), start, bar * 1.05, .4, pad, .5);
    }
    if (verse && !outro) for (let s = 0; s < 8; s++) {
      tone('sine', hz(root + (s % 2 ? 12 : 0)), start + s * beat / 2, beat * .45, chorus ? .45 : .2);
    }
    if (chorus) for (let s = 0; s < 8; s++) {
      tone('triangle', hz(chord[arpeggio[s % 4]] + 24), start + s * beat / 2, beat * .4, .07);
    }
    for (let s = 0; s < 4 && verse && !outro; s++) {
      kick(start + s * beat, chorus ? 1 : .5);
      if (chorus && s % 2) kick(start + s * beat + beat * .75, .4);
    }
    if (b >= 2) for (let s = 0; s < 8; s++) hat(start + s * beat / 2, (s % 2 ? .1 : .05) * (chorus ? 1.4 : 1));
  }
  const buffer = await context.startRendering();
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const fade = rate * 2, total = left.length;
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const level = peak > 0 ? 10 ** (-1 / 20) / peak : 1; // normalise to -1 dBFS
  const view = new DataView(new ArrayBuffer(44 + total * 4));
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + total * 4, true); text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, total * 4, true);
  for (let i = 0; i < total; i++) {
    const gain = Math.min(1, (total - i) / fade);
    view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i] * gain * level)) * 32767, true);
    view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i] * gain * level)) * 32767, true);
  }
  return new Blob([view], { type: 'audio/wav' });
}

async function addDemoAudio() {
  if (!globalThis.OfflineAudioContext) return;
  let url;
  try {
    const blob = await demoSongWav();
    const file = new File([blob], 'Above the Clouds (demo mix).wav', { type: 'audio/wav' });
    url = URL.createObjectURL(file);
    const media = document.createElement('audio');
    await new Promise((resolve, reject) => {
      media.addEventListener('loadeddata', resolve, { once: true });
      media.addEventListener('error', reject, { once: true });
      media.preload = 'auto';
      media.src = url;
    });
    // The user may already have started a new project or opened a file.
    if (!clips.some(clip => clip.id === 'opening-title')) return URL.revokeObjectURL(url);
    assets.set('demo-audio', { name: file.name, type: 'audio', media, url, duration: 48, thumb: '', file });
    clips.push({ id: 'demo-audio-clip', track: 'audio', asset: 'demo-audio', at: 0, start: 0, end: 48, volume: 1,
      visualizer: { preset: 'equalizer', palette: 'sunset', reactsTo: 'classic', reactivity: 1.4, glow: 12,
        opacity: .85, width: 1, height: .16, x: 0, y: .42, backdrop: false } });
    renderBin();
    if (!zoomChosen) fitZoom();
    refresh();
  } catch {
    if (url) URL.revokeObjectURL(url);
  }
}
setTimeout(addDemoAudio, 0);
let time = 0;
let playback = null;
let exporting = null;
let audioContext;
let audioBus;
const undo = [];
const redo = [];
const length = clip => clip.end - clip.start;
const duration = () => Math.max(0, ...clips.map(clip => clip.at + length(clip)));
const zoom = () => Number($('zoom').value);
let zoomChosen = false;
const minAutoZoom = 28;
function fitZoom(full) {
  const total = duration();
  const room = $('scroll').clientWidth;
  if (!total || room <= 0) return;
  const slider = $('zoom');
  slider.value = clamp(Math.max(Math.floor(room / (total + 2) * 10) / 10, full || room >= 700 ? 0 : minAutoZoom), Number(slider.min), Number(slider.max));
}
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const active = () => clips.find(clip => clip.id === selected);
const subjectEffects = ['Body Effects', 'AI Portrait', 'Magic Brush', ...outlineEffects, ...cloneTrailEffects, ...poseBodyEffects];
const animatedEffects = ['Cinematic', 'Stylize', 'Nightclub', ...trendingEffects, ...glitchVideoEffects,
  ...lightVideoEffects, ...blurVideoEffects, ...retroVideoEffects, ...partyVideoEffects, ...textureVideoEffects,
  ...artisticVideoEffects, ...splitVideoEffects, ...frameVideoEffects, ...subjectEffects];
const effects = {
  'Black and white': 'grayscale(1)',
  'High contrast': 'contrast(1.35) saturate(1.18)',
  'Soft blur': 'blur(4px)',
  ...Object.fromEntries(animatedEffects.map(name => [name, 'none']))
};
const effectSurfaces = new WeakMap();

function drawCinematic(target, source, elapsed, strength, options) {
  const { width: w, height: h } = target.canvas;
  target.globalAlpha = strength;
  const exposure = 1.025 + Math.sin(elapsed * 3.2) * .035;
  target.filter = 'sepia(.24) saturate(' + .78 * presetRatio(options, 'saturation') + ') contrast(1.24) brightness(' + exposure + ')';
  target.drawImage(source, 0, 0);
  target.filter = 'none';
  const x = w * (.48 + .06 * Math.sin(elapsed * 1.6));
  const vignette = target.createRadialGradient(x, h * .46, Math.min(w, h) * .17, x, h * .46, Math.hypot(w, h) * .55);
  vignette.addColorStop(0, '#111b2b00');
  vignette.addColorStop(.58, '#111b2b22');
  vignette.addColorStop(1, '#060d1bb8');
  target.fillStyle = vignette;
  target.fillRect(0, 0, w, h);
}

function drawStylize(target, poster, elapsed, strength, options) {
  const { width: w, height: h } = target.canvas;
  const { width, height } = poster.canvas;
  poster.drawImage(target.canvas, 0, 0, width, height);
  const image = poster.getImageData(0, 0, width, height);
  const step = 51 * presetRatio(options, 'levels');
  for (let i = 0; i < image.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      image.data[i + channel] = step * Math.round(image.data[i + channel] / step);
    }
  }
  poster.putImageData(image, 0, 0);
  target.globalAlpha = strength;
  target.imageSmoothingEnabled = false;
  const tint = 20 + Math.sin(elapsed * 3.6) * 24;
  target.filter = 'saturate(1.8) contrast(1.13) hue-rotate(' + tint + 'deg)';
  target.drawImage(poster.canvas, 0, 0, w, h);
}

function drawNightclub(target, elapsed, strength, options) {
  const { width: w, height: h } = target.canvas;
  target.globalCompositeOperation = 'screen';
  const colors = [[242, 22, 178], [35, 87, 255], [32, 222, 228]];
  for (const [index, color] of colors.entries()) {
    const phase = elapsed * (1.6 + index * .27) + index * 2.1;
    const x = w * (.5 + .48 * Math.sin(phase));
    const y = h * (.45 + .44 * Math.cos(phase * .78 + index));
    const radius = Math.max(w, h) * (.32 + .06 * Math.cos(phase)) * presetRatio(options, 'glow');
    const glow = target.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, 'rgba(' + color.join(',') + ',.92)');
    glow.addColorStop(1, 'rgba(' + color.join(',') + ',0)');
    target.globalAlpha = strength * (.34 + .18 * Math.sin(phase) ** 2);
    target.fillStyle = glow;
    target.fillRect(0, 0, w, h);
  }
}

function drawSubjectEffect(target, effect, elapsed, strength, surface, subject) {
  const frame = target.canvas;
  const { width: w, height: h } = frame;
  const { mask, x, y, width, height } = subject;
  const { range, size } = subject.geometry ?? bodyEffectDefaults;
  const drawMask = layer => layer.drawImage(mask, x, y, width, height);
  const layer = surface('subjectLayer');
  layer.clearRect(0, 0, w, h);
  layer.save();
  const pulse = .5 + .5 * Math.sin(elapsed * 4.2);
  if (effect === 'Body Effects') {
    layer.filter = 'blur(' + (Math.min(w, h) * (.013 + .025 * pulse) * range) + 'px)';
    drawMask(layer);
    layer.filter = 'none';
    layer.globalCompositeOperation = 'source-in';
    layer.fillStyle = 'hsl(' + (176 + elapsed * 49) % 360 + ',95%,62%)';
    layer.fillRect(0, 0, w, h);
    layer.globalCompositeOperation = 'destination-out';
    layer.globalAlpha = .83;
    drawMask(layer);
    target.globalCompositeOperation = 'screen';
    target.globalAlpha = strength * (.74 + .26 * pulse);
  } else if (effect === 'AI Portrait') {
    const source = surface('source');
    source.clearRect(0, 0, w, h);
    source.drawImage(frame, 0, 0);
    const blur = Math.min(w, h) * (.012 + .014 * strength) * range;
    target.globalAlpha = strength;
    target.filter = 'blur(' + blur + 'px) saturate(.74)';
    target.drawImage(source.canvas, -.02 * w, -.02 * h, w * 1.04, h * 1.04);
    target.filter = 'none';
    layer.filter = 'brightness(' + (1.04 + pulse * .07) + ') sepia(.12)';
    layer.drawImage(source.canvas, 0, 0);
    layer.filter = 'none';
    layer.globalCompositeOperation = 'destination-in';
    drawMask(layer);
  } else {
    const colors = ['#fba548', '#ec549c', '#58dbc8', '#967bff'];
    const drift = (elapsed * .32) % 1;
    layer.lineCap = 'round';
    for (let i = 0; i < 28; i++) {
      const x = w * (((i * 29) % 97) / 97);
      const y = h * ((((i * 41) % 101) / 101 + drift) % 1);
      const taper = .42 + .44 * Math.sin(i * 1.6 + elapsed * 4) ** 2;
      layer.globalAlpha = taper;
      layer.strokeStyle = colors[i % colors.length];
      layer.lineWidth = Math.min(w, h) * (.008 + (i % 4) * .004) * size;
      layer.beginPath();
      layer.moveTo(x - w * .06, y + h * .06);
      layer.quadraticCurveTo(x, y - h * .02, x + w * (.045 + (i % 5) * .024), y - h * .11);
      layer.stroke();
    }
    layer.globalAlpha = 1;
    layer.globalCompositeOperation = 'destination-in';
    drawMask(layer);
    target.globalAlpha = strength;
  }
  layer.restore();
  target.drawImage(layer.canvas, 0, 0);
}

function drawAnimatedEffect(target, effect, elapsed, strength = 1, subject, beat = Math.max(0, 1 - (elapsed % .88) / .24) ** 2, stock, bounds, options) {
  if (!strength || !animatedEffects.includes(effect) || (subjectEffects.includes(effect) && !subject)) return;
  const detail = bodyDetailKind(effect);
  if (detail && subject?.bodySource && !bodyDetailModels[detail]) loadBodyDetailModel(detail);
  if (detail === 'face' && subject?.bodySource?.visual && !bodyDetailModels.hand) loadBodyDetailModel('hand');
  const { canvas: frame } = target;
  const { width: w, height: h } = frame;
  if (!effectSurfaces.has(frame)) effectSurfaces.set(frame, {});
  const surfaces = effectSurfaces.get(frame);
  const surface = (name, width = w, height = h) => {
    const ctx = surfaces[name] ??= document.createElement('canvas').getContext('2d', {
      willReadFrequently: ['poster', 'edgeSample', 'lensMapping', 'sharpen', 'artSample', 'bodyWarpPixels'].includes(name)
    });
    if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
      ctx.canvas.width = width;
      ctx.canvas.height = height;
    }
    return ctx;
  };
  target.save();
  if (moodyBodyEffects.includes(effect)) {
    drawMoodyBodyEffect(target, effect, elapsed, strength, surface, subject);
    target.restore();
    return;
  }
  if (bodyDistortionEffects.includes(effect)) {
    drawBodyDistortion(target, effect, elapsed, strength, surface, subject);
    target.restore();
    return;
  }
  if (auraEnergyEffects.includes(effect)) {
    if (effect === 'Wings' && subject.bodySource) {
      paintBehindBody(target, subject, layer => drawBodyEnergy(layer, effect, elapsed, strength, subject));
    } else drawBodyEnergy(target, effect, elapsed, strength, subject);
    target.restore();
    return;
  }
  if (cloneTrailEffects.includes(effect)) {
    drawBodyTrail(target, effect, elapsed, strength, surface, subject);
    target.restore();
    return;
  }
  if (outlineEffects.includes(effect)) {
    drawSubjectOutline(target, effect, elapsed, strength, subject);
    target.restore();
    return;
  }
  if (subjectEffects.includes(effect)) {
    drawSubjectEffect(target, effect, elapsed, strength, surface, subject);
    target.restore();
    return;
  }
  elapsed *= presetRatio(options, 'speed');
  if (effect === 'Stylize') {
    const scale = Math.min(1, 256 / Math.max(w, h));
    const poster = surface('poster', Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    drawStylize(target, poster, elapsed, strength, options);
    target.restore();
    return;
  }
  if (effect === 'Nightclub') {
    drawNightclub(target, elapsed, strength, options);
    target.restore();
    return;
  }
  const source = surface('source');
  source.clearRect(0, 0, w, h);
  source.drawImage(frame, 0, 0);
  if (effect === 'Cinematic') {
    drawCinematic(target, source.canvas, elapsed, strength, options);
  } else if (effect === 'Camera Shake') {
    const motion = strength * presetRatio(options, 'movement');
    const x = Math.sin(elapsed * 43) * w * .022 * motion;
    const y = Math.cos(elapsed * 35 + .7) * h * .023 * motion;
    const crop = .035 * motion;
    target.drawImage(source.canvas, -crop * w + x, -crop * h + y, w * (1 + 2 * crop), h * (1 + 2 * crop));
  } else if (trendingEffects.includes(effect)) {
    drawTrendingEffect(target, source.canvas, effect, elapsed, strength, beat, options);
  } else if (lightVideoEffects.includes(effect)) {
    drawLightVideoEffect(target, source.canvas, effect, elapsed, strength, surface, options);
  } else if (blurVideoEffects.includes(effect)) {
    drawBlurVideoEffect(target, source.canvas, effect, elapsed, strength, surface, options);
  } else if (retroVideoEffects.includes(effect) && effect !== 'VHS') {
    drawRetroVideoEffect(target, source.canvas, effect, elapsed, strength, surface, stock, options);
  } else if (partyVideoEffects.includes(effect)) {
    drawPartyVideoEffect(target, source.canvas, effect, elapsed, strength, beat, options);
  } else if (textureVideoEffects.includes(effect)) {
    drawTextureVideoEffect(target, source.canvas, effect, elapsed, strength, options);
  } else if (artisticVideoEffects.includes(effect)) {
    drawArtisticVideoEffect(target, source.canvas, effect, elapsed, strength, surface, options);
  } else if (splitVideoEffects.includes(effect)) {
    drawSplitVideoEffect(target, source.canvas, effect, elapsed, strength, options);
  } else if (frameVideoEffects.includes(effect)) {
    drawFrameVideoEffect(target, effect, elapsed, strength, bounds, options);
  } else if (effect === 'RGB Split') {
    const channel = surface('channel');
    const offset = w * (.009 + .007 * Math.sin(elapsed * 14) ** 2) * strength * presetRatio(options, 'shift');
    target.fillStyle = '#000';
    target.fillRect(0, 0, w, h);
    target.globalCompositeOperation = 'lighter';
    for (const [color, shift] of [['#ff0000', -offset], ['#00ff00', 0], ['#0000ff', offset]]) {
      channel.drawImage(source.canvas, 0, 0);
      channel.globalCompositeOperation = 'multiply';
      channel.fillStyle = color;
      channel.fillRect(0, 0, w, h);
      channel.globalCompositeOperation = 'source-over';
      target.drawImage(channel.canvas, shift, 0);
    }
  } else if (effect !== 'VHS') {
    drawGlitchVideoEffect(target, source.canvas, effect, elapsed, strength, surface, options);
  } else {
    const line = Math.max(1, Math.round(h / 100 * presetRatio(options, 'pitch')));
    const timeIndex = Math.floor(elapsed * 24);
    const tear = Math.floor(h * (.1 + .8 * ((elapsed * .63) % 1)));
    const band = Math.min(h - tear, line * 4);
    const shift = Math.round(Math.sin(timeIndex * 2.1) * w * .055 * strength * presetRatio(options, 'shift'));
    target.drawImage(source.canvas, 0, tear, w, band, shift, tear, w, band);
    target.globalAlpha = strength;
    target.fillStyle = '#16102a55';
    for (let y = timeIndex % (line * 2); y < h; y += line * 2) target.fillRect(0, y, w, line);
    target.fillStyle = '#d9fff8a0';
    for (let i = 0; i < Math.round(22 * presetRatio(options, 'density')); i++) {
      const x = ((i * 313 + timeIndex * 53) % 997) / 997 * w;
      const y = ((i * 719 + timeIndex * 127) % 991) / 991 * h;
      target.fillRect(x, y, w * (.008 + (i % 5) * .004), line);
    }
  }
  target.restore();
}
const fades = { Black: '#000', White: '#fff' };
const fadeAnimations = ['Opacity Fade', 'Dissolve', 'Blur', 'Focus'];
const motionAnimations = ['Slide + Fade', 'Mini-Zoom + Fade'];
const zoomAnimations = ['Zoom In', 'Zoom Out', 'Mini Zoom', 'Crystal Zoom', 'Bounce In', 'Elastic In', 'Pop In', 'Expand', 'Unfold'];
const zoomExitAnimations = ['Zoom Out', 'Zoom In', 'Mini Zoom', 'Crystal Zoom', 'Bounce Out', 'Elastic Out',
  'Pop Out', 'Shrink', 'Collapse', 'Fold Out'];
const rotationAnimations = ['Rotate', 'Spin In', 'Spin Up', 'Flip', 'Page Turn', 'Fold In', 'Swing In', 'Pendulum'];
const rotationExitAnimations = ['Rotate Out', 'Spin Out', 'Spin Down', 'Fall Down', 'Flip', 'Page Turn',
  'Page Curl', 'Peel Off', 'Whirlwind', 'Swing Out', 'Pendulum'];
const glitchAnimations = ['Vertical Shake', 'Horizontal Shake', 'Glitch In', 'RGB Split', 'Chromatic Aberration', 'Flicker', 'Strobe', 'Stretch In', 'Warp In'];
const glitchExitAnimations = ['Vertical Shake', 'Horizontal Shake', 'Glitch Out', 'RGB Split',
  'Chromatic Aberration', 'TV Off', 'Shatter', 'Pixelate Out', 'Flash Out', 'Flicker', 'Strobe',
  'Stretch Out', 'Warp Out'];
const pixelateBuffer = document.createElement('canvas').getContext('2d');
const perspectiveAnimations = ['3D Zoom', 'Cube Flip', 'Tilt In', 'Slant In', 'Roll In'];
const cameraCombos = ['3D Zoom', '3D Zoom Pro', 'Distort Left', 'Distort Right', 'Stretch and Distort', 'Pan Left', 'Pan Right', 'Train'];
const rotationCombos = ['Spinning Top', 'Spin and Zoom', 'Spin Rise', 'Spin Fall', 'Flip', 'Roll',
  'Twirl', 'Whirl', 'Ferris Wheel', 'Pirate Ship', 'Roller Coaster'];
const splitCombos = ['Bisect', 'Split Vertical', 'Split Horizontal', 'Unfold', 'Enlarge'];
const chainedCombos = ['Fade In + Zoom Out', 'Zoom In + Fade Out', 'Slide Left + Slide Right',
  'Bounce In + Bounce Out', 'Spinning Top Left + Spinning Top Right'];
const comboGroups = {
  'Zoom and Bounce': ['Zoom', 'Bounce', 'Pendulum', 'Wobble', 'Rock Vertically', 'Rock Horizontally'],
  '3D and Camera Movement': cameraCombos,
  'Rotations & Spins': rotationCombos,
  'Splits and Mirrors': splitCombos,
  'Chained Combo Presets': chainedCombos
};
const comboTypes = Object.values(comboGroups).flat();
const dissolveMask = document.createElement('canvas').getContext('2d');
dissolveMask.canvas.width = 64;
dissolveMask.canvas.height = 36;
const dissolvePixels = dissolveMask.createImageData(64, 36);
const animationLayers = new WeakMap();

function animationType(clip, edge) {
  return clip[edge] ?? clip[edge === 'entrance' ? 'fadeIn' : 'fadeOut'] ?? '';
}

function animationDuration(clip, edge) {
  return clip[edge + 'Duration'] ?? (clip[edge] === undefined ? clip.fadeDuration : undefined) ?? defaultFadeDuration;
}

function animationLengths(clip) {
  const total = length(clip);
  const entrance = animationType(clip, 'entrance') ? Math.min(total, animationDuration(clip, 'entrance')) : 0;
  const exit = animationType(clip, 'exit') ? Math.min(total, animationDuration(clip, 'exit')) : 0;
  const ratio = entrance + exit > total ? total / (entrance + exit) : 1;
  return { entrance: entrance * ratio, exit: exit * ratio };
}

function clipAnimationAt(clip, elapsed) {
  const durations = animationLengths(clip);
  const remaining = length(clip) - elapsed;
  const edge = elapsed < durations.entrance ? 'entrance' : remaining < durations.exit ? 'exit' : null;
  if (!edge) return null;
  const type = animationType(clip, edge);
  const slot = clip.track === 'title' ? (edge === 'entrance' ? 'textIn' : 'textOut') : edge;
  const options = presetOptions(clip, slot, type);
  const progress = presetProgress(clamp((edge === 'entrance' ? elapsed : remaining) / durations[edge], 0, 1), options, edge === 'exit');
  const alpha = presetMotionAlpha(progress, options);
  const direction = clip[edge + 'Direction'] ?? (edge === 'entrance' ? 'Left' : 'Right');
  return { type, edge, alpha, progress, seconds: progress * durations[edge], direction, options };
}

function applyZoomAnimation(target, { type, edge, progress: t, alpha, options }) {
  const { width, height } = target.canvas;
  let x = 1;
  let y = 1;
  let shear = 0;
  const magnify = edge === 'exit' ? type === 'Zoom In' : type === 'Zoom Out';
  if (type === 'Zoom In' || type === 'Zoom Out') {
    x = y = magnify ? 1 + .75 * (1 - alpha) : .45 + .55 * alpha;
  }
  else if (type === 'Mini Zoom') x = y = .87 + .13 * alpha;
  else if (type === 'Crystal Zoom') x = y = 1 + .44 * (1 - alpha);
  else if (type === 'Bounce In' || type === 'Bounce Out') {
    const bounce = 1 - Math.abs(Math.cos(t * Math.PI * 2.7)) * (1 - t) ** 2;
    x = y = type === 'Bounce Out' ? bounce : .18 + .82 * bounce;
  } else if (type === 'Elastic In' || type === 'Elastic Out') {
    x = y = 1 - (1 - t) ** 3 * Math.cos(t * Math.PI * 3.4);
  } else if (type === 'Pop In' || type === 'Pop Out') {
    const back = t - 1;
    x = y = 1 + 2.3 * back ** 3 + 1.3 * back ** 2;
  } else if (type === 'Expand') {
    x = Math.min(1, .08 + 1.2 * alpha);
    y = .08 + .92 * alpha ** 1.55;
  } else if (type === 'Unfold') {
    y = .035 + .965 * Math.sin(t * Math.PI / 2);
    shear = (1 - alpha) * .12;
  } else if (type === 'Shrink') {
    x = y = alpha ** .68;
  } else if (type === 'Collapse') {
    x = .025 + .975 * t ** .53;
    y = t ** 2.3;
  }
  const zoom = presetRatio(options, 'zoom');
  if (zoom !== 1) {
    x = Math.max(0, 1 + (x - 1) * zoom);
    y = Math.max(0, 1 + (y - 1) * zoom);
    shear *= zoom;
  }
  target.translate(width / 2, height / 2);
  target.transform(x, shear, 0, y, 0, 0);
  target.translate(-width / 2, -height / 2);
}

function clipDirectionalReveal(target, x, y, progress, slope) {
  const { width: w, height: h } = target.canvas;
  target.beginPath();
  if (x) {
    const edge = w * (x < 0 ? progress : 1 - progress);
    const wall = x < 0 ? 0 : w;
    target.moveTo(wall, 0);
    target.lineTo(edge + w * slope, 0);
    target.lineTo(edge - w * slope, h);
    target.lineTo(wall, h);
  } else {
    const edge = h * (y < 0 ? progress : 1 - progress);
    const wall = y < 0 ? 0 : h;
    target.moveTo(0, wall);
    target.lineTo(0, edge + h * slope);
    target.lineTo(w, edge - h * slope);
    target.lineTo(w, wall);
  }
  target.closePath();
  target.clip();
}

function applySlideAnimation(target, { type, edge, progress, alpha, options }) {
  const { width, height } = target.canvas;
  const leaving = edge === 'exit';
  const remaining = 1 - progress;
  const distance = presetRatio(options, 'travel');
  if (type === 'Drop Out') {
    target.translate(width / 2, height / 2 + height * 1.15 * remaining ** 2 * distance);
    target.rotate(.19 * remaining ** 2);
    target.translate(-width / 2, -height / 2);
    return;
  }
  if (type === 'Fly Out') {
    const travel = 1 - alpha;
    target.translate(width * (.5 + travel * .86 * distance), height * (.5 - travel * .93 * distance));
    target.rotate(-.24 * travel);
    target.scale(1 - .26 * travel, 1 - .26 * travel);
    target.translate(-width / 2, -height / 2);
    return;
  }
  const [family, direction] = type.split(' ');
  const [x, y] = motionDirections[direction];
  if (family === 'Wipe' || (leaving && family === 'Swipe')) {
    const slope = family === 'Swipe' ? Math.sin(Math.PI * alpha) * .16 : 0;
    clipDirectionalReveal(target, x, y, alpha, slope);
    return;
  }
  if (family === 'Swipe') {
    const w = x ? width * alpha : width;
    const h = y ? height * alpha : height;
    target.beginPath();
    target.rect(x < 0 ? width - w : 0, y < 0 ? height - h : 0, w, h);
    target.clip();
    return;
  }
  if (family === 'Slide') {
    const travel = leaving ? 1 - alpha : alpha - 1;
    target.translate(x * width * travel * distance, y * height * travel * distance);
    return;
  }
  const offset = (leaving ? 1 : -1) * (2.4 * remaining ** 3 - 1.4 * remaining ** 2);
  const stretch = .16 * Math.sin(progress * Math.PI);
  target.translate(width * (.5 + x * offset * distance), height * (.5 + y * offset * distance));
  target.scale(1 + Math.abs(x) * stretch, 1 + Math.abs(y) * stretch);
  target.translate(-width / 2, -height / 2);
}

function applyRotationEntrance(target, { type, progress, alpha, options }) {
  const { width: w, height: h } = target.canvas;
  const remaining = 1 - alpha;
  if (type === 'Flip') {
    const angle = remaining * Math.PI;
    target.translate(w / 2, h / 2);
    target.transform(Math.cos(angle), .11 * Math.sin(angle), 0, 1, 0, 0);
    target.translate(-w / 2, -h / 2);
    target.filter = 'brightness(' + (.65 + .35 * alpha) + ')';
    return;
  }
  const hinged = type === 'Swing In' || type === 'Pendulum';
  const pivotY = hinged ? h * .11 : h / 2;
  let angle;
  let scale = 1;
  let rise = 0;
  if (type === 'Rotate') {
    angle = -remaining * Math.PI / 2;
  } else if (type === 'Spin In') {
    angle = -remaining * Math.PI * 2;
    scale = .18 + .82 * alpha;
  } else if (type === 'Spin Up') {
    angle = remaining * Math.PI * 1.5;
    scale = .7 + .3 * alpha;
    rise = h * .85 * remaining;
  } else {
    const swings = type === 'Swing In' ? 1.4 : 3.6;
    angle = -Math.cos(progress * Math.PI * swings) * remaining ** 1.45 * (type === 'Swing In' ? .92 : .66);
  }
  target.translate(w / 2, pivotY + rise);
  target.rotate(angle * presetRatio(options, 'turn'));
  target.scale(scale, scale);
  target.translate(-w / 2, -pivotY);
}

function applyRotationExit(target, { type, alpha, progress, options }) {
  const { width: w, height: h } = target.canvas;
  const travel = 1 - alpha;
  let angle = 0;
  let scale = 1;
  let drop = 0;
  let pivot = h / 2;
  target.globalAlpha *= clamp(progress * 4, 0, 1);
  switch (type) {
    case 'Rotate Out':
      angle = travel * Math.PI / 2;
      scale = 1 - .35 * travel;
      break;
    case 'Spin Out':
      angle = travel * Math.PI * 2;
      scale = alpha;
      break;
    case 'Spin Down':
      angle = travel * Math.PI * 1.5;
      drop = h * travel;
      scale = 1 - .45 * travel;
      break;
    case 'Fall Down':
      drop = h * 1.15 * travel ** 2;
      angle = .28 * travel;
      break;
    case 'Flip': {
      const turn = travel * Math.PI / 2;
      target.translate(w / 2, h / 2);
      target.transform(Math.cos(turn), -.18 * Math.sin(turn), 0, 1, 0, 0);
      target.translate(-w / 2, -h / 2);
      target.filter = 'brightness(' + (1 - .35 * travel) + ')';
      return;
    }
    case 'Swing Out':
      pivot = h * .08;
      angle = -travel * Math.PI * .68;
      break;
    case 'Pendulum':
      pivot = h * .08;
      angle = Math.sin(travel * Math.PI * 3) * travel * 1.15;
      scale = 1 - .7 * travel;
      break;
  }
  target.translate(w / 2, pivot + drop);
  target.rotate(angle * presetRatio(options, 'turn'));
  target.scale(scale, scale);
  target.translate(-w / 2, -pivot);
}

function applyClipAnimation(target, animation) {
  if (animation.type === 'Lens Open' || animation.type === 'Lens Close') {
    clipLensIris(target, animation.alpha, presetValue(animation.options, 'blades'));
    return;
  }
  if ((animation.edge === 'exit' ? zoomExitAnimations : zoomAnimations).includes(animation.type)) {
    applyZoomAnimation(target, animation);
    return;
  }
  if ((animation.edge === 'exit' ? slideExitAnimations : slideAnimations).includes(animation.type)) {
    applySlideAnimation(target, animation);
    return;
  }
  if ((animation.edge === 'exit' ? rotationExitAnimations : rotationAnimations).includes(animation.type)) {
    if (animation.edge === 'exit') applyRotationExit(target, animation);
    else applyRotationEntrance(target, animation);
    return;
  }
  const { width, height } = target.canvas;
  const amount = 1 - animation.alpha;
  if (animation.type !== 'Focus' && animation.type !== 'Dissolve') target.globalAlpha *= animation.alpha;
  if (animation.type === 'Slide + Fade') {
    const [x, y] = motionDirections[animation.direction];
    const distance = amount * presetRatio(animation.options, 'travel');
    target.translate(x * width * .32 * distance, y * height * .32 * distance);
  } else if (animation.type === 'Mini-Zoom + Fade') {
    const zoom = amount * presetRatio(animation.options, 'zoom');
    const scale = 1 - .18 * zoom;
    target.translate(width * zoom * .09, height * zoom * .09);
    target.scale(scale, scale);
  } else if (animation.type === 'Blur' || animation.type === 'Focus') {
    const focus = animation.type === 'Focus';
    const radius = Math.min(width, height) * amount * (focus ? .032 : .056) * presetRatio(animation.options, 'radius');
    target.filter = 'blur(' + radius + 'px)';
    if (focus) {
      const bump = amount * .07;
      target.translate(-width * bump / 2, -height * bump / 2);
      target.scale(1 + bump, 1 + bump);
    }
  }
}

function clipLensIris(target, alpha, blades) {
  const { width, height } = target.canvas;
  const radius = Math.hypot(width, height) * alpha / (2 * Math.cos(Math.PI / blades));
  target.beginPath();
  for (let blade = 0; blade < blades; blade++) {
    const angle = (blade / blades + (1 - alpha) * .14) * Math.PI * 2;
    const x = width / 2 + Math.cos(angle) * radius;
    const y = height / 2 + Math.sin(angle) * radius;
    if (blade === 0) target.moveTo(x, y);
    else target.lineTo(x, y);
  }
  target.closePath();
  target.clip();
}

function dissolveClipLayer(layer, alpha) {
  const { data } = dissolvePixels;
  for (let i = 0; i < data.length; i += 4) {
    const threshold = ((Math.imul((i / 4 + 1) ^ 0x9e37, 0x45d9f3b) ^ (i << 13)) >>> 0) / 4294967296;
    data[i + 3] = 255 * clamp((alpha - threshold * .9) / .1, 0, 1);
  }
  dissolveMask.putImageData(dissolvePixels, 0, 0);
  layer.save();
  layer.imageSmoothingEnabled = false;
  layer.globalCompositeOperation = 'destination-in';
  layer.drawImage(dissolveMask.canvas, 0, 0, layer.canvas.width, layer.canvas.height);
  layer.restore();
}
const defaultFadeDuration = .5;
const basicTransitions = ['Page Curl', 'Cross Dissolve', 'Luma Wipe'];
const motionDirections = { Left: [-1, 0], Right: [1, 0], Up: [0, -1], Down: [0, 1] };
const slideAnimations = ['Slide', 'Swipe', 'Push'].flatMap(family =>
  Object.keys(motionDirections).map(direction => family + ' ' + direction));
const slideExitAnimations = [
  ...['Slide', 'Wipe', 'Swipe', 'Push'].flatMap(family => Object.keys(motionDirections).map(direction => family + ' ' + direction)),
  'Drop Out', 'Fly Out'
];
const motionPresets = [
  ...['Wipe', 'Slide', 'Swipe'].flatMap(family => Object.keys(motionDirections).map(direction => family + ' ' + direction)),
  'Spin Clockwise', 'Spin Counterclockwise', 'Zoom In', 'Zoom Out', 'Whirl'
];
const cameraPresets = ['Vertical Blur', 'Shaky Inhale', 'Slow-Motion Blur'];
const distortionPresets = ['RGB Glitch', 'RGB Split', 'Flicker'];
const revealPresets = ['3D Cube', 'Mask Reveal', 'Transformation Cut'];
const rhythmPresets = ['Speed Ramp', 'Beat Sync', 'AI-assisted'];
const transitionTypes = [...basicTransitions, ...motionPresets, ...cameraPresets, ...distortionPresets, ...revealPresets, ...rhythmPresets];
const tempoProgress = progress => progress - 1.8 * progress ** 2 * (1 - progress);
const audioOnsetCache = new WeakMap();
const sceneAnalysis = document.createElement('canvas');
sceneAnalysis.width = 16;
sceneAnalysis.height = 9;
const sceneContext = sceneAnalysis.getContext('2d', { willReadFrequently: true });

function sceneFeatures(image) {
  sceneContext.drawImage(image, 0, 0, 16, 9);
  const { data } = sceneContext.getImageData(0, 0, 16, 9);
  let luma = 0;
  let color = 0;
  let detail = 0;
  let previous = 0;
  for (let i = 0; i < data.length; i += 4) {
    const value = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
    luma += value;
    color += (data[i] - data[i + 2]) / 255;
    if (i % 64) detail += Math.abs(value - previous);
    previous = value;
  }
  return { luma: luma / 144, color: color / 144, detail: detail / 135 };
}

function assetFeatures(asset) {
  if (!asset.features && asset.type === 'image' && (asset.media.naturalWidth || asset.media.width)) {
    asset.features = sceneFeatures(asset.media);
  }
  return asset.features;
}

function suggestedTransition(from, to) {
  if (!from || !to) return 'Cross Dissolve';
  if (Math.abs(from.luma - to.luma) > .22) return 'Luma Wipe';
  if (Math.abs(from.color - to.color) > .35 || Math.abs(from.detail - to.detail) > .12) return 'Zoom In';
  return 'Cross Dissolve';
}

function detectAudioOnsets(audio) {
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
  const hop = Math.round(audio.sampleRate / 50);
  const peaks = [];
  let average = .001;
  let previous = 0;
  for (let i = 0; i < audio.length; i += hop) {
    let squares = 0;
    const end = Math.min(i + hop, audio.length);
    for (const samples of channels) {
      for (let j = i; j < end; j++) squares += samples[j] ** 2;
    }
    const energy = Math.sqrt(squares / ((end - i) * channels.length));
    if (energy > .018 && energy > average * 1.6 && energy - previous > .025) {
      const at = i / audio.sampleRate;
      if (!peaks.length || at - peaks[peaks.length - 1] >= .16) peaks.push(at);
    }
    previous = energy;
    average = average * .94 + energy * .06;
  }
  return peaks;
}

function audioOnsets(asset) {
  asset = asset.sourceVideo ?? asset;
  if (!audioOnsetCache.has(asset)) {
    const entry = { peaks: [], done: Promise.resolve() };
    audioOnsetCache.set(asset, entry);
    if (asset.url && globalThis.OfflineAudioContext) {
      entry.done = (async () => {
        try {
          entry.peaks = detectAudioOnsets(await decodeSourceAudio(asset));
        } catch {
          // Some videos have no decodable audio track.
        }
        if (!playback && !exporting) draw();
      })();
    }
  }
  return audioOnsetCache.get(asset);
}

function beatSources(visual, next, span) {
  return clips.filter(clip => (clip.track === 'audio' || clip === visual) && clipHasVolume(clip) &&
    clip.at < next.at + span / 2 && clip.at + length(clip) > next.at - span / 2 &&
    ['audio', 'video'].includes(assets.get(clip.asset)?.type));
}

function beatProgress(visual, next, span) {
  const start = next.at - span / 2;
  const end = next.at + span / 2;
  const preferred = start + span * .62;
  let nearest = Infinity;
  let beat = .62;
  for (const clip of beatSources(visual, next, span)) {
    const peaks = audioOnsets(assets.get(clip.asset)).peaks;
    const offset = clip.at - clip.start;
    let low = 0;
    let high = peaks.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (peaks[mid] + offset < preferred) low = mid + 1;
      else high = mid;
    }
    for (const onset of [peaks[low - 1], peaks[low]]) {
      const at = onset + offset;
      if (!Number.isFinite(at) || onset < clip.start || onset >= clip.end || at <= start || at >= end) continue;
      const distance = Math.abs(at - preferred);
      if (distance < nearest) {
        nearest = distance;
        beat = (at - start) / span;
      }
    }
  }
  return beat;
}
const transitionFrames = new WeakMap();
const slowMotionProgress = progress => progress * (1 - .3 * progress);
const transitionLayer = document.createElement('canvas');
const transitionContext = transitionLayer.getContext('2d');
const lumaMask = document.createElement('canvas');
lumaMask.width = 96;
lumaMask.height = 54;
const lumaContext = lumaMask.getContext('2d', { willReadFrequently: true });

function nextVisual(clip, order = videoTrackOrder()) {
  const next = order[order.indexOf(clip) + 1];
  return next && Math.abs(next.at - (clip.at + length(clip))) < 1e-6 ? next : null;
}

function cutTransition(clip, next) {
  return clip.transition?.to === next.id ? clip.transition : null;
}

// A transition is centred on its cut: it takes half its duration from each side. The limit counts the
// neighbouring transition on the far side of each clip so the two windows never overlap inside a clip.
const basicTransitionMax = (clip, next) => Math.min(10, length(clip) * 2, length(next) * 2);

function neighbourTransition(clip, next) {
  const setting = next && cutTransition(clip, next);
  if (!setting) return 0;
  const max = basicTransitionMax(clip, next);
  return clamp(setting.duration, Math.min(.05, max), max);
}

function maxTransitionDuration(clip, next) {
  const prev = clips.find(item => item.track === 'visual' && item.transition?.to === clip.id && Math.abs(item.at + length(item) - clip.at) < 1e-6);
  const after = next.transition && clips.find(item => item.id === next.transition.to && Math.abs(next.at + length(next) - item.at) < 1e-6);
  const before = prev ? neighbourTransition(prev, clip) : 0;
  const later = after ? neighbourTransition(next, after) : 0;
  return Math.max(0, Math.min(10, (length(clip) - before / 2) * 2, (length(next) - later / 2) * 2));
}

function transitionDuration(clip, next, requested) {
  const max = maxTransitionDuration(clip, next);
  return clamp(requested, Math.min(.05, max), max);
}

function previewTransition(clip, next) {
  const setting = cutTransition(clip, next);
  seek(next.at);
}

// Seconds of footage a centred transition has to repeat because the media ends (outgoing, past the out-point)
// or starts (incoming, before the in-point) too soon. Video only: stills never run out.
function transitionHolds(clip, next, seconds) {
  const outgoing = assets.get(clip.asset);
  const incoming = assets.get(next.asset);
  const outAvailable = outgoing?.type === 'video' ? Math.max(0, outgoing.duration - 1 / 30 - clip.end) : Infinity;
  const inAvailable = incoming?.type === 'video' ? Math.max(0, next.start) : Infinity;
  const hold = value => value > 1 / 30 ? value : 0;
  return { out: hold(seconds / 2 - outAvailable), outAvailable, in: hold(seconds / 2 - inAvailable), inAvailable };
}

function transitionHoldNote(clip, next, seconds) {
  const holds = transitionHolds(clip, next, seconds);
  const parts = [];
  if (holds.in) {
    parts.push('The incoming clip has ' + (holds.inAvailable < .02 ? 'no footage' : 'only ' + holds.inAvailable.toFixed(1) + ' s of footage') +
      ' before its in-point, so it holds its first frame for ' + holds.in.toFixed(1) + ' s.');
  }
  if (holds.out) {
    parts.push('The outgoing clip has ' + (holds.outAvailable < .02 ? 'no footage' : 'only ' + holds.outAvailable.toFixed(1) + ' s of footage') +
      ' after its out-point, so it holds its last frame for ' + holds.out.toFixed(1) + ' s.');
  }
  return parts.join(' ');
}

function setCutTransition(clip, next, type, duration) {
  if (!transitionTypes.includes(type) && type !== '') return;
  duration = transitionDuration(clip, next, duration);
  const setting = cutTransition(clip, next);
  if ((setting?.type ?? '') === type && (!type || setting.duration === duration)) return;
  remember();
  if (type) {
    clip.transition = { to: next.id, type, duration };
  } else {
    delete clip.transition;
  }
  previewTransition(clip, next);
  refresh();
}

let openCut = null;

function syncCutMenu() {
  const menu = $('cutMenu');
  if (!menu.matches(':popover-open')) return;
  const clip = clips.find(item => item.id === openCut?.from);
  const next = clip && nextVisual(clip);
  const marker = clip && document.querySelector('[data-cut="' + CSS.escape(clip.id) + '"]');
  if (!marker || !next || next.id !== openCut.to) {
    menu.hidePopover();
    return;
  }
  const setting = cutTransition(clip, next);
  $('cutType').value = setting?.type ?? '';
  const max = maxTransitionDuration(clip, next);
  $('cutDuration').min = Math.min(.05, max);
  $('cutDuration').max = max;
  $('cutDuration').value = Number(transitionDuration(clip, next, setting?.duration ?? defaultFadeDuration).toFixed(2));
  $('cutDurationRow').hidden = $('cutRemove').hidden = !setting;
  const note = setting ? transitionHoldNote(clip, next, transitionDuration(clip, next, setting.duration)) : '';
  $('cutNote').textContent = note;
  $('cutNote').hidden = !note;
  const rect = marker.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = clamp(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, innerWidth - width - 8)) + 'px';
  menu.style.top = clamp(rect.top - height - 8, 8, Math.max(8, innerHeight - height - 8)) + 'px';
}

function openCutMenu(clip, next, marker) {
  const menu = $('cutMenu');
  if (menu.matches(':popover-open')) menu.hidePopover();
  openCut = { from: clip.id, to: next.id };
  pause();
  previewTransition(clip, next);
  menu.showPopover({ source: marker });
  syncCutMenu();
  $('cutType').focus({ preventScroll: true });
}

function editOpenCut(type, duration) {
  const clip = clips.find(item => item.id === openCut?.from);
  const next = clip && nextVisual(clip);
  if (next && next.id === openCut.to) setCutTransition(clip, next, type, duration);
  syncCutMenu();
}

// Per-clip clones used to draw the incoming side of a cut (key 'in:<clip id>', starting before its in-point) and the
// outgoing side (key 'out:<clip id>', running past its out-point; also the remapped side of Speed Ramp / Slow-Motion Blur). Each entry keeps a
// last-good-frame canvas so a seek in flight never drops or stutters the transition.
const incomingClones = new Map();
const incomingLead = 1.5;

function releaseIncoming(key) {
  const entry = incomingClones.get(key);
  if (!entry) return;
  entry.live = false;
  entry.media.pause();
  entry.media.removeAttribute('src');
  entry.media.load();
  incomingClones.delete(key);
}

function incomingMedia(asset, key) {
  if (asset.type !== 'video') return null;
  let entry = incomingClones.get(key);
  if (entry && entry.asset !== asset) {
    releaseIncoming(key);
    entry = null;
  }
  if (!entry) {
    const media = asset.media.cloneNode();
    media.preload = 'auto';
    media.muted = true;
    const frame = document.createElement('canvas');
    frame.readyState = 4;
    entry = { asset, media, frame, frameContext: frame.getContext('2d'), hasFrame: false, live: false, target: 0, targetAt: 0, seekTo: -1, capturedAt: -1 };
    Object.defineProperty(frame, 'currentTime', { get: () => media.currentTime });
    media.addEventListener('loadeddata', () => {
      if (!playback && !exporting) draw();
    });
    media.addEventListener('seeked', () => {
      if (incomingClones.get(key) !== entry) return;
      if (entry.live) {
        // Apply the latest target that arrived while this seek was pending.
        const latest = entry.target + (performance.now() - entry.targetAt) / 1000 * media.playbackRate;
        if (Math.abs(media.currentTime - latest) > .08) {
          entry.seekTo = latest;
          media.currentTime = latest;
        }
      } else if (!playback && !exporting) {
        draw();
      }
    });
    incomingClones.set(key, entry);
  }
  return entry;
}

function captureIncoming(entry) {
  const media = entry.media;
  if (media.readyState < 2 || media.seeking || !media.videoWidth || entry.capturedAt === media.currentTime) return;
  const scale = Math.min(1, 1920 / Math.max(media.videoWidth, media.videoHeight));
  const width = Math.round(media.videoWidth * scale);
  const height = Math.round(media.videoHeight * scale);
  const frame = entry.frame;
  if (frame.width !== width || frame.height !== height) {
    frame.width = frame.videoWidth = width;
    frame.height = frame.videoHeight = height;
  }
  entry.frameContext.drawImage(media, 0, 0, width, height);
  entry.capturedAt = media.currentTime;
  entry.hasFrame = true;
}

// Fresh frame when the clone has one, otherwise the last good frame; null only before any frame exists.
function incomingSource(entry) {
  captureIncoming(entry);
  return entry.hasFrame ? entry.frame : null;
}

// Keep a clone on the source time for this timeline position. While playing it plays muted and is drift-corrected
// like the main element; while paused it is seeked (before drawing) and stays paused.
function syncIncoming(entry, rawTarget, playing, rate = 1) {
  const media = entry.media;
  // Past the media (or before it) the boundary frame is held, one frame short of the end so it stays decodable.
  const last = Number.isFinite(media.duration) ? Math.max(0, media.duration - 1 / 30) : Infinity;
  const target = clamp(rawTarget, 0, last);
  playing = playing && rawTarget > .001 && rawTarget < last;
  entry.live = playing;
  entry.target = target;
  entry.targetAt = performance.now();
  if (media.playbackRate !== rate) media.playbackRate = rate;
  const tolerance = playing ? .08 : .025;
  if (Math.abs(media.currentTime - target) > tolerance && (!media.seeking || !playing && Math.abs(entry.seekTo - target) > tolerance)) {
    entry.seekTo = target;
    media.currentTime = target;
  }
  if (playing) {
    if (media.paused) media.play().catch(() => {});
  } else if (!media.paused) {
    media.pause();
  }
  captureIncoming(entry);
}

// Only cuts near the playhead keep live clones: windows that start within the lookahead (4 s playing or
// exporting, 2 s paused) or are still in progress / handing off, nearest first, at most incomingCap clones.
const incomingCap = 4;
let transitionCuts = [];
let transitionCutsKey = NaN;
const nearCuts = [null, null, null, null];
const nearDist = [0, 0, 0, 0];
const wantedCuts = [null, null, null, null];
let wantedCount = 0;
let wantedStamp = '';

function transitionCutsSignature() {
  let sum = clips.length;
  for (const clip of clips) {
    if (clip.track !== 'visual') continue;
    sum = sum * 31 % 1e9 + clip.at * 7 + clip.start * 3 + clip.end + (clip.transition ? clip.transition.duration + clip.transition.type.length + 5 : 0);
  }
  return sum + assets.size;
}

function rebuildTransitionCuts() {
  transitionCuts = [];
  const order = videoTrackOrder();
  for (const clip of order) {
    const next = clip.transition && nextVisual(clip, order);
    const setting = next && cutTransition(clip, next);
    if (!setting) continue;
    const span = transitionDuration(clip, next, setting.duration);
    // Centred window: the incoming clone starts span / 2 before the in-point, the outgoing clone runs past the out-point.
    const remapped = setting.type === 'Speed Ramp' || setting.type === 'Slow-Motion Blur';
    transitionCuts.push({ ws: next.at - span / 2, we: next.at + Math.max(span / 2, 1), inKey: 'in:' + next.id, inAsset: assets.get(next.asset),
      inAt: Math.max(0, next.start - span / 2), outKey: 'out:' + clip.id, outAsset: assets.get(clip.asset),
      outAt: Math.max(0, remapped ? clip.end - span / 2 : clip.end - .5 / 30), count: 2, stamp: next.id });
  }
}

function updateIncomingWindow(position, fast = false, force = false) {
  const signature = transitionCutsSignature();
  if (signature !== transitionCutsKey) {
    transitionCutsKey = signature;
    rebuildTransitionCuts();
    force = true;
  }
  const horizon = position + (fast ? 4 : 2);
  let found = 0;
  for (const cut of transitionCuts) {
    if (cut.ws > horizon || cut.we < position) continue;
    const dist = cut.ws > position ? cut.ws - position : 0;
    if (found === incomingCap && dist >= nearDist[found - 1]) continue;
    let index = found < incomingCap ? found++ : found - 1;
    while (index > 0 && nearDist[index - 1] > dist) {
      nearCuts[index] = nearCuts[index - 1];
      nearDist[index] = nearDist[index - 1];
      index--;
    }
    nearCuts[index] = cut;
    nearDist[index] = dist;
  }
  let used = 0;
  let count = 0;
  let stamp = '';
  for (let i = 0; i < found; i++) {
    const cut = nearCuts[i];
    if (used + cut.count > incomingCap) continue;
    used += cut.count;
    wantedCuts[count++] = cut;
    stamp += cut.stamp + ',';
  }
  if (!force && stamp === wantedStamp) return;
  wantedStamp = stamp;
  wantedCount = count;
  for (const key of [...incomingClones.keys()]) {
    let keep = false;
    for (let i = 0; i < count; i++) if (wantedCuts[i].inKey === key || wantedCuts[i].outKey === key) keep = true;
    if (!keep) releaseIncoming(key);
  }
  for (let i = 0; i < count; i++) {
    const cut = wantedCuts[i];
    const idle = position < cut.ws - incomingLead;
    const warm = (key, asset, at) => {
      const entry = asset && incomingMedia(asset, key);
      if (entry && idle && Math.abs(entry.media.currentTime - at) > .025) {
        entry.seekTo = at;
        entry.media.currentTime = at;
      }
    };
    warm(cut.inKey, cut.inAsset, cut.inAt);
    warm(cut.outKey, cut.outAsset, cut.outAt);
  }
}

function prewarmTransitions() {
  updateIncomingWindow(time, Boolean(playback), true);
}

function warmTransitions(timeout = 3000) {
  updateIncomingWindow(0, true, true);
  const waits = [...incomingClones.values()].map(entry => new Promise(resolve => {
    const media = entry.media;
    const check = () => {
      if (media.readyState < 2 || media.seeking) return;
      captureIncoming(entry);
      for (const event of ['seeked', 'loadeddata', 'canplay']) media.removeEventListener(event, check);
      resolve();
    };
    for (const event of ['seeked', 'loadeddata', 'canplay']) media.addEventListener(event, check);
    check();
  }));
  return Promise.race([Promise.all(waits), new Promise(resolve => setTimeout(resolve, timeout))]);
}

const keyframeEasings = {
  Linear: t => t,
  'Ease In': t => t * t,
  'Ease Out': t => 1 - (1 - t) ** 2,
  'Ease In/Out': t => t < .5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2
};

const easingHandles = {
  Linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
  'Ease In': [1 / 3, 0, 2 / 3, 1 / 3],
  'Ease Out': [1 / 3, 2 / 3, 2 / 3, 1],
  'Ease In/Out': [.43, 0, .57, 1]
};
const openKeyframeCurves = {};

function isKeyframeCurveOpen(field, clip, at) {
  const open = openKeyframeCurves[field];
  return open?.clip === clip.id && open.at === at;
}

function easingProgress(key, progress) {
  if (!key.curve) return (keyframeEasings[key.easing] ?? keyframeEasings.Linear)(progress);
  if (progress <= 0 || progress >= 1) return progress;
  const bezier = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  const [x1, y1, x2, y2] = key.curve;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (bezier(mid, x1, x2) < progress) low = mid;
    else high = mid;
  }
  return bezier((low + high) / 2, y1, y2);
}

function scalarKeyframeValueAt(keys, sourceTime, fallback) {
  if (!keys?.length) return fallback;
  if (sourceTime <= keys[0].at) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const right = keys[i];
    if (sourceTime > right.at) continue;
    const left = keys[i - 1];
    const progress = (sourceTime - left.at) / (right.at - left.at);
    return left.value + (right.value - left.value) * easingProgress(left, progress);
  }
  return keys[keys.length - 1].value;
}

const intensityKeyframes = { label: 'Intensity', sliderId: 'effectIntensity', field: 'effectIntensityKeys', base: 'effectIntensity', easing: true };
const volumeKeyframes = { label: 'Volume', sliderId: 'clipVolume', field: 'volumeKeys', base: 'volume', scale: 100, keepLastValue: true };

function effectIntensityAt(clip, sourceTime) {
  return scalarKeyframeValueAt(clip.effectIntensityKeys, sourceTime, clip.effectIntensity ?? 100);
}

function keyframeTime(clip) {
  const point = clip.start + time - clip.at;
  if (point <= clip.start + .0005) return clip.start;
  if (point >= clip.end - .0005) return clip.end;
  return Number(point.toFixed(3));
}

function seekClipKeyframe(clip, sourceTime) {
  seek(clip.at + Math.min(sourceTime - clip.start, length(clip) - .000001));
}

function writeScalarKeyframe(clip, field, at, value) {
  const original = clip[field] ?? [];
  const keys = original.filter(key => key.at !== at);
  keys.push({ ...original.find(key => key.at === at), at, value });
  clip[field] = keys.sort((a, b) => a.at - b.at);
}

let personModelRequested = false;
let maskPreviewClip = null;

function requestPersonModel() {
  if (personModelRequested) return;
  personModelRequested = true;
  loadPersonModel().then(() => draw(Boolean(playback))).catch(error => {
    notify('Person segmentation could not start. ' + error.message);
  });
}

function activeBackground(clip) {
  const background = clip.background;
  return background && background.mode !== 'original' ? background : null;
}

function cutoutLayer(frame) {
  if (!cutoutLayers.has(frame)) cutoutLayers.set(frame, document.createElement('canvas').getContext('2d'));
  const layer = cutoutLayers.get(frame);
  if (layer.canvas.width !== frame.width || layer.canvas.height !== frame.height) {
    layer.canvas.width = frame.width;
    layer.canvas.height = frame.height;
  }
  layer.clearRect(0, 0, frame.width, frame.height);
  return layer;
}

const adjustedMasks = new WeakMap();
const maskHistory = new WeakMap();

function readMask(mask) {
  const { width, height } = mask;
  const { data } = mask.getContext('2d').getImageData(0, 0, width, height);
  const pixels = new Float32Array(width * height);
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < pixels.length; i++) {
    const alpha = data[i * 4 + 3];
    pixels[i] = alpha;
    area += alpha;
    x += (i % width) * alpha;
    y += Math.floor(i / width) * alpha;
  }
  return { pixels, area, x: x / (area || 1), y: y / (area || 1) };
}

function stabilizeMask(target, clip, mask, time, strength) {
  const version = personMaskVersions.get(mask);
  const { width, height } = mask;
  let history = maskHistory.get(target);
  if (!history || history.clip !== clip.id || history.mask !== mask) {
    history = { clip: clip.id, mask, frame: null, layer: null };
    maskHistory.set(target, history);
  }
  if (history.frame?.version !== version || !history.frame) {
    const previous = history.frame;
    const raw = readMask(mask);
    let base = null;
    let dx = 0;
    let dy = 0;
    if (previous && time > previous.time && time - previous.time <= .24 &&
        previous.width === width && previous.height === height) {
      dx = raw.x - previous.raw.x;
      dy = raw.y - previous.raw.y;
      const distance = Math.hypot(dx, dy);
      const coverageChange = Math.min(raw.area, previous.raw.area) / Math.max(raw.area, previous.raw.area);
      if (distance <= Math.min(width, height) * .14 && coverageChange > .55) {
        base = previous.filtered;
        // Small detection jitter stays aligned to the frame; larger moves follow the subject.
        const shift = Math.max(0, 1 - 1.25 / (distance || 1));
        dx *= shift;
        dy *= shift;
      }
    }
    history.frame = { version, width, height, time, raw, base, dx, dy };
  }
  const frame = history.frame;
  if (frame.strength === strength) return frame.output;
  frame.strength = strength;
  frame.filtered = frame.raw.pixels;
  frame.output = mask;
  if (!strength || !frame.base) return mask;

  const layer = history.layer ??= document.createElement('canvas').getContext('2d');
  if (layer.canvas.width !== width || layer.canvas.height !== height) {
    layer.canvas.width = width;
    layer.canvas.height = height;
  }
  const image = layer.createImageData(width, height);
  const filtered = new Float32Array(width * height);
  const retention = strength / 100 * .88;
  const sample = (x, y) => x >= 0 && x < width && y >= 0 && y < height ? frame.base[y * width + x] : 0;
  for (let y = 0; y < height; y++) {
    const sy = y - frame.dy;
    const top = Math.floor(sy);
    const fy = sy - top;
    for (let x = 0; x < width; x++) {
      const sx = x - frame.dx;
      const left = Math.floor(sx);
      const fx = sx - left;
      const a = sample(left, top) * (1 - fx) + sample(left + 1, top) * fx;
      const b = sample(left, top + 1) * (1 - fx) + sample(left + 1, top + 1) * fx;
      const previous = a * (1 - fy) + b * fy;
      const i = y * width + x;
      const raw = frame.raw.pixels[i];
      const weight = retention * (1 - .55 * Math.abs(raw - previous) / 255);
      const alpha = raw + (previous - raw) * weight;
      filtered[i] = alpha;
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = alpha;
    }
  }
  layer.putImageData(image, 0, 0);
  personMaskVersions.set(layer.canvas, (personMaskVersions.get(layer.canvas) ?? 0) + 1);
  frame.filtered = filtered;
  frame.output = layer.canvas;
  return frame.output;
}


function morphAlpha(source, dest, width, height, distance, horizontal) {
  const radius = Math.floor(Math.abs(distance));
  const fraction = Math.abs(distance) - radius;
  const expand = distance > 0;
  const combine = expand ? Math.max : Math.min;
  const sample = (x, y) => x >= 0 && x < width && y >= 0 && y < height ? source[y * width + x] : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let alpha = source[y * width + x];
      for (let i = 1; i <= radius; i++) {
        alpha = horizontal ? combine(alpha, sample(x - i, y), sample(x + i, y))
          : combine(alpha, sample(x, y - i), sample(x, y + i));
      }
      if (fraction) {
        const edge = radius + 1;
        const outside = horizontal ? combine(sample(x - edge, y), sample(x + edge, y))
          : combine(sample(x, y - edge), sample(x, y + edge));
        alpha += (combine(alpha, outside) - alpha) * fraction;
      }
      dest[y * width + x] = alpha;
    }
  }
}

function backgroundMask(subject, background) {
  const { mask } = subject;
  const expand = background.expand ?? 0;
  const feather = background.feather ?? 0;
  if (!expand && !feather) return mask;

  const { width, height } = mask;
  const ratio = width / subject.width;
  const revision = personMaskVersions.get(mask);
  let cache = adjustedMasks.get(mask);
  const key = [revision, width, height, ratio, expand, feather].join(':');
  if (cache?.key === key) return cache.result;
  if (!cache) {
    const makeLayer = () => document.createElement('canvas').getContext('2d');
    cache = { edges: makeLayer(), soft: makeLayer() };
    adjustedMasks.set(mask, cache);
  }
  let output = mask;
  if (expand) {
    const edges = cache.edges;
    edges.canvas.width = width;
    edges.canvas.height = height;
    const image = mask.getContext('2d').getImageData(0, 0, width, height);
    const alpha = new Uint8ClampedArray(width * height);
    const pass = new Uint8ClampedArray(alpha.length);
    for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
    morphAlpha(alpha, pass, width, height, expand * ratio, true);
    morphAlpha(pass, alpha, width, height, expand * ratio, false);
    for (let i = 0; i < alpha.length; i++) {
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = alpha[i];
    }
    edges.putImageData(image, 0, 0);
    output = edges.canvas;
  }
  if (feather) {
    const soft = cache.soft;
    soft.canvas.width = width;
    soft.canvas.height = height;
    soft.filter = 'blur(' + feather * ratio + 'px)';
    soft.drawImage(output, 0, 0);
    output = soft.canvas;
  }
  cache.key = key;
  cache.result = output;
  return output;
}

function compositeBackground(target, foreground, background, subject) {
  const { width: w, height: h } = target.canvas;
  target.clearRect(0, 0, w, h);
  if (background.mode === 'color') {
    target.fillStyle = background.color;
    target.fillRect(0, 0, w, h);
  } else if (background.mode === 'image') {
    const image = backgroundImages.get(background.image)?.bitmap;
    if (image) {
      const scale = Math.max(w / image.width, h / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      target.drawImage(image, (w - width) / 2, (h - height) / 2, width, height);
    }
  }
  if (!subject) return;
  foreground.save();
  foreground.globalCompositeOperation = 'destination-in';
  foreground.drawImage(backgroundMask(subject, background), subject.x, subject.y, subject.width, subject.height);
  foreground.restore();
  target.drawImage(foreground.canvas, 0, 0);
}

function fittedVisualSize(media, frame) {
  const width = media?.videoWidth || media?.naturalWidth;
  const height = media?.videoHeight || media?.naturalHeight;
  if (!width || !height) return null;
  const scale = Math.min(frame.width / width, frame.height / height);
  return [width * scale, height * scale];
}

function drawVisual(target, media, clip, elapsed = 0, matteOnly = false, historyTarget = target.canvas) {
  const fitted = fittedVisualSize(media, target.canvas);
  if (!fitted || (media.readyState ?? 2) < 2) return false;
  const [w, h] = fitted;
  const x = (target.canvas.width - w) / 2;
  const y = (target.canvas.height - h) / 2;
  const sourceTime = clip.start + elapsed;
  const intensity = effectIntensityAt(clip, sourceTime) / 100;
  const background = activeBackground(clip);
  const bodyEffect = intensity && subjectEffects.includes(clip.effect);
  const locked = bodyEffect && clip.bodySubjectKeys?.length;
  const historyOnly = bodyEffect && !locked && isMotionTrail(clip.effect) && typeof media.currentTime === 'number';
  const trailSubject = historyOnly ? { bodySource: { media, visual: clip, position: clip.at + elapsed, x, y, width: w, height: h } } : null;
  let subject;
  let trackedEffectSubject;
  if (background || (bodyEffect && !historyOnly)) {
    requestPersonModel();
    const withPose = !locked && poseBodyEffects.includes(clip.effect);
    const mask = background || !locked ? personMaskFor(media, withPose) : null;
    if (mask) {
      subject = { mask, x, y, width: w, height: h };
      if (!locked && bodyEffect) {
        subject.bodySource = { ...subject, media, visual: clip, position: clip.at + elapsed };
      }
    }
    if (locked) {
      const tracked = lockedPersonFor(media, clip, sourceTime);
      if (tracked) {
        trackedEffectSubject = { mask: tracked.mask, x, y, width: w, height: h };
        trackedEffectSubject.bodySource = {
          ...trackedEffectSubject, media, visual: clip, position: clip.at + elapsed,
          joints: tracked.joints, subjectKey: tracked.key, identityNose: tracked.candidate
        };
      }
    }
  }
  const replacing = background && personModel;
  const rawSubject = subject;
  if (replacing && subject && typeof media.currentTime === 'number') {
    subject = { ...subject, mask: stabilizeMask(historyTarget, clip, subject.mask, media.currentTime, background.smoothing ?? 0) };
  } else {
    maskHistory.delete(historyTarget);
  }
  if (matteOnly) {
    if (replacing && subject) {
      target.drawImage(backgroundMask(subject, background), subject.x, subject.y, subject.width, subject.height);
    }
    return true;
  }
  const output = replacing ? cutoutLayer(target.canvas) : target;
  output.save();
  output.filter = visualClipFilter(clip);
  if (replacing) {
    output.fillStyle = '#08090b';
    output.fillRect(0, 0, output.canvas.width, output.canvas.height);
  }
  output.drawImage(media, x, y, w, h);
  output.restore();
  const beat = beatFlashEffects.includes(clip.effect) ? flashStrengthAt(clip.at + elapsed, sourceTime, clip) : undefined;
  const effectAfterCutout = replacing && (locked || outlineEffects.includes(clip.effect) ||
    cloneTrailEffects.includes(clip.effect) || poseBodyEffects.includes(clip.effect) || clip.effect === 'Rounded Corners');
  if (!effectAfterCutout) drawLayerEffect(output, clip, elapsed, locked ? trackedEffectSubject : trailSubject ?? rawSubject, beat, [x, y, w, h]);
  if (replacing) compositeBackground(target, output, background, subject);
  if (effectAfterCutout) drawLayerEffect(target, clip, elapsed, locked ? trackedEffectSubject : trailSubject ?? subject,
    beat, background.mode === 'remove' ? [x, y, w, h] : undefined);
  return true;
}

function animatedLayer(frame) {
  let layer = animationLayers.get(frame);
  if (!layer) {
    layer = document.createElement('canvas').getContext('2d');
    animationLayers.set(frame, layer);
  }
  if (layer.canvas.width !== frame.width || layer.canvas.height !== frame.height) {
    layer.canvas.width = frame.width;
    layer.canvas.height = frame.height;
  }
  layer.clearRect(0, 0, frame.width, frame.height);
  return layer;
}

function drawCrystalFacets(target, image, progress) {
  const { width: w, height: h } = image;
  const pulse = (1 - progress) * .7;
  const facets = [
    [[0, 0], [.43, 0], [.25, .54], [0, .36]],
    [[.43, 0], [1, 0], [.78, .49], [.25, .54]],
    [[0, .36], [.25, .54], [.56, 1], [0, 1]],
    [[.25, .54], [.78, .49], [1, 1], [.56, 1]],
    [[.78, .49], [1, 0], [1, 1]]
  ];
  for (const [index, points] of facets.entries()) {
    target.save();
    target.beginPath();
    target.moveTo(points[0][0] * w, points[0][1] * h);
    for (const [x, y] of points.slice(1)) target.lineTo(x * w, y * h);
    target.closePath();
    target.clip();
    target.globalAlpha = pulse;
    target.drawImage(image, Math.sin(index * 2.4) * w * pulse * .16, Math.cos(index * 1.8) * h * pulse * .15);
    target.restore();
  }
}

function drawPageTurn(target, image, alpha) {
  const { width: w, height: h } = image;
  const angle = (1 - alpha) * Math.PI / 2;
  const depth = Math.sin(angle);
  const projection = u => {
    const depthScale = 1 / (1 + .7 * u * depth);
    return { x: w * u * Math.cos(angle) * depthScale, depthScale };
  };
  const strips = Math.min(120, Math.max(32, Math.ceil(w / 12)));
  let left = projection(0);
  target.filter = 'brightness(' + (.62 + .38 * alpha) + ')';
  for (let i = 0; i < strips; i++) {
    const right = projection((i + 1) / strips);
    const start = Math.round(left.x);
    const width = Math.round(right.x) - start;
    if (width > 0) {
      const height = h * (left.depthScale + right.depthScale) / 2;
      target.drawImage(image, w * i / strips, 0, w / strips, h, start, (h - height) / 2, width, height);
    }
    left = right;
  }
}

function drawCurlExit(target, image, { type, alpha, options }) {
  const { width: w, height: h } = image;
  const travel = 1 - alpha;
  if (travel < .0001) {
    target.drawImage(image, 0, 0);
    return;
  }
  if (!alpha) return;
  const peeling = type === 'Peel Off';
  const depth = presetRatio(options, 'curl');
  const bands = Math.min(28, Math.ceil(h / 9));
  const strips = 8;
  const turn = Math.PI * (.5 + (peeling ? .37 : .26) * travel);
  const flatPage = new Path2D();
  const softShadow = new Path2D();
  const deepShadow = new Path2D();
  const highlight = new Path2D();
  const back = new Path2D();
  flatPage.moveTo(0, 0);
  const page = cutoutLayer(target.canvas);
  const arc = Array.from({ length: strips }, (_, index) => {
    const position = index / strips;
    const theta = turn * (position + .5 / strips);
    return { position, start: Math.sin(turn * position), end: Math.sin(turn * (index + 1) / strips),
      tone: theta > 1.18 ? softShadow : theta > .47 ? highlight : null };
  });
  for (let i = 0; i < bands; i++) {
    const y = Math.round(h * i / bands);
    const height = Math.round(h * (i + 1) / bands) - y;
    const row = (i + .5) / bands;
    const edge = clamp(alpha + travel * alpha * (peeling ? 2 * (row - .5) : .8 * (1 - row ** 2)), 0, 1);
    const bend = w * Math.min(edge, .55 * Math.sqrt(travel) * alpha * depth);
    const flat = w * edge - bend;
    const shade = Math.min(flat, bend * .18);
    flatPage.lineTo(flat, y);
    flatPage.lineTo(flat, y + height);
    softShadow.rect(flat - shade, y, shade / 2, height);
    deepShadow.rect(flat - shade / 2, y, shade / 2, height);
    if (!bend) continue;
    const backEdge = flat + bend * Math.sin(turn);
    for (const { position, start, end, tone } of arc) {
      const width = bend * Math.abs(end - start);
      if (width < .05) continue;
      const origin = flat + bend * position;
      const x = flat + bend * start;
      if (end >= start) {
        page.drawImage(image, origin, y, bend / strips, height, x, y, width, height);
        tone?.rect(x, y, Math.max(0, Math.min(width, backEdge - x)), height);
      } else {
        page.save();
        page.translate(x, y);
        page.scale(-1, 1);
        page.drawImage(image, origin, y, bend / strips, height, 0, 0, width, height);
        page.restore();
        back.rect(x - width, y, width, height);
      }
    }
  }
  flatPage.lineTo(0, h);
  flatPage.closePath();
  page.save();
  page.clip(flatPage);
  page.drawImage(image, 0, 0);
  page.restore();
  // Paint the projected lighting through the paper's alpha in a few full-path passes.
  page.save();
  page.globalCompositeOperation = 'source-atop';
  for (const [path, color, strength] of [[softShadow, '#151727', .15], [deepShadow, '#151727', .39],
      [highlight, '#ffefd6', .22], [back, '#a8a9bc', .44]]) {
    page.fillStyle = color;
    page.globalAlpha = strength * Math.sqrt(travel);
    page.fill(path);
  }
  page.restore();
  target.drawImage(page.canvas, 0, 0);
}

function drawWhirlwindExit(target, image, { alpha }) {
  const { width: w, height: h } = image;
  const travel = 1 - alpha;
  const bands = 36;
  target.translate(w / 2, h / 2);
  target.scale(alpha, alpha);
  target.globalAlpha *= clamp(alpha * 4, 0, 1);
  for (let i = 0; i < bands; i++) {
    const y = Math.round(h * i / bands);
    const height = Math.round(h * (i + 1) / bands) - y;
    if (!height) continue;
    target.save();
    target.rotate(travel * (Math.PI * 2 + i / bands * 3));
    target.drawImage(image, 0, y, w, height, -w / 2, y - h / 2, w, height);
    target.restore();
  }
}

function drawFoldEntrance(target, image, alpha, depth = 1) {
  const { width: w, height: h } = image;
  const hinge = w / 2;
  const fold = (1 - alpha) * depth;
  const open = Math.max(.035, 1 - .965 * fold);
  for (const side of [-1, 1]) {
    target.save();
    target.translate(hinge, h / 2);
    target.transform(open, side * .26 * fold, 0, 1 - .16 * fold, 0, 0);
    target.filter = 'brightness(' + (1 - fold * (side < 0 ? .36 : .16)) + ')';
    const left = side < 0 ? 0 : hinge;
    target.drawImage(image, left, 0, hinge, h, left - hinge, -h / 2, hinge, h);
    target.restore();
  }
}

function drawColorSeparation(target, image, amount, radial, displacement = 1) {
  const { width: w, height: h } = image;
  const channel = cutoutLayer(target.canvas);
  const opacity = target.globalAlpha;
  target.drawImage(image, 0, 0);
  target.globalCompositeOperation = 'screen';
  for (const [color, sign] of [['#ff0000', -1], ['#0000ff', 1]]) {
    channel.clearRect(0, 0, w, h);
    channel.drawImage(image, 0, 0);
    channel.globalCompositeOperation = 'multiply';
    channel.fillStyle = color;
    channel.fillRect(0, 0, w, h);
    channel.globalCompositeOperation = 'destination-in';
    channel.drawImage(image, 0, 0);
    channel.globalCompositeOperation = 'source-over';
    target.globalAlpha = opacity * amount * .8;
    if (radial) {
      const scale = 1 + sign * amount * .13 * displacement;
      target.drawImage(channel.canvas, w * (1 - scale) / 2, h * (1 - scale) / 2, w * scale, h * scale);
    } else {
      target.drawImage(channel.canvas, sign * w * amount * .045 * displacement, -sign * h * amount * .011 * displacement);
    }
  }
}

function drawGlitchAnimation(target, image, { type, edge, alpha, seconds, progress, options }) {
  const { width: w, height: h } = image;
  const amount = 1 - alpha;
  if (edge === 'exit') target.globalAlpha *= clamp(progress * 2.5, 0, 1);
  const opacity = target.globalAlpha;
  const displacement = presetRatio(options, 'shift');
  if (type === 'RGB Split' || type === 'Chromatic Aberration') {
    drawColorSeparation(target, image, amount, type === 'Chromatic Aberration', displacement);
    return;
  }
  if (type === 'Glitch In' || type === 'Glitch Out' || type === 'Warp In' || type === 'Warp Out') {
    const glitch = type === 'Glitch In' || type === 'Glitch Out';
    const strips = glitch ? 15 : 45;
    const phase = Math.floor(seconds * 18);
    for (let i = 0; i < strips; i++) {
      const y = Math.round(i * h / strips);
      const rows = Math.round((i + 1) * h / strips) - y;
      if (!rows) continue;
      const wave = glitch ? Math.sin(i * 3.28 + phase * 1.67) : Math.sin(i * .29 + progress * 5.2);
      const shift = wave * w * amount * (glitch ? .095 : .13) * displacement;
      target.globalAlpha = opacity * (glitch && (i + phase) % 5 === 0 ? 1 - .66 * amount : 1);
      target.drawImage(image, 0, y, w, rows, shift, y, w, rows);
    }
    return;
  }
  if (type === 'Vertical Shake' || type === 'Horizontal Shake') {
    const wave = Math.cos(seconds * 48) * amount * displacement;
    target.translate(type === 'Horizontal Shake' ? w * .095 * wave : 0, type === 'Vertical Shake' ? h * .12 * wave : 0);
  } else if (type === 'Stretch Out') {
    target.translate(-w * amount * .55, h * amount * .5);
    target.scale(1 + amount * 1.1, alpha);
  } else if (type === 'Stretch In') {
    const x = .33 + .67 * alpha;
    const y = 1 + .38 * amount;
    target.translate(w * (1 - x) / 2, h * (1 - y) / 2);
    target.scale(x, y);
  } else {
    const strobe = type === 'Strobe';
    seconds *= presetRatio(options, 'speed');
    const wave = strobe ? Number((seconds * 2.8) % 1 < .32)
      : (.5 + .5 * Math.cos(seconds * 13 + Math.sin(seconds * 4) * .7)) ** 2;
    target.globalAlpha = opacity * (1 - (strobe ? .54 : .42) * wave * amount);
    target.filter = 'brightness(' + (1 - .18 * wave * amount) + ')';
  }
  target.drawImage(image, 0, 0);
}

function drawShatterExit(target, image, amount) {
  const { width: w, height: h } = image;
  const columns = 5;
  const rows = 4;
  const vertex = (column, row) => [
    w * (column + (column > 0 && column < columns ? .28 * Math.sin(column * 7 + row * 3) : 0)) / columns,
    h * (row + (row > 0 && row < rows ? .28 * Math.cos(row * 7 + column * 3) : 0)) / rows
  ];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = vertex(column, row);
      const b = vertex(column + 1, row);
      const c = vertex(column + 1, row + 1);
      const d = vertex(column, row + 1);
      for (const points of [[a, b, c], [a, c, d]]) {
        const x = (points[0][0] + points[1][0] + points[2][0]) / 3;
        const y = (points[0][1] + points[1][1] + points[2][1]) / 3;
        target.save();
        target.translate(x + (x - w / 2) * amount * 1.55,
          y + (y - h / 2) * amount + h * .46 * amount ** 2);
        target.rotate(amount * Math.sin(column * 5 + row * 3 + x / w * 7));
        target.translate(-x, -y);
        target.beginPath();
        target.moveTo(...points[0]);
        target.lineTo(...points[1]);
        target.lineTo(...points[2]);
        target.closePath();
        target.clip();
        target.drawImage(image, 0, 0);
        target.restore();
      }
    }
  }
}

function drawSignalExit(target, image, animation) {
  const { width: w, height: h } = image;
  const { type, alpha, progress } = animation;
  const amount = 1 - alpha;
  target.globalAlpha *= clamp(progress * 2.5, 0, 1);
  if (type === 'TV Off') {
    const width = w * clamp(alpha / .4, 0, 1);
    const height = h * Math.max(.006, clamp((alpha - .4) / .6, 0, 1) ** 2);
    target.filter = 'brightness(' + (1 + 3 * Math.sin(Math.PI * amount)) + ')';
    target.drawImage(image, (w - width) / 2, (h - height) / 2, width, height);
  } else if (type === 'Shatter') {
    if (amount < .005) target.drawImage(image, 0, 0);
    else drawShatterExit(target, image, amount * presetRatio(animation.options, 'shift'));
  } else if (type === 'Pixelate Out') {
    const block = 1 + 54 * amount ** 2 * presetRatio(animation.options, 'pixel');
    const width = Math.max(1, Math.round(w / block));
    const height = Math.max(1, Math.round(h / block));
    if (pixelateBuffer.canvas.width !== width) pixelateBuffer.canvas.width = width;
    if (pixelateBuffer.canvas.height !== height) pixelateBuffer.canvas.height = height;
    pixelateBuffer.clearRect(0, 0, width, height);
    pixelateBuffer.drawImage(image, 0, 0, width, height);
    target.imageSmoothingEnabled = false;
    target.drawImage(pixelateBuffer.canvas, 0, 0, w, h);
  } else {
    const flash = Math.sin(Math.PI * amount) ** 6;
    target.filter = 'brightness(' + (1 + flash * 6) + ') contrast(' + (1 - flash * .5) + ')';
    target.drawImage(image, 0, 0);
  }
}

function drawProjectedStrips(target, image, project, vertical = false) {
  const { width: w, height: h } = image;
  const axis = vertical ? h : w;
  const cross = vertical ? w : h;
  const strips = Math.min(140, Math.max(32, Math.ceil(axis / 10)));
  let previous = project(0);
  for (let i = 0; i < strips; i++) {
    const next = project((i + 1) / strips);
    const position = Math.round(previous.position);
    const span = Math.round(next.position) - position;
    if (span > 0) {
      const size = cross * (previous.scale + next.scale) / 2;
      const inset = (cross - size + (previous.offset ?? 0) + (next.offset ?? 0)) / 2;
      if (vertical) {
        target.drawImage(image, 0, axis * i / strips, w, axis / strips, inset, position, size, span);
      } else {
        target.drawImage(image, axis * i / strips, 0, axis / strips, h, position, inset, span, size);
      }
    }
    previous = next;
  }
}

function drawPerspectiveEntrance(target, image, { type, alpha }) {
  const { width: w, height: h } = image;
  const remaining = 1 - alpha;
  const cx = w / 2;
  const cy = h / 2;
  if (type === '3D Zoom' || type === 'Tilt In') {
    const vertical = type === 'Tilt In';
    const axis = vertical ? h : w;
    const angle = remaining * (vertical ? 1.16 : -.55);
    const camera = axis * 1.8;
    const distance = camera * (vertical ? 1 : 1 + .84 * remaining);
    const project = u => {
      const delta = axis * (u - .5);
      const scale = camera / (distance - delta * Math.sin(angle));
      return { position: axis / 2 + delta * Math.cos(angle) * scale, scale };
    };
    drawProjectedStrips(target, image, project, vertical);
  } else if (type === 'Cube Flip') {
    const angle = remaining * Math.PI / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const camera = w * 2.8;
    const project = (x, z) => {
      const scale = (camera - cx) / (camera + x * s - z * c) * (.65 + .35 * alpha);
      return { position: cx + (x * c + z * s) * scale, scale };
    };
    target.globalAlpha = remaining * .58;
    target.filter = 'brightness(.63)';
    drawProjectedStrips(target, image, u => project(-cx, w * (u - .5)));
    target.globalAlpha = 1;
    target.filter = 'brightness(' + (1 - .2 * s) + ')';
    drawProjectedStrips(target, image, u => project(w * (u - .5), cx));
  } else {
    target.translate(cx - (type === 'Roll In' ? w * .72 * remaining : w * .14 * remaining), cy);
    if (type === 'Roll In') {
      target.rotate(-remaining * 1.65 * Math.PI);
      target.scale(1 - .18 * remaining, 1 - .18 * remaining);
    } else {
      target.transform(1 - .2 * remaining, .24 * remaining, -.42 * remaining, 1 - .13 * remaining, 0, 0);
    }
    target.translate(-cx, -cy);
    target.drawImage(image, 0, 0);
  }
}

function drawAnimationLayer(target, layer, animation) {
  if (animation.type === 'Dissolve') dissolveClipLayer(layer, animation.alpha);
  target.save();
  if (perspectiveAnimations.includes(animation.type)) {
    drawPerspectiveEntrance(target, layer.canvas, animation);
  } else if (animation.edge === 'exit' && ['TV Off', 'Shatter', 'Pixelate Out', 'Flash Out'].includes(animation.type)) {
    drawSignalExit(target, layer.canvas, animation);
  } else if ((animation.edge === 'exit' ? glitchExitAnimations : glitchAnimations).includes(animation.type)) {
    drawGlitchAnimation(target, layer.canvas, animation);
  } else if (animation.type === 'Page Turn') {
    drawPageTurn(target, layer.canvas, animation.alpha);
  } else if (animation.edge === 'exit' && (animation.type === 'Page Curl' || animation.type === 'Peel Off')) {
    drawCurlExit(target, layer.canvas, animation);
  } else if (animation.edge === 'exit' && animation.type === 'Whirlwind') {
    drawWhirlwindExit(target, layer.canvas, animation);
  } else if (animation.type === 'Fold In' || animation.type === 'Fold Out') {
    if (animation.type === 'Fold Out') target.globalAlpha *= clamp(animation.progress * 4, 0, 1);
    drawFoldEntrance(target, layer.canvas, animation.alpha, presetRatio(animation.options, 'fold'));
  } else {
    applyClipAnimation(target, animation);
    target.drawImage(layer.canvas, 0, 0);
    if (animation.type === 'Crystal Zoom') drawCrystalFacets(target, layer.canvas, animation.alpha);
  }
  target.restore();
}

function drawCameraCombo(target, image, type, progress, options) {
  const { width: w, height: h } = image;
  const smooth = progress * progress * (3 - 2 * progress);
  const beat = Math.sin(progress * Math.PI);
  const phase = progress * Math.PI * 2;
  const travel = presetRatio(options, 'travel');
  if (type === '3D Zoom' || type === '3D Zoom Pro') {
    const pro = type === '3D Zoom Pro';
    const angle = pro ? -.58 + smooth * 1.06 : -.24 * (1 - smooth);
    const camera = w * 2.4;
    const zoom = 1 + ((pro ? .85 : .78) + smooth * (pro ? .48 : .42) - 1) * presetRatio(options, 'zoom');
    const project = u => {
      const x = w * (u - .5);
      const scale = zoom * camera / (camera - x * Math.sin(angle));
      const offset = pro ? h * (.12 * Math.sin(phase) * (u - .5) - .047 * beat) : 0;
      return { position: w / 2 + x * Math.cos(angle) * scale, scale, offset };
    };
    drawProjectedStrips(target, image, project);
    return;
  }
  if (type === 'Distort Left' || type === 'Distort Right') {
    const direction = type.endsWith('Left') ? -1 : 1;
    const project = u => ({
      position: w * (u + direction * beat * (.53 * u * (1 - u) + .046)),
      scale: 1 + direction * (u - .5) * beat * .52,
      offset: h * direction * (u - .5) * beat * .12
    });
    drawProjectedStrips(target, image, project);
    return;
  }
  target.translate(w / 2, h / 2);
  if (type === 'Stretch and Distort') {
    target.transform(1 + .22 * beat, -.16 * Math.sin(phase), .24 * Math.sin(phase), 1 - .21 * beat, 0, 0);
  } else if (type === 'Train') {
    const track = progress ** 1.25 - .5;
    const bob = Math.sin(phase * 4) * .017 + Math.sin(phase * 2) * .012;
    target.translate(w * (.28 * track + .013 * Math.sin(phase * 3)) * travel, h * bob);
    target.rotate(.062 * Math.sin(phase - .8));
    const zoom = 1.055 + .24 * smooth;
    target.scale(zoom, zoom);
  } else {
    const direction = type === 'Pan Left' ? -1 : 1;
    target.translate(w * .24 * (smooth - .5) * direction * travel, 0);
    target.scale(1.18, 1.18);
  }
  target.drawImage(image, -w / 2, -h / 2);
}

function drawSwirl(target, image, twist, falloff = 1) {
  const { width: w, height: h } = image;
  const radius = Math.hypot(w, h) / 2;
  const rings = 12;
  for (let i = 0; i < rings; i++) {
    target.save();
    target.translate(w / 2, h / 2);
    target.beginPath();
    target.arc(0, 0, radius * (i + 1) / rings, 0, Math.PI * 2);
    if (i) target.arc(0, 0, radius * i / rings, 0, Math.PI * 2);
    target.clip('evenodd');
    const angle = (1 - i / rings) ** falloff * twist;
    target.rotate(angle);
    const c = Math.abs(Math.cos(angle));
    const s = Math.abs(Math.sin(angle));
    const scale = Math.max(c + s * h / w, c + s * w / h);
    target.scale(scale, scale);
    target.drawImage(image, -w / 2, -h / 2);
    target.restore();
  }
}

function drawRotationCombo(target, image, type, progress, options) {
  const { width: w, height: h } = image;
  const phase = progress * Math.PI * 2;
  const smooth = progress * progress * (3 - 2 * progress);
  const turn = presetRatio(options, 'turn');
  if (type === 'Twirl' || type === 'Whirl') {
    const twirl = type === 'Twirl';
    const twist = twirl ? Math.sin(phase) * 2.2 : Math.sin(Math.PI * progress) * 3.45;
    drawSwirl(target, image, twist * turn, twirl ? 2.6 : .72);
    return;
  }
  let x = 0;
  let y = 0;
  let rotation = 0;
  let sx = 1;
  let sy = 1;
  const pivot = type === 'Pirate Ship' ? h * .16 : h / 2;
  if (type === 'Spinning Top') {
    rotation = phase * 2;
    sx = .86 + .1 * Math.abs(Math.cos(phase * 2));
    sy = .86 + .12 * Math.abs(Math.sin(phase * 2));
    y = h * .028 * Math.sin(phase * 3);
  } else if (type === 'Spin and Zoom') {
    rotation = -phase;
    sx = sy = .57 + .69 * smooth;
  } else if (type === 'Spin Rise' || type === 'Spin Fall') {
    const sign = type === 'Spin Rise' ? -1 : 1;
    y = sign * h * .49 * (smooth - .5);
    rotation = sign * phase * 1.1;
    sx = sy = .82 + .12 * Math.sin(progress * Math.PI);
  } else if (type === 'Flip') {
    sx = Math.cos(phase * 2);
    sy = .89 + .11 * Math.abs(sx);
    target.filter = 'brightness(' + (.69 + .31 * Math.max(0, sx)) + ')';
  } else if (type === 'Roll') {
    x = w * .60 * (progress - .5);
    y = h * .08;
    rotation = phase;
    sx = sy = .79;
  } else if (type === 'Ferris Wheel') {
    x = w * .17 * Math.sin(phase);
    y = -h * .23 * Math.cos(phase);
    rotation = .12 * Math.sin(phase);
    sx = sy = .76 + .1 * Math.cos(phase);
  } else if (type === 'Pirate Ship') {
    rotation = .64 * Math.sin(phase * 1.5 - .8);
    sx = sy = .87;
  } else {
    x = w * .42 * (smooth - .5);
    y = h * (.20 * Math.sin(phase * 1.5) - .08 * Math.cos(phase));
    rotation = .52 * Math.cos(phase * 1.5);
    sx = sy = .66 + .31 * progress;
  }
  target.translate(w / 2 + x, pivot + y);
  target.rotate(rotation * turn);
  target.scale(sx, sy);
  target.drawImage(image, -w / 2, -pivot);
}

function drawSplitCombo(target, image, type, progress, options) {
  const { width: w, height: h } = image;
  const opening = Math.sin(Math.PI * progress);
  const gap = opening * presetRatio(options, 'split');
  if (type === 'Unfold') {
    const unfold = progress * progress * (3 - 2 * progress);
    drawFoldEntrance(target, image, .08 + .92 * unfold, presetRatio(options, 'fold'));
    return;
  }
  if (type === 'Enlarge') {
    const scale = 1 + (.54 * (1 - (1 - progress) ** 2) + .06 * opening) * presetRatio(options, 'zoom');
    target.drawImage(image, w * (1 - scale) / 2, h * (1 - scale) / 2, w * scale, h * scale);
    return;
  }
  if (type === 'Bisect') {
    const top = w * .30;
    const bottom = w * .68;
    for (const side of [-1, 1]) {
      target.save();
      target.translate(side * w * .11 * gap, -side * h * .065 * gap);
      target.beginPath();
      target.moveTo(top, 0);
      target.lineTo(bottom, h);
      target.lineTo(side < 0 ? 0 : w, h);
      target.lineTo(side < 0 ? 0 : w, 0);
      target.closePath();
      target.clip();
      target.drawImage(image, 0, 0);
      target.restore();
    }
    return;
  }
  const vertical = type === 'Split Vertical';
  const split = Math.floor((vertical ? w : h) / 2);
  const separation = Math.round((vertical ? w * .14 : h * .18) * gap);
  if (vertical) {
    target.drawImage(image, 0, 0, split, h, -separation, 0, split, h);
    target.drawImage(image, split, 0, w - split, h, split + separation, 0, w - split, h);
  } else {
    target.drawImage(image, 0, 0, w, split, 0, -separation, w, split);
    target.drawImage(image, 0, split, w, h - split, 0, split + separation, w, h - split);
  }
}

function drawChainedCombo(target, image, type, progress) {
  const { width: w, height: h } = image;
  const entering = progress < .5;
  const phase = entering ? progress * 2 : (progress - .5) * 2;
  const ease = phase * phase * (3 - 2 * phase);
  let scale = 1;
  let angle = 0;
  let x = 0;
  let y = 0;
  let stretch = 1;
  if (type === 'Fade In + Zoom Out') {
    if (entering) target.globalAlpha = ease;
    else scale = 1 - .42 * ease;
  } else if (type === 'Zoom In + Fade Out') {
    if (entering) scale = .55 + .45 * ease;
    else target.globalAlpha = 1 - ease;
  } else if (type === 'Slide Left + Slide Right') {
    x = w * (entering ? 1 - ease : ease);
  } else if (type === 'Bounce In + Bounce Out') {
    const t = entering ? phase : 1 - phase;
    const displacement = Math.abs(Math.cos(t * Math.PI * 2.8)) * (1 - t) ** 2;
    y = h * displacement * (entering ? -1 : 1);
    stretch = 1 - .12 * Math.sin(Math.PI * t) * Math.abs(Math.sin(t * Math.PI * 3));
  } else {
    angle = -Math.PI * 2 * (entering ? ease : 1 - ease);
    scale = 1 - .22 * Math.sin(Math.PI * phase);
    stretch = 1 - .14 * Math.sin(Math.PI * phase) * Math.cos(angle);
  }
  target.translate(w / 2 + x, h / 2 + y);
  target.rotate(angle);
  target.scale(scale, scale * stretch);
  target.drawImage(image, -w / 2, -h / 2);
}

function drawComboAnimation(target, image, type, progress, options) {
  progress = presetProgress(progress, options);
  const { width: w, height: h } = image;
  const phase = progress * Math.PI * 2;
  const pivotY = type === 'Pendulum' ? h * .16 : h / 2;
  target.save();
  if (cameraCombos.includes(type)) {
    drawCameraCombo(target, image, type, progress, options);
    target.restore();
    return;
  }
  if (rotationCombos.includes(type)) {
    drawRotationCombo(target, image, type, progress, options);
    target.restore();
    return;
  }
  if (splitCombos.includes(type)) {
    drawSplitCombo(target, image, type, progress, options);
    target.restore();
    return;
  }
  if (chainedCombos.includes(type)) {
    drawChainedCombo(target, image, type, progress);
    target.restore();
    return;
  }
  target.translate(w / 2, pivotY);
  const motion = presetRatio(options, 'movement');
  if (type === 'Zoom') {
    const smooth = progress * progress * (3 - 2 * progress);
    const scale = 1 + (.84 + .36 * smooth - 1) * presetRatio(options, 'zoom');
    target.scale(scale, scale);
  } else if (type === 'Bounce') {
    const jump = Math.abs(Math.sin(phase)) * (1 - .6 * progress) * motion;
    target.translate(0, -h * .15 * jump);
    target.scale(1 + .09 * jump, 1 - .13 * jump);
  } else if (type === 'Pendulum') {
    target.rotate(Math.sin(phase * 1.5) * .34 * (1 - .45 * progress) * motion);
  } else if (type === 'Wobble') {
    target.translate(w * .046 * Math.sin(phase * 2) * motion, h * .028 * Math.cos(phase * 2) * motion);
    target.rotate(.09 * Math.cos(phase * 2) * motion);
    target.transform(1, .12 * Math.sin(phase * 2) * motion, .11 * Math.cos(phase * 2) * motion, 1, 0, 0);
  } else {
    const rock = Math.sin(phase) * motion;
    const tilt = Math.abs(rock) * .29;
    if (type === 'Rock Vertically') {
      target.translate(0, h * .1 * rock);
      target.transform(1, 0, .18 * rock, 1 - tilt, 0, 0);
    } else {
      target.translate(w * .1 * rock, 0);
      target.transform(1 - tilt, .18 * rock, 0, 1, 0, 0);
    }
  }
  target.drawImage(image, -w / 2, -pivotY);
  target.restore();
}

function hasVisualTransform(clip) {
  return clip.overlayY !== undefined || clip.overlayKeys?.length || clip.overlayMotion;
}

function drawVisualClip(target, media, clip, elapsed, matteOnly, withEdges = true) {
  const frame = target.canvas;
  const transformed = !matteOnly && hasVisualTransform(clip);
  if (!transformed) return drawAnimatedClip(target, media, clip, elapsed, matteOnly, withEdges, frame);
  const layer = animatedLayer(frame);
  const drawn = drawAnimatedClip(layer, media, clip, elapsed, false, withEdges, frame);
  if (drawn) drawTransformedLayer(target, layer.canvas, clip, clip.start + elapsed);
  return drawn;
}

function drawAnimatedClip(target, media, clip, elapsed, matteOnly, withEdges, historyTarget) {
  const animation = matteOnly || !withEdges ? null : clipAnimationAt(clip, elapsed);
  const combo = !matteOnly && comboTypes.includes(clip.combo);
  const color = animation && fades[animation.type];
  let drawn;
  if (!combo && (!animation || color)) {
    drawn = drawVisual(target, media, clip, elapsed, matteOnly, historyTarget);
  } else {
    const frame = target.canvas;
    const layer = animatedLayer(frame);
    drawn = drawVisual(layer, media, clip, elapsed, false, historyTarget);
    if (drawn) {
      if (activeBackground(clip)?.mode === 'remove' && personModel) target.clearRect(0, 0, frame.width, frame.height);
      if (combo) {
        const progress = clamp(elapsed / length(clip), 0, 1);
        const options = presetOptions(clip, 'combo', clip.combo);
        if (animation && !color) {
          const combined = animatedLayer(layer.canvas);
          drawComboAnimation(combined, layer.canvas, clip.combo, progress, options);
          drawAnimationLayer(target, combined, animation);
        } else {
          drawComboAnimation(target, layer.canvas, clip.combo, progress, options);
        }
      } else {
        drawAnimationLayer(target, layer, animation);
      }
    }
  }
  if (drawn && color) {
    target.save();
    target.globalAlpha = 1 - animation.progress;
    target.fillStyle = color;
    target.fillRect(0, 0, target.canvas.width, target.canvas.height);
    target.restore();
  }
  return drawn;
}

function drawMotionTransition(type, progress, context, layer) {
  const { width: w, height: h } = context.canvas;
  const p = progress * progress * (3 - 2 * progress);
  const [family, direction] = type.split(' ');
  const vector = motionDirections[direction];
  if (vector) {
    const [x, y] = vector;
    const travelX = Math.round(x * w * p);
    const travelY = Math.round(y * h * p);
    const incomingX = travelX - x * w;
    const incomingY = travelY - y * h;
    if (family === 'Wipe') {
      const width = x ? Math.abs(travelX) : w;
      const height = y ? Math.abs(travelY) : h;
      context.beginPath();
      context.rect(x < 0 ? w - width : 0, y < 0 ? h - height : 0, width, height);
      context.clip();
      context.drawImage(layer, 0, 0);
    } else if (family === 'Slide') {
      context.drawImage(context.canvas, travelX, travelY);
      context.drawImage(layer, incomingX, incomingY);
    } else {
      const trail = Math.sin(Math.PI * progress);
      for (let i = 3; i >= 1; i--) {
        context.globalAlpha = trail * (4 - i) * .09;
        context.drawImage(layer, incomingX + x * w * .028 * i, incomingY + y * h * .028 * i);
      }
      context.globalAlpha = 1;
      context.drawImage(layer, incomingX, incomingY);
    }
    return;
  }

  if (family === 'Whirl') {
    context.globalAlpha = p;
    drawSwirl(context, layer, Math.sin(Math.PI * p) * 2.8);
    return;
  }

  const spin = family === 'Spin';
  const scale = spin ? .55 + .45 * p : direction === 'In' ? .55 + .45 * p : 1.65 - .65 * p;
  context.globalAlpha = p;
  context.translate(w / 2, h / 2);
  if (spin) context.rotate((direction === 'Clockwise' ? 1 : -1) * p * Math.PI * 2);
  context.scale(scale, scale);
  context.drawImage(layer, -w / 2, -h / 2);
}

function captureTransitionFrame(canvas) {
  let buffer = transitionFrames.get(canvas);
  if (!buffer) {
    buffer = document.createElement('canvas').getContext('2d');
    transitionFrames.set(canvas, buffer);
  }
  if (buffer.canvas.width !== canvas.width || buffer.canvas.height !== canvas.height) {
    buffer.canvas.width = canvas.width;
    buffer.canvas.height = canvas.height;
  }
  buffer.clearRect(0, 0, canvas.width, canvas.height);
  buffer.drawImage(canvas, 0, 0);
  return buffer.canvas;
}

function drawCameraTransition(type, progress, context, incoming) {
  const { width: w, height: h } = context.canvas;
  const outgoing = captureTransitionFrame(context.canvas);
  const pulse = Math.sin(progress * Math.PI);
  if (type === 'Shaky Inhale') {
    const zoom = pulse * .17;
    const x = Math.sin(progress * 83) * w * pulse * .027;
    const y = Math.cos(progress * 109) * h * pulse * .023;
    const blend = progress * progress * (3 - 2 * progress);
    context.drawImage(outgoing, -w * zoom + x, -h * zoom + y, w * (1 + 2 * zoom), h * (1 + 2 * zoom));
    context.globalAlpha = blend;
    context.drawImage(incoming, -w * zoom - x, -h * zoom - y, w * (1 + 2 * zoom), h * (1 + 2 * zoom));
    return;
  }

  const vertical = type === 'Vertical Blur';
  const blend = vertical ? progress : progress ** 1.35;
  context.globalAlpha = blend;
  context.drawImage(incoming, 0, 0);
  for (let i = 1; i <= 5; i++) {
    const dx = vertical ? 0 : w * pulse * i * .009;
    const dy = h * pulse * i * (vertical ? .025 : .004);
    const padX = dx + w * pulse * .012;
    const padY = dy + h * pulse * .012;
    const alpha = pulse * .16 * (6 - i) / 5;
    context.globalAlpha = alpha * (1 - blend);
    context.drawImage(outgoing, -padX - dx, -padY + dy, w + 2 * padX, h + 2 * padY);
    context.globalAlpha = alpha * blend;
    context.drawImage(incoming, -padX + dx, -padY - dy, w + 2 * padX, h + 2 * padY);
  }
}

function drawCubeTransition(context, incoming, progress) {
  const { width: w, height: h } = context.canvas;
  const outgoing = captureTransitionFrame(context.canvas);
  const smooth = progress * progress * (3 - 2 * progress);
  const angle = -smooth * Math.PI / 2;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const half = w / 2;
  const camera = w * 2.8;
  const project = (x, z) => {
    const depth = -x * s + z * c;
    const scale = (camera - half) / (camera - depth);
    return { x: half + (x * c + z * s) * scale, scale };
  };
  context.fillStyle = '#08090b';
  context.fillRect(0, 0, w, h);
  const strips = Math.min(128, Math.max(40, Math.ceil(w / 8)));
  const face = (layer, location, shade) => {
    let left = project(...location(0));
    for (let i = 0; i < strips; i++) {
      const right = project(...location((i + 1) / strips));
      const start = Math.round(left.x);
      const width = Math.round(right.x) - start;
      if (width > 0) {
        const height = h * (left.scale + right.scale) / 2;
        const top = (h - height) / 2;
        context.drawImage(layer, w * i / strips, 0, w / strips, h, start, top, width, height);
        context.fillStyle = 'rgba(0,0,0,' + shade + ')';
        context.fillRect(start, top, width, height);
      }
      left = right;
    }
  };
  face(outgoing, u => [w * u - half, half], .24 * -s);
  face(incoming, u => [half, half - w * u], .24 * c);
}

function drawRevealTransition(type, progress, context, incomingContext) {
  const { width: w, height: h } = context.canvas;
  const incoming = incomingContext.canvas;
  if (type === '3D Cube') {
    drawCubeTransition(context, incoming, progress);
  } else if (type === 'Mask Reveal') {
    const cx = w * .44;
    const cy = h * .46;
    const feather = Math.min(w, h) * .065;
    const radius = (Math.hypot(w - cx, h - cy) + feather) * progress;
    const mask = incomingContext.createRadialGradient(cx, cy, Math.max(0, radius - feather), cx, cy, radius);
    mask.addColorStop(0, '#fff');
    mask.addColorStop(1, '#fff0');
    incomingContext.save();
    incomingContext.globalCompositeOperation = 'destination-in';
    incomingContext.fillStyle = mask;
    incomingContext.fillRect(0, 0, w, h);
    incomingContext.restore();
    context.drawImage(incoming, 0, 0);
  } else {
    const after = progress >= .5;
    const image = after ? incoming : captureTransitionFrame(context.canvas);
    const hit = Math.max(0, 1 - Math.abs(progress - .5) * 2) ** 3;
    const scale = 1 + .26 * hit;
    const shift = (after ? -1 : 1) * .026 * hit;
    context.filter = 'contrast(' + (1 + hit * .16) + ')';
    context.drawImage(image, w * ((1 - scale) / 2 + shift), h * (1 - scale) / 2, w * scale, h * scale);
    context.filter = 'none';
    context.globalAlpha = .22 * hit;
    context.fillStyle = '#ffe1a9';
    context.fillRect(0, 0, w, h);
  }
}

function drawRhythmTransition(type, progress, context, incoming, beat) {
  const { width: w, height: h } = context.canvas;
  const outgoing = captureTransitionFrame(context.canvas);
  const pulse = type === 'Beat Sync'
    ? Math.max(0, 1 - Math.abs(progress - beat) / .18) * Math.sin(Math.PI * progress)
    : Math.sin(Math.PI * progress) ** 2;
  const blend = type === 'Beat Sync'
    ? clamp(.5 + (progress - beat) / .24, 0, 1)
    : clamp((progress - .35) / .65, 0, 1) ** 1.4;
  const zoom = pulse * (type === 'Beat Sync' ? .09 : .14);
  const scale = 1 + 2 * zoom;
  context.drawImage(outgoing, -w * zoom, -h * zoom, w * scale, h * scale);
  context.globalAlpha = blend;
  context.drawImage(incoming, -w * zoom, -h * zoom, w * scale, h * scale);
  if (type === 'Beat Sync') {
    context.globalAlpha = pulse * .19;
    context.fillStyle = '#ddedff';
    context.fillRect(0, 0, w, h);
  }
}

function drawTransition(type, progress, context, transitionContext, { beat = .62, suggestion = 'Cross Dissolve' } = {}) {
  const { width: w, height: h } = context.canvas;
  const transitionLayer = transitionContext.canvas;
  if (progress <= 0) return;
  if (progress >= 1) {
    context.drawImage(transitionLayer, 0, 0);
    return;
  }
  if (type === 'AI-assisted') type = suggestion;
  context.save();
  if (type === 'Speed Ramp' || type === 'Beat Sync') {
    drawRhythmTransition(type, progress, context, transitionLayer, beat);
  } else if (motionPresets.includes(type)) {
    drawMotionTransition(type, progress, context, transitionLayer);
  } else if (cameraPresets.includes(type)) {
    drawCameraTransition(type, progress, context, transitionLayer);
  } else if (revealPresets.includes(type)) {
    drawRevealTransition(type, progress, context, transitionContext);
  } else if (type === 'RGB Split') {
    context.globalAlpha = progress;
    context.drawImage(transitionLayer, 0, 0);
    context.globalAlpha = 1;
    drawAnimatedEffect(context, 'RGB Split', progress, Math.sin(progress * Math.PI));
  } else if (type === 'Flicker') {
    const pulse = Math.sin(progress * Math.PI);
    context.globalAlpha = clamp(progress + Math.sin(progress * Math.PI * 6) * pulse * .32, 0, 1);
    context.drawImage(transitionLayer, 0, 0);
    const exposureDip = (.5 + .5 * Math.cos((progress - .25) * Math.PI * 4)) ** 6;
    context.globalAlpha = .34 * pulse * exposureDip;
    context.fillStyle = '#111820';
    context.fillRect(0, 0, w, h);
  } else if (type === 'Cross Dissolve') {
    context.globalAlpha = progress;
    context.drawImage(transitionLayer, 0, 0);
  } else if (type === 'Luma Wipe') {
    const { width, height } = lumaMask;
    lumaContext.clearRect(0, 0, width, height);
    lumaContext.drawImage(context.canvas, 0, 0, width, height);
    const mask = lumaContext.getImageData(0, 0, width, height);
    for (let i = 0; i < mask.data.length; i += 4) {
      const luma = (mask.data[i] * .2126 + mask.data[i + 1] * .7152 + mask.data[i + 2] * .0722) / 255;
      mask.data[i + 3] = 255 * clamp((progress * 1.16 - (1 - luma)) / .16, 0, 1);
    }
    lumaContext.putImageData(mask, 0, 0);
    transitionContext.globalCompositeOperation = 'destination-in';
    transitionContext.drawImage(lumaMask, 0, 0, w, h);
    transitionContext.globalCompositeOperation = 'source-over';
    context.drawImage(transitionLayer, 0, 0);
  } else if (type === 'Page Curl') {
    const fold = Math.sin(progress * Math.PI) * w * .16;
    const x = w * (1 - progress);
    context.beginPath();
    context.moveTo(x, 0);
    context.quadraticCurveTo(x - fold * .6, h / 2, x - fold, h);
    context.lineTo(w, h);
    context.lineTo(w, 0);
    context.closePath();
    context.clip();
    context.drawImage(transitionLayer, 0, 0);
    const shade = context.createLinearGradient(x - fold, 0, x + fold, 0);
    shade.addColorStop(0, '#34313c');
    shade.addColorStop(.45, '#e6e1d7');
    shade.addColorStop(.7, '#9e98a0');
    shade.addColorStop(1, '#201c2500');
    context.fillStyle = shade;
    context.beginPath();
    context.moveTo(x, 0);
    context.quadraticCurveTo(x - fold * .6, h / 2, x - fold, h);
    context.quadraticCurveTo(x + fold * .8, h * .72, x + fold, 0);
    context.closePath();
    context.fill();
  } else if (type === 'RGB Glitch') {
    const pulse = Math.sin(progress * Math.PI);
    context.globalAlpha = progress;
    context.drawImage(transitionLayer, 0, 0);
    const band = Math.ceil(h / 15);
    const phase = Math.floor(progress * 23);
    for (let i = 0; i < 15; i++) {
      const shift = Math.round(Math.sin(i * 5.7 + phase * 2.4) * w * .055 * pulse);
      const y = i * band;
      const rows = Math.min(band, h - y);
      if (rows <= 0) break;
      context.globalAlpha = pulse * .85;
      context.drawImage(transitionLayer, 0, y, w, rows, shift, y, w, rows);
      context.globalAlpha = pulse * .35;
      context.globalCompositeOperation = 'screen';
      context.fillStyle = ['#ff0937', '#00ff90', '#2347ff'][(i + phase) % 3];
      context.fillRect(0, y + Math.floor(rows * .3), w, Math.max(1, Math.floor(rows * .18)));
      context.globalCompositeOperation = 'source-over';
    }
  }
  context.restore();
}

const id = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2);
const formatTime = value => {
  const hundredths = Math.floor(value * 100 + 0.001);
  const pad = n => String(n).padStart(2, '0');
  return pad(Math.floor(hundredths / 6000)) + ':' + pad(Math.floor(hundredths / 100) % 60) + '.' + pad(hundredths % 100);
};

const ICONS = {
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'
};
const icon = name => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';

function notify(message) {
  $('status').textContent = message;
}

function snapshot() {
  return { clips: structuredClone(clips), ratio: $('ratio').value, trackMix, selected };
}

function remember(state = snapshot()) {
  undo.push(state);
  redo.length = 0;
}

function history(from, to) {
  if (!from.length) return;
  pause();
  to.push(snapshot());
  const state = from.pop();
  clips = state.clips;
  if (state.selected !== undefined && clips.some(clip => clip.id === state.selected)) selected = state.selected;
  else if (!clips.some(clip => clip.id === selected)) selected = null;
  trackMix = state.trackMix ?? defaultTrackMix();
  setRatio(state.ratio);
  refresh();
}

function setRatio(ratio) {
  $('ratio').value = ratio;
  const dimensions = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960] };
  [canvas.width, canvas.height] = dimensions[ratio];
}

function updatePosition() {
  $('playhead').style.left = time * zoom() + 'px';
  $('clock').textContent = formatTime(time);
  $('duration').textContent = formatTime(duration());
  const playState = playback ? 'pause' : 'play';
  if ($('play').dataset.icon !== playState) {
    $('play').dataset.icon = playState;
    $('play').innerHTML = icon(playState);
    $('play').setAttribute('aria-label', playback ? 'Pause' : 'Play');
    $('play').title = (playback ? 'Pause' : 'Play') + ' (Space)';
  }
  $('split').disabled = !canSplitClip(active());
  $('effectIntensity')?.syncAtPlayhead();
  $('clipVolume')?.syncAtPlayhead();
}

function renderFrame(position, running = false, preciseSeek = false) {
  updateIncomingWindow(position, running || Boolean(playback) || Boolean(exporting));
  let visual;
  const titles = [];
  const overlays = [];
  const audible = new Map();
  for (const clip of clips) {
    if (position < clip.at || position >= clip.at + length(clip)) continue;
    if (clip.track === 'title') titles.push(clip);
    else if (clip.track === 'overlay') overlays.push(clip);
    else if (clip.track === 'visual') visual = clip;
    else if (clip.track === 'audio') audible.set(clip.asset, clip);
  }
  const visibleAsset = visual && assets.get(visual.asset);
  const matteOnly = !exporting && visual && visual.id === selected && visual.id === maskPreviewClip && activeBackground(visual);
  // Cut transitions are centred on the cut, over [cut - D/2, cut + D/2): in the first half the timeline's visual is the
  // outgoing clip, in the second half it is the incoming one. Each side may need footage outside its trim.
  // A clip can be in the second half of the cut before it and ahead of the first half of the cut after it: the cut
  // being blended comes first, and both keep their clones in sync.
  const windowCuts = [];
  const leading = visual && clips.find(item => item.track === 'visual' && item.transition?.to === visual.id);
  const leadSetting = leading && nextVisual(leading) === visual && cutTransition(leading, visual);
  if (leadSetting) {
    const span = transitionDuration(leading, visual, leadSetting.duration);
    if (position < visual.at + span / 2) windowCuts.push({ out: leading, into: visual, setting: leadSetting, span, start: visual.at - span / 2 });
  }
  const following = visual?.transition && nextVisual(visual);
  const followSetting = following && cutTransition(visual, following);
  if (followSetting) {
    const span = transitionDuration(visual, following, followSetting.duration);
    if (position >= following.at - span / 2 - incomingLead) windowCuts.push({ out: visual, into: following, setting: followSetting, span, start: following.at - span / 2 });
  }
  const current = windowCuts[0];
  const outClip = current?.out;
  const inClip = current?.into;
  const setting = current?.setting;
  const transitionLength = current?.span ?? 0;
  const windowStart = current?.start ?? 0;
  const progress = transitionLength ? clamp((position - windowStart) / transitionLength, 0, 1) : 0;
  const secondHalf = Boolean(setting) && visual === inClip;
  const outAsset = outClip && assets.get(outClip.asset);
  const inAsset = inClip && assets.get(inClip.asset);
  if (visibleAsset?.type === 'video') audible.set(visual.asset, visual);
  for (const [assetId, asset] of assets) {
    if (asset.type === 'image') continue;
    const clip = audible.get(assetId);
    const media = asset.media;
    if (!clip) {
      media.pause();
      continue;
    }
    const target = clamp(clip.start + position - clip.at, 0, asset.duration);
    const frameTolerance = running && !media.paused && !preciseSeek ? .16 : .001;
    if ((!media.seeking || preciseSeek) && Math.abs(media.currentTime - target) > frameTolerance) media.currentTime = target;
    const volume = clipOutputVolume(clip, target);
    if (asset.gain) asset.gain.gain.value = volume;
    else media.volume = volume;
    if (running && media.paused) media.play().catch(() => {});
    if (!running) media.pause();
  }
  const playingIncoming = running && !preciseSeek;
  const liveIncoming = new Set();
  const remapFor = type => type === 'Speed Ramp' ? tempoProgress : type === 'Slow-Motion Blur' ? slowMotionProgress : null;
  const remap = remapFor(setting?.type);
  let incoming;
  let outgoing;
  for (const cut of windowCuts) {
    // Seek or play the clones before drawing so the frames match this position. Source times run outside the trim
    // (before the incoming in-point, past the outgoing out-point); syncIncoming holds the boundary frame there.
    const cutInAsset = assets.get(cut.into.asset);
    const cutOutAsset = assets.get(cut.out.asset);
    const inEntry = cutInAsset && incomingMedia(cutInAsset, 'in:' + cut.into.id);
    if (inEntry) {
      liveIncoming.add(inEntry);
      syncIncoming(inEntry, cut.into.start + position - cut.into.at, playingIncoming);
    }
    const outEntry = cutOutAsset && incomingMedia(cutOutAsset, 'out:' + cut.out.id);
    if (outEntry) {
      const cutRemap = remapFor(cut.setting.type);
      const cutProgress = clamp((position - cut.start) / cut.span, 0, 1);
      let sourceTime = cut.out.start + position - cut.out.at;
      let rate = 1;
      if (cutRemap) {
        const low = Math.max(0, cutProgress - .01);
        const high = Math.min(1, cutProgress + .01);
        sourceTime -= cut.span * (cutProgress - cutRemap(cutProgress));
        rate = clamp((cutRemap(high) - cutRemap(low)) / (high - low), .25, 4);
      }
      liveIncoming.add(outEntry);
      syncIncoming(outEntry, sourceTime, playingIncoming, rate);
    }
    if (cut === current) {
      incoming = inEntry;
      outgoing = outEntry;
    }
  }
  // The incoming clip's own element only starts decoding at the cut and can show stale frames or still be seeking for a
  // while: keep drawing from its clone, which is already in sync, for the first second.
  let handoff;
  if (!secondHalf && visual && visibleAsset?.type === 'video' && position - visual.at < 1) {
    const entry = incomingClones.get('in:' + visual.id);
    const wanted = visual.start + position - visual.at;
    const main = visibleAsset.media;
    if (entry && entry.asset === visibleAsset) {
      handoff = entry;
      liveIncoming.add(entry);
      syncIncoming(entry, wanted, playingIncoming);
    }
  }
  for (const entry of incomingClones.values()) {
    if (liveIncoming.has(entry)) continue;
    entry.live = false;
    if (!entry.media.paused) entry.media.pause();
  }
  if (preciseSeek && !running && visibleAsset?.type === 'video' && visibleAsset.media.seeking) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!exporting?.transparent) {
    context.fillStyle = matteOnly ? '#000' : '#08090b';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const blending = setting && progress > 0 && !matteOnly;
  if (visibleAsset) {
    const elapsed = position - visual.at;
    if (blending && secondHalf) {
      // Second half: the outgoing clip plays past its out-point (clone) underneath, the timeline's clip is the incoming layer.
      const outFrame = outgoing ? incomingSource(outgoing) : outAsset?.media;
      if (outFrame) drawVisualClip(context, outFrame, outClip, Math.min(position - outClip.at, length(outClip) - .001), false);
    } else {
      const slowFrame = remap && outgoing && incomingSource(outgoing);
      const drewSlowFrame = blending && slowFrame && drawVisualClip(context, slowFrame, visual, elapsed, matteOnly);
      const handoffFrame = !drewSlowFrame && handoff && incomingSource(handoff);
      if (!drewSlowFrame && !(handoffFrame && drawVisualClip(context, handoffFrame, visual, elapsed, matteOnly))) {
        drawVisualClip(context, visibleAsset.media, visual, elapsed, matteOnly);
      }
    }
  }
  if (matteOnly) return;
  if (blending) {
    if (transitionLayer.width !== canvas.width || transitionLayer.height !== canvas.height) {
      transitionLayer.width = canvas.width;
      transitionLayer.height = canvas.height;
    }
    transitionContext.fillStyle = '#08090b';
    transitionContext.fillRect(0, 0, canvas.width, canvas.height);
    const source = incoming ? incomingSource(incoming) : inAsset.media;
    if (source && drawVisualClip(transitionContext, source, inClip, secondHalf ? Math.max(0, position - inClip.at) : 0, false, false)) {
      const inputs = setting.type === 'Beat Sync' ? { beat: beatProgress(outClip, inClip, transitionLength) }
        : setting.type === 'AI-assisted' ? { suggestion: suggestedTransition(assetFeatures(outAsset), assetFeatures(inAsset)) }
        : undefined;
      drawTransition(setting.type, progress, context, transitionContext, inputs);
    }
  }
  if (!matteOnly) {
    if (visibleAsset) drawTimelineEffects(context, position, visual, visibleAsset.media);
    for (const clip of overlays) drawOverlay(context, clip, clip.start + position - clip.at);
    drawAudioVisualizers(context, position);
  }
  for (const [index, clip] of titles.entries()) {
    drawTitleLayer(context, clip, position, index);
  }
  if (exporting && !exporting.transparent) {
    context.save();
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }
}

let trailScrubJob;
let trailPlaybackRequest;
let playbackFrameRequest;
let loopCueDeadline;
let playbackExcerpt;

function draw(running = false, preciseSeek = false) {
  const position = previewFramePosition();
  renderFrame(position, running, preciseSeek);
  updateOverlaySelection(position);
  syncBodySubjectPreview(position);
  syncOverlayInspector(position);
  updatePosition();
  if (!running && !playback && !exporting && !trailScrubJob) {
    const prepared = prepareBodyTrails(position);
    if (prepared) {
      trailScrubJob = prepared;
      prepared.then(() => {
        trailScrubJob = null;
        if (!playback && !exporting) draw();
      }, error => {
        trailScrubJob = null;
        notify(error.message);
      });
    }
  }
}

function seek(position) {
  time = clamp(position, 0, duration());
  if (playback) {
    const span = playbackExcerpt ?? activePreviewLoop();
    if (span) {
      if (!rangeContains(span, time)) return pause();
      return cuePrecisePreview(performance.now());
    }
    loopCueDeadline = null;
    playback = performance.now() - time * 1000 || .001;
  }
  draw(Boolean(playback), Boolean(playback));
}

function pause() {
  cancelAnimationFrame(playbackFrameRequest);
  playbackFrameRequest = null;
  loopCueDeadline = null;
  playbackExcerpt = null;
  trailPlaybackRequest = null;
  playback = null;
  draw();
}

function cuePrecisePreview(now) {
  // Hold the preview clock while media seeks to the first frame of the requested span.
  loopCueDeadline = now + 2000;
  draw(false, true);
}

function tick(now) {
  if (!playback) return;
  if (loopCueDeadline) {
    const waiting = clips.some(clip => (clip.track === 'visual' || clip.track === 'audio') &&
      layerOnScreen(clip, time) && assets.get(clip.asset)?.media.seeking);
    if (waiting && now < loopCueDeadline) {
      playbackFrameRequest = requestAnimationFrame(tick);
      return;
    }
    loopCueDeadline = null;
    playback = now - time * 1000 || .001;
    draw(true);
    playbackFrameRequest = requestAnimationFrame(tick);
    return;
  }
  const end = Math.min(duration(), playbackExcerpt?.end ?? Infinity);
  const loop = playbackExcerpt ? null : activePreviewLoop();
  time = clamp((now - playback) / 1000, 0, end);
  if (loop && !rangeContains(loop, time)) {
    time = loop.start;
    cuePrecisePreview(now);
  } else {
    if (time >= end) {
      if (playbackExcerpt) time = Math.max(playbackExcerpt.start, end - .001);
      return pause();
    }
    draw(true);
  }
  playbackFrameRequest = requestAnimationFrame(tick);
}

function togglePlayback() {
  if (playback || trailPlaybackRequest) return pause();
  return startPreviewPlayback();
}

async function startPreviewPlayback(excerpt = null) {
  if (exporting || !duration()) return;
  if (time >= duration()) time = 0;
  audioContext?.resume();
  const prepared = prepareBodyTrails(excerpt?.start ?? 0, excerpt?.end ?? duration());
  if (prepared) {
    const request = {};
    trailPlaybackRequest = request;
    notify('Preparing motion trails…');
    try {
      await prepared;
    } catch (error) {
      if (trailPlaybackRequest === request) {
        trailPlaybackRequest = null;
        notify(error.message);
      }
      return;
    }
    if (trailPlaybackRequest !== request) return;
    trailPlaybackRequest = null;
    if (exporting) return;
    notify('Motion trails ready.');
  }
  playbackExcerpt = excerpt;
  const span = excerpt ?? activePreviewLoop();
  if (excerpt || (span && !rangeContains(span, time))) time = span.start;
  const now = performance.now();
  playback = now - time * 1000 || .001;
  if (span) cuePrecisePreview(now);
  playbackFrameRequest = requestAnimationFrame(tick);
}

const transitionDragType = 'application/x-framecut-transition';
const effectDragType = 'application/x-framecut-effect';

function applyEffectPreset(clip, effect) {
  pause();
  selected = clip.id;
  if (clip.effect !== effect) {
    remember();
    clip.effect = effect;
  }
  if (time < clip.at || time >= clip.at + length(clip)) seek(clip.at);
  refresh();
}

function applyTransitionPreset(clip, next, type) {
  if (!transitionTypes.includes(type)) return;
  pause();
  selected = clip.id;
  const setting = cutTransition(clip, next);
  if (setting?.type === type) {
    previewTransition(clip, next);
    refresh();
    return;
  }
  setCutTransition(clip, next, type, setting?.duration ?? defaultFadeDuration);
}

function renderPresets() {
  const makeSample = () => Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
  const scene = (sky, land, sun, x, high) => {
    const sample = makeSample();
    const ctx = sample.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 90);
    gradient.addColorStop(0, sky);
    gradient.addColorStop(1, land);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 160, 90);
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(x, high, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = land;
    ctx.beginPath();
    ctx.moveTo(0, 74);
    ctx.lineTo(34, 37);
    ctx.lineTo(76, 71);
    ctx.lineTo(122, 49);
    ctx.lineTo(160, 69);
    ctx.lineTo(160, 90);
    ctx.lineTo(0, 90);
    ctx.fill();
    ctx.fillStyle = '#0c182a';
    ctx.beginPath();
    ctx.moveTo(0, 82);
    ctx.quadraticCurveTo(52, 62, 96, 79);
    ctx.quadraticCurveTo(131, 89, 160, 73);
    ctx.lineTo(160, 90);
    ctx.lineTo(0, 90);
    ctx.fill();
    return sample;
  };
  const portrait = new Image();
  portrait.src = '/* SUBJECT_PREVIEW */';
  const from = scene('#e48e53', '#713165', '#ffe9a5', 114, 30);
  const to = scene('#65cce3', '#246274', '#effaff', 46, 25);
  const incoming = makeSample().getContext('2d');
  const sampleSuggestion = suggestedTransition(sceneFeatures(from), sceneFeatures(to));
  const addTile = (type, kind, paintPreview, apply, prepare) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = kind + '-preset preset-tile';
    tile.draggable = true;
    tile.dataset[kind === 'transition' ? 'preset' : 'effectPreset'] = type;
    const preview = makeSample();
    preview.setAttribute('aria-hidden', 'true');
    const output = preview.getContext('2d');
    const paint = elapsed => paintPreview(output, elapsed);
    const poster = beatFlashEffects.includes(type) || (kind === 'effect' && ['Strobe', 'Flash', 'Lightning'].includes(type)) ? .07
      : type === 'Beat Sync' ? .87 : .55;
    if (type === 'AI-assisted') tile.title = 'Choose a transition using local image analysis';
    paint(poster);
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      paint(poster);
    };
    const animate = () => {
      if (frame) return;
      prepare?.(paint, poster);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const start = performance.now();
      const update = now => {
        paint((now - start) / 1000);
        frame = requestAnimationFrame(update);
      };
      frame = requestAnimationFrame(update);
    };
    tile.onpointerenter = tile.onfocus = animate;
    tile.onpointerleave = tile.onblur = stop;
    tile.ondragstart = event => {
      event.dataTransfer.setData(kind === 'transition' ? transitionDragType : effectDragType, type);
      event.dataTransfer.effectAllowed = 'copy';
      stop();
    };
    tile.ondragend = clearPresetDrop;
    tile.onclick = apply;
    const label = document.createElement('span');
    label.textContent = kind === 'effect' ? effectPresetLabel(type) : type;
    tile.append(preview, label);
    const panel = kind === 'effect' ? (trendingEffects.includes(type) ? 'trendingEffectPresets'
      : glitchVideoEffects.includes(type) ? 'glitchEffectPresets'
      : lightVideoEffects.includes(type) ? 'lightEffectPresets'
      : blurVideoEffects.includes(type) ? 'blurEffectPresets'
      : retroVideoEffects.includes(type) ? 'retroEffectPresets'
      : partyVideoEffects.includes(type) ? 'partyEffectPresets'
      : textureVideoEffects.includes(type) ? 'textureEffectPresets'
      : artisticVideoEffects.includes(type) ? 'artisticEffectPresets'
      : splitVideoEffects.includes(type) ? 'splitEffectPresets'
      : frameVideoEffects.includes(type) ? 'frameEffectPresets'
      : outlineEffects.includes(type) ? 'outlineEffectPresets'
      : cloneTrailEffects.includes(type) ? 'cloneTrailEffectPresets'
      : auraEnergyEffects.includes(type) ? 'auraEnergyEffectPresets'
      : bodyDistortionEffects.includes(type) ? 'bodyDistortionEffectPresets'
      : moodyBodyEffects.includes(type) ? 'moodyBodyEffectPresets'
      : subjectEffects.includes(type) ? 'subjectEffectPresets' : 'effectPresets')
      : cameraPresets.includes(type) ? 'cameraPresets'
      : distortionPresets.includes(type) ? 'distortionPresets'
      : revealPresets.includes(type) ? 'revealPresets'
      : rhythmPresets.includes(type) ? 'rhythmPresets' : 'motionPresets';
    $(panel).append(tile);
  };
  for (const type of transitionTypes) {
    addTile(type, 'transition', (output, elapsed) => {
      const progress = clamp((elapsed % 1.6 - .22) / 1.05, 0, 1);
      if (cameraPresets.includes(type) || type === 'Speed Ramp') {
        const sampleTime = type === 'Slow-Motion Blur' ? slowMotionProgress(progress)
          : type === 'Speed Ramp' ? tempoProgress(progress) : progress;
        output.drawImage(from, -8 * sampleTime, -2, 168, 94);
        incoming.drawImage(to, -8 * (1 - progress), -2, 168, 94);
      } else {
        output.drawImage(from, 0, 0);
        incoming.drawImage(to, 0, 0);
      }
      drawTransition(type, progress, output, incoming, { suggestion: sampleSuggestion });
    }, () => {
      const clip = active();
      const next = clip?.track === 'visual' && nextVisual(clip);
      if (next) applyTransitionPreset(clip, next, type);
      else notify('Drag the preset onto a cut, or select the clip before a cut.');
    });
  }
  for (const effect of animatedEffects) {
    const isSubject = subjectEffects.includes(effect);
    const paint = (output, elapsed) => {
      if (!isSubject || !portrait.naturalWidth) {
        output.drawImage(from, 0, 0);
        if (!isSubject) drawAnimatedEffect(output, effect, elapsed);
        return;
      }
      output.fillStyle = '#152630';
      output.fillRect(0, 0, 160, 90);
      const width = 90 * portrait.naturalWidth / portrait.naturalHeight;
      const x = (160 - width) / 2;
      output.drawImage(portrait, x, 0, width, 90);
      const mask = personMaskFor(portrait, poseBodyEffects.includes(effect));
      if (mask) {
        const subject = { mask, x, y: 0, width, height: 90 };
        drawAnimatedEffect(output, effect, elapsed, 1, { ...subject, bodySource: { ...subject, media: portrait } });
      }
    };
    const prepare = isSubject ? (render, poster) => {
      Promise.all([loadPersonModel(), loadBodyDetailModel(bodyDetailKind(effect))])
        .then(() => render(poster)).catch(() => {});
    } : null;
    addTile(effect, 'effect', paint, () => addTimelineEffect(effect), prepare);
    if (isSubject) {
      const preview = document.querySelector('[data-effect-preset="' + CSS.escape(effect) + '"] canvas');
      portrait.addEventListener('load', () => paint(preview.getContext('2d'), .55), { once: true });
    }
  }
}

function cutDropTarget(event) {
  if (!event.dataTransfer.types.includes(transitionDragType)) return null;
  let target = null;
  let nearest = 15;
  for (const marker of document.querySelectorAll('.cut-marker')) {
    const rect = marker.getBoundingClientRect();
    const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
    if (distance < nearest) {
      nearest = distance;
      target = marker;
    }
  }
  return target;
}

function clearPresetDrop() {
  $('effectLane')?.classList.remove('drop');
  document.querySelector('.cut-drop-target')?.classList.remove('cut-drop-target');
  document.querySelector('.effect-drop-target')?.classList.remove('effect-drop-target');
  document.querySelector('.animation-drop-target')?.classList.remove('animation-drop-target');
}

function presetDropTarget(event, track) {
  if (event.dataTransfer.types.includes(animationDragTypes[track])) {
    const bar = event.target.closest('[data-animation-clip]');
    const target = bar ? document.querySelector('.clip[data-id="' + CSS.escape(bar.dataset.animationClip) + '"]')
      : event.target.closest('.clip');
    return target && { target, highlight: 'animation-drop-target', mime: animationDragTypes[track] };
  }
  if (track !== 'visual') return null;
  if (event.dataTransfer.types.includes(effectDragType)) {
    const target = event.target.closest('.clip.picture');
    return target && { target, highlight: 'effect-drop-target', mime: effectDragType };
  }
  const target = cutDropTarget(event);
  return target && { target, highlight: 'cut-drop-target', mime: transitionDragType };
}

function renderBin() {
  const bin = $('bin');
  bin.replaceChildren();
  const imports = Array.from(assets).filter(([, asset]) => !asset.sourceVideo);
  $('assetCount').textContent = imports.length + (imports.length === 1 ? ' item' : ' items');
  for (const [assetId, asset] of imports) {
    const button = document.createElement('button');
    button.className = 'asset';
    button.title = 'Add ' + asset.name + ' to timeline';
    if (asset.thumb) {
      const image = new Image();
      image.className = 'thumb';
      image.alt = '';
      image.src = asset.thumb;
      button.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'thumb';
      placeholder.innerHTML = icon(asset.type === 'audio' ? 'music' : 'play');
      placeholder.style.cssText = 'display:grid;place-items:center';
      button.append(placeholder);
    }
    const name = document.createElement('span');
    name.textContent = asset.name;
    name.title = asset.name;
    const plus = document.createElement('span');
    plus.innerHTML = icon('plus');
    button.append(name, plus);
    button.onclick = () => addAsset(assetId);
    bin.append(button);
  }
}

function keyframeCurveEditor(clip, key, next, easing, { field, seekKey, onWrite }) {
  const details = document.createElement('details');
  details.className = 'intensity-curve';
  details.open = isKeyframeCurveOpen(field, clip, key.at);
  const summary = document.createElement('summary');
  summary.textContent = 'Edit curve';
  summary.onclick = event => {
    event.preventDefault();
    details.open = !details.open;
    if (details.open) openKeyframeCurves[field] = { clip: clip.id, at: key.at };
    else if (isKeyframeCurveOpen(field, clip, key.at)) delete openKeyframeCurves[field];
    repaint();
  };
  const graph = document.createElement('div');
  graph.className = 'curve-graph';
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 116;
  canvas.setAttribute('aria-hidden', 'true');
  let ctx;
  const dot = document.createElement('span');
  dot.className = 'curve-playhead';
  dot.setAttribute('aria-hidden', 'true');
  const handles = [];
  const x = value => 12 + 168 * value;
  const y = value => 104 - 92 * value;
  const position = (element, px, py) => {
    element.style.left = px * 100 / 192 + '%';
    element.style.top = py * 100 / 116 + '%';
  };
  const current = () => clip[field]?.find(item => item.at === key.at);
  const controls = setting => setting.curve ?? easingHandles[setting.easing] ?? easingHandles.Linear;
  const write = setting => {
    clip[field] = clip[field].map(item => item.at === key.at ? setting : item);
    onWrite?.();
  };
  const sync = () => {
    if (!details.open) return;
    const fraction = (clip.start + time - clip.at - key.at) / (next.at - key.at);
    const setting = current();
    dot.hidden = !setting || fraction < 0 || fraction > 1;
    if (!dot.hidden) position(dot, x(fraction), y(easingProgress(setting, fraction)));
  };
  const repaint = () => {
    if (!details.open) return;
    ctx ??= canvas.getContext('2d');
    const setting = current();
    const points = controls(setting);
    ctx.clearRect(0, 0, 192, 116);
    ctx.strokeStyle = '#363c45';
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(x(t), y(0));ctx.lineTo(x(t), y(1));
      ctx.moveTo(x(0), y(t));ctx.lineTo(x(1), y(t));
      ctx.stroke();
    }
    ctx.strokeStyle = '#84909c';
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));ctx.lineTo(x(points[0]), y(points[1]));
    ctx.moveTo(x(1), y(1));ctx.lineTo(x(points[2]), y(points[3]));
    ctx.stroke();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    for (let i = 1; i <= 64; i++) {
      const t = i / 64;
      ctx.lineTo(x(t), y(easingProgress(setting, t)));
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const [index, handle] of handles.entries()) {
      const px = points[index * 2];
      const py = points[index * 2 + 1];
      position(handle, x(px), y(py));
      handle.setAttribute('aria-label', 'Curve handle ' + (index + 1) + ', time ' +
        Math.round(px * 100) + '%, progress ' + Math.round(py * 100) + '%');
    }
    sync();
  };
  const change = (index, px, py) => {
    const setting = current();
    const points = [...controls(setting)];
    const i = index * 2;
    px = clamp(px, index ? points[0] : 0, index ? 1 : points[2]);
    py = clamp(py, 0, 1);
    if (points[i] === px && points[i + 1] === py) return false;
    points[i] = px;
    points[i + 1] = py;
    write({ ...setting, curve: points });
    easing.value = 'Custom';
    const sourceTime = clip.start + time - clip.at;
    const end = Math.min(next.at, clip.end);
    if (sourceTime <= key.at || sourceTime >= end) seekKey(clip, key.at + (end - key.at) / 4);
    else draw(Boolean(playback));
    repaint();
    return true;
  };
  for (let index = 0; index < 2; index++) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'curve-handle';
    handle.title = 'Drag or use arrow keys to shape the curve';
    handle.onpointerdown = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      pause();
      const state = snapshot();
      const original = current();
      const points = controls(original);
      const originalTime = time;
      const rect = graph.getBoundingClientRect();
      const move = nextEvent => {
        if (nextEvent.pointerId !== event.pointerId) return;
        change(index, points[index * 2] + (nextEvent.clientX - event.clientX) * 192 / (rect.width * 168),
          points[index * 2 + 1] - (nextEvent.clientY - event.clientY) * 116 / (rect.height * 92));
      };
      const end = nextEvent => {
        if (nextEvent.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (nextEvent.type === 'pointercancel') {
          write(original);
          easing.value = original.curve ? 'Custom' : original.easing ?? 'Linear';
          seek(originalTime);
          repaint();
        } else if (current() !== original) {
          remember(state);
        }
        updateHistoryButtons();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };
    handle.onkeydown = event => {
      const axis = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1] }[event.key];
      if (!axis) return;
      event.preventDefault();
      pause();
      const state = snapshot();
      const points = controls(current());
      const step = event.shiftKey ? .1 : .02;
      if (change(index, points[index * 2] + axis[0] * step, points[index * 2 + 1] + axis[1] * step)) {
        remember(state);
        updateHistoryButtons();
      }
    };
    handles.push(handle);
  }
  graph.append(canvas, dot, ...handles);
  details.append(summary, graph);
  repaint();
  return { details, sync, repaint };
}

function editableSliderValue(slider, label, pauseOnFocus = true) {
  const number = document.createElement('input');
  number.type = 'number';
  number.className = 'slider-number';
  number.setAttribute('aria-label', label + ' exact value');
  number.min = slider.min;
  number.max = slider.max;
  number.step = slider.step || '1';
  let editing = false;
  const sync = (force = false) => {
    number.disabled = slider.disabled;
    number.max = slider.max;
    if (force || !editing || number.disabled) {
      editing = false;
      number.value = slider.value;
    }
  };
  const commit = () => {
    const value = number.valueAsNumber;
    editing = false;
    if (!slider.disabled && Number.isFinite(value)) {
      const previous = slider.value;
      slider.value = value;
      if (slider.value !== previous) {
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    sync(true);
  };
  if (pauseOnFocus) number.onfocus = () => { if (playback) pause(); };
  number.oninput = () => { editing = true; };
  number.onchange = commit;
  number.onblur = () => { if (editing) commit(); };
  number.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      sync(true);
    }
  };
  sync();
  return { number, sync };
}

function effectIntensityField(clip) {
  return scalarKeyframeField(clip, intensityKeyframes);
}

function scalarKeyframeField(clip, { label: name, sliderId, field, base, scale = 1, easing: hasEasing, keepLastValue }) {
  const row = document.createElement('div');
  row.className = 'effect-intensity';
  const label = document.createElement('label');
  label.htmlFor = sliderId;
  label.textContent = name === 'Volume' ? 'Volume (%)' : name;
  const slider = document.createElement('input');
  slider.id = sliderId;
  slider.type = 'range';
  slider.min = 0;
  slider.max = 100;
  slider.setAttribute('aria-label', name + ' (%)');
  const exact = editableSliderValue(slider, name + ' (%)');
  const keyframes = document.createElement('div');
  keyframes.className = 'intensity-keyframes';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = name === 'Volume' ? 'Add volume keyframe at playhead' : 'Add keyframe at playhead';
  const list = document.createElement('ul');
  list.setAttribute('aria-label', name + ' keyframes');
  const defaultValue = 100 / scale;
  const valueAt = at => scalarKeyframeValueAt(clip[field], at, (clip[base] ?? defaultValue) * scale);
  let before;
  let original;
  let at;
  let originalKeys;
  const curves = [];

  const showValue = () => {
    slider.setAttribute('aria-valuetext', slider.value + '%');
    exact.sync();
  };
  slider.syncAtPlayhead = () => {
    const point = keyframeTime(clip);
    add.disabled = (clip[field] ?? []).some(key => key.at === point);
    if (!before) slider.value = Math.round(valueAt(point));
    showValue();
    for (const item of list.children) item.classList.toggle('at-playhead', Number(item.dataset.time) === point);
    for (const curve of curves) curve.sync();
  };
  const renderKeys = () => {
    list.replaceChildren();
    curves.length = 0;
    const keys = clip[field] ?? [];
    for (const [index, key] of keys.entries()) {
      if (key.at < clip.start || key.at > clip.end) continue;
      const item = document.createElement('li');
      item.dataset.time = key.at;
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.textContent = (key.at - clip.start).toFixed(2) + ' s · ' + Math.round(key.value) + '%';
      jump.onclick = () => {
        pause();
        seekClipKeyframe(clip, key.at);
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove keyframe at ' + (key.at - clip.start).toFixed(2) + ' seconds');
      remove.onclick = () => {
        remember();
        clip[field] = clip[field].filter(item => item.at !== key.at);
        if (keepLastValue && !clip[field].length) clip[base] = key.value / scale;
        refresh();
      };
      item.append(jump, remove);
      const next = keys[index + 1];
      if (hasEasing && next && key.at < clip.end) {
        const row = document.createElement('label');
        row.className = 'intensity-easing';
        row.textContent = 'Easing to next';
        const easing = document.createElement('select');
        for (const name of Object.keys(keyframeEasings)) easing.add(new Option(name));
        const custom = new Option('Custom');
        custom.disabled = true;
        easing.add(custom);
        easing.value = key.curve ? 'Custom' : key.easing ?? 'Linear';
        const curve = keyframeCurveEditor(clip, key, next, easing, {
          field, seekKey: seekClipKeyframe
        });
        easing.onchange = () => {
          const current = clip[field].find(item => item.at === key.at);
          if (!current || (!current.curve && (current.easing ?? 'Linear') === easing.value) ||
              !Object.hasOwn(keyframeEasings, easing.value)) return;
          remember();
          const preset = { ...current, easing: easing.value };
          delete preset.curve;
          clip[field] = clip[field].map(item => item === current ? preset : item);
          const point = keyframeTime(clip);
          const end = Math.min(next.at, clip.end);
          if (point <= key.at || point >= end) seekClipKeyframe(clip, key.at + (end - key.at) / 4);
          else draw(Boolean(playback));
          curve.repaint();
          updateHistoryButtons();
        };
        row.append(easing);
        item.append(row, curve.details);
        curves.push(curve);
      }
      list.append(item);
    }
  };
  add.onclick = () => {
    const point = keyframeTime(clip);
    remember();
    writeScalarKeyframe(clip, field, point, valueAt(point));
    renderKeys();
    renderTimeline();
    draw(Boolean(playback));
    updateHistoryButtons();
  };
  slider.oninput = () => {
    if (!before) {
      before = snapshot();
      original = clip[base];
      originalKeys = clip[field];
      if (originalKeys?.length) {
        pause();
        at = keyframeTime(clip);
      }
    }
    if (originalKeys?.length) {
      writeScalarKeyframe(clip, field, at, slider.valueAsNumber);
      renderKeys();
    } else {
      clip[base] = slider.valueAsNumber / scale;
    }
    if (!playback && (time < clip.at || time >= clip.at + length(clip))) {
      seek(clip.at + (originalKeys?.length ? Math.min(at - clip.start, length(clip) - .000001) : 0));
    } else {
      draw(Boolean(playback));
    }
  };
  slider.onchange = () => {
    if (!before) return;
    if (originalKeys?.length) {
      const previous = originalKeys.find(key => key.at === at);
      if (previous?.value !== slider.valueAsNumber) remember(before);
      renderTimeline();
    } else if (clip[base] !== (original ?? defaultValue)) {
      remember(before);
    } else if (original === undefined) {
      delete clip[base];
    }
    before = null;
    slider.syncAtPlayhead();
    updateHistoryButtons();
  };
  renderKeys();
  slider.syncAtPlayhead();
  keyframes.append(add, list);
  row.append(label, exact.number, slider, keyframes);
  return row;
}

function previewClipEdit(clip) {
  if (!playback && (time < clip.at || time >= clip.at + length(clip))) seek(clip.at);
  else draw(Boolean(playback));
}

function setBackgroundMode(clip, mode, image) {
  if ((clip.background?.mode ?? 'original') === mode && (!image || image === clip.background.image)) return;
  remember();
  clip.background = { color: defaultBackgroundColor, ...clip.background, mode };
  if (image) clip.background.image = image;
  if (active() === clip) previewClipEdit(clip);
  refresh();
}

function backgroundInspector(clip) {
  const section = document.createElement('div');
  section.className = 'section';
  const heading = document.createElement('h3');
  heading.textContent = 'Background';
  const modeRow = document.createElement('label');
  modeRow.className = 'field visual-choice';
  modeRow.textContent = 'Background mode';
  const mode = document.createElement('select');
  mode.id = 'backgroundMode';
  for (const [name, value] of [['Original', 'original'], ['Remove', 'remove'], ['Solid color', 'color'], ['Image', 'image']]) {
    mode.add(new Option(name, value));
  }
  mode.value = clip.background?.mode ?? 'original';
  modeRow.append(mode);

  const colorRow = document.createElement('label');
  colorRow.className = 'field visual-choice background-option';
  colorRow.textContent = 'Color';
  const color = document.createElement('input');
  color.type = 'color';
  color.id = 'backgroundColor';
  color.value = clip.background?.color ?? defaultBackgroundColor;
  let colorState;
  let previousColor;
  color.oninput = () => {
    if (!colorState) {
      colorState = snapshot();
      previousColor = clip.background.color;
    }
    clip.background.color = color.value;
    previewClipEdit(clip);
  };
  color.onchange = () => {
    if (!colorState) return;
    if (color.value !== previousColor) remember(colorState);
    colorState = null;
    updateHistoryButtons();
  };
  colorRow.append(color);

  const fileRow = document.createElement('div');
  fileRow.className = 'background-option';
  const file = document.createElement('input');
  file.type = 'file';
  file.id = 'backgroundFile';
  file.accept = 'image/*';
  file.hidden = true;
  const choose = document.createElement('button');
  choose.type = 'button';
  choose.textContent = 'Choose background image';
  choose.onclick = () => file.click();
  const filename = document.createElement('span');
  filename.className = 'secondary background-filename';
  filename.textContent = backgroundImages.get(clip.background?.image)?.name ?? '';
  fileRow.append(choose, file, filename);

  const edges = document.createElement('div');
  edges.className = 'background-option mask-edges';
  const maskSlider = (name, field, min, max = 48, unit = ' px') => {
    const row = document.createElement('div');
    row.className = 'effect-intensity';
    const slider = document.createElement('input');
    slider.id = 'background-' + field;
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.value = clip.background?.[field] ?? 0;
    const label = document.createElement('label');
    label.htmlFor = slider.id;
    label.textContent = name;
    const exact = editableSliderValue(slider, name);
    const updateValue = () => {
      const value = slider.valueAsNumber;
      slider.setAttribute('aria-valuetext', (field === 'expand' && value > 0 ? '+' : '') + value + unit);
      exact.sync();
    };
    let before;
    let initial;
    slider.oninput = () => {
      if (!before) {
        before = snapshot();
        initial = clip.background[field];
      }
      clip.background[field] = slider.valueAsNumber;
      updateValue();
      previewClipEdit(clip);
    };
    slider.onchange = () => {
      if (!before) return;
      if (clip.background[field] !== (initial ?? 0)) remember(before);
      else if (initial === undefined) delete clip.background[field];
      before = null;
      updateHistoryButtons();
    };
    updateValue();
    row.append(label, exact.number, slider);
    return row;
  };
  const previewMask = document.createElement('button');
  previewMask.type = 'button';
  previewMask.id = 'previewMask';
  previewMask.textContent = 'Preview mask';
  const syncPreview = () => previewMask.setAttribute('aria-pressed', String(maskPreviewClip === clip.id));
  syncPreview();
  previewMask.onclick = () => {
    maskPreviewClip = maskPreviewClip === clip.id ? null : clip.id;
    syncPreview();
    previewClipEdit(clip);
  };
  edges.append(previewMask, maskSlider('Feather', 'feather', 0), maskSlider('Expand / Shrink', 'expand', -48),
    maskSlider('Mask smoothing', 'smoothing', 0, 100, '%'));

  const sync = () => {
    colorRow.hidden = mode.value !== 'color';
    fileRow.hidden = mode.value !== 'image';
    edges.hidden = mode.value === 'original' || (mode.value === 'image' && !clip.background?.image);
  };
  mode.onchange = () => {
    backgroundRequests.delete(clip);
    sync();
    if (mode.value !== 'image' || clip.background?.image) setBackgroundMode(clip, mode.value);
  };
  file.onchange = async () => {
    const source = file.files[0];
    if (!source) return;
    const request = {};
    backgroundRequests.set(clip, request);
    choose.disabled = true;
    try {
      const bitmap = await createImageBitmap(source);
      if (backgroundRequests.get(clip) !== request || !clips.includes(clip)) {
        bitmap.close();
        return;
      }
      const image = id();
      backgroundImages.set(image, { bitmap, name: source.name, file: source });
      setBackgroundMode(clip, 'image', image);
    } catch {
      if (backgroundRequests.get(clip) === request) notify('Could not open background image: ' + source.name);
    } finally {
      if (backgroundRequests.get(clip) === request) backgroundRequests.delete(clip);
      choose.disabled = false;
      file.value = '';
    }
  };
  sync();
  section.append(heading, modeRow, colorRow, fileRow, edges);
  return section;
}

function redrawTitleWithFont(clip) {
  draw(Boolean(playback));
  if (!bundledTitleFonts.includes(clip.fontFamily)) return;
  loadTitleClipFont(clip).then(() => {
    if (!exporting) draw(Boolean(playback));
  }).catch(() => notify('Could not load the bundled font ' + clip.fontFamily + '.'));
}

function titleFormattingFields(clip, section) {
  const row = document.createElement('label');
  row.className = 'field visual-choice';
  row.textContent = 'Font';
  const font = document.createElement('select');
  const bundled = document.createElement('optgroup');
  bundled.label = 'Bundled fonts';
  for (const name of Object.keys(titleFonts)) {
    const option = new Option(name, name);
    option.style.fontFamily = titleFonts[name];
    (bundledTitleFonts.includes(name) ? bundled : font).append(option);
  }
  if (bundled.children.length) font.append(bundled);
  font.value = clip.fontFamily ?? 'System';
  font.onchange = () => {
    remember();
    clip.fontFamily = font.value;
    redrawTitleWithFont(clip);
    updateHistoryButtons();
  };
  row.append(font);
  const colorRow = document.createElement('label');
  colorRow.className = 'field';
  colorRow.textContent = 'Text color';
  const color = document.createElement('input');
  color.type = 'color';
  color.value = clip.textColor ?? '#ffffff';
  color.onchange = () => {
    if (color.value === (clip.textColor ?? '#ffffff')) return;
    remember();
    clip.textColor = color.value;
    draw(Boolean(playback));
    updateHistoryButtons();
  };
  colorRow.append(color);
  const emphasis = document.createElement('div');
  emphasis.className = 'row text-emphasis';
  emphasis.setAttribute('role', 'group');
  emphasis.setAttribute('aria-label', 'Text style');
  for (const [letter, label, property, initial] of [
    ['B', 'Bold', 'textBold', true], ['I', 'Italic', 'textItalic', false],
    ['U', 'Underline', 'textUnderline', false], ['S', 'Strikethrough', 'textStrike', false]
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.textStyle = property;
    button.textContent = letter;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(clip[property] ?? initial));
    button.onclick = () => {
      remember();
      clip[property] = !(clip[property] ?? initial);
      button.setAttribute('aria-pressed', String(clip[property]));
      redrawTitleWithFont(clip);
      updateHistoryButtons();
    };
    emphasis.append(button);
  }
  section.append(row, colorRow, emphasis);
}

const titleStyleCopyFields = [
  'size', 'fontFamily', 'textColor', 'textBold', 'textItalic', 'textUnderline', 'textStrike', 'textAppearance',
  'overlayMotion', 'textIn', 'textOut', 'textLoop', 'textInDuration', 'textOutDuration', 'presetOptions'
];

function applyTitleStyleToAll(source) {
  const targets = clips.filter(item => item.track === 'title' && item !== source);
  if (!targets.length) return;
  remember();
  const staticFields = overlayFields.map(([, key]) => key);
  const keys = source.overlayKeys ?? [];
  const pose = overlayTransformAt(source, overlaySourceTime(source));
  for (const target of targets) {
    for (const field of titleStyleCopyFields) {
      if (source[field] === undefined) delete target[field];
      else target[field] = structuredClone(source[field]);
    }
    const shift = target.start - source.start;
    const shifted = keys.map(key => ({ ...structuredClone(key), at: key.at + shift }))
      .filter(key => key.at >= target.start && key.at <= target.end);
    if (shifted.length) {
      for (const field of staticFields) {
        if (source[field] === undefined) delete target[field];
        else target[field] = source[field];
      }
      target.overlayKeys = shifted;
    } else {
      for (const field of staticFields) target[field] = pose[field];
      delete target.overlayKeys;
    }
  }
  refresh();
  notify('Applied style to ' + targets.length + ' text clip' + (targets.length === 1 ? '' : 's') + '.');
}

function titleAppearanceFields(clip, section, sliderField) {
  for (const [key, title] of [['outline', 'Outline'], ['shadow', 'Drop shadow'], ['background', 'Background']]) {
    const style = titleAppearance(clip, key);
    const group = document.createElement('fieldset');
    group.className = 'title-appearance';
    const legend = document.createElement('legend');
    legend.textContent = title;
    group.append(legend);
    const write = (property, value) => {
      clip.textAppearance = {
        ...clip.textAppearance,
        [key]: { ...clip.textAppearance?.[key], [property]: value }
      };
    };
    const edit = (property, value) => {
      remember();
      write(property, value);
      draw(Boolean(playback));
      updateHistoryButtons();
    };
    const enable = document.createElement('label');
    enable.className = 'field title-appearance-toggle';
    enable.textContent = 'Enabled';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = style.enabled;
    checkbox.setAttribute('aria-label', 'Enable ' + title.toLowerCase());
    checkbox.onchange = () => edit('enabled', checkbox.checked);
    enable.append(checkbox);
    group.append(enable);
    const colorRow = document.createElement('label');
    colorRow.className = 'field';
    colorRow.textContent = 'Color';
    const color = document.createElement('input');
    color.type = 'color';
    color.value = style.color;
    color.setAttribute('aria-label', title + ' color');
    color.onchange = () => edit('color', color.value);
    colorRow.append(color);
    group.append(colorRow);
    const opacity = sliderField('Opacity (%)', style.opacity, 0, 100, value => write('opacity', value), '1', group);
    opacity.setAttribute('aria-label', title + ' opacity (%)');
    opacity.parentElement.querySelector('.slider-number').setAttribute('aria-label', title + ' opacity (%) exact value');
    if (key === 'outline') sliderField('Thickness (px)', style.thickness, 0, 32, value => write('thickness', value), '1', group);
    if (key === 'shadow') sliderField('Blur (px)', style.blur, 0, 80, value => write('blur', value), '1', group);
    section.append(group);
  }
}

function inspectorSliderField(label, value, min, max, change, step, container, { compact = false } = {}) {
  const row = document.createElement('div');
  row.className = 'inspector-slider';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.setAttribute('aria-label', label);
  input.min = min;
  input.max = max;
  input.step = step;
  const exact = editableSliderValue(input, label, !compact);
  let before;
  let lastValue;
  const showValue = force => {
    lastValue = input.valueAsNumber;
    input.setAttribute('aria-valuetext', input.value);
    exact.sync(force);
  };
  input.syncValue = (next, force = false) => {
    if (before && !force) return;
    input.value = Number(next.toFixed(2));
    showValue(force);
  };
  input.syncValue(value);
  const apply = () => {
    if (input.disabled || input.valueAsNumber === lastValue) return;
    before ??= snapshot();
    showValue();
    change(lastValue);
    draw(Boolean(playback));
  };
  const commit = () => {
    apply();
    if (!before) return;
    remember(before);
    before = null;
    renderTimeline();
    updateHistoryButtons();
    draw(Boolean(playback));
  };
  input.oninput = apply;
  input.onchange = input.onblur = commit;
  if (!compact) row.append(name);
  row.append(exact.number, input);
  container.append(row);
  return input;
}

function inspector() {
  const panel = $('inspect');
  panel.replaceChildren();
  const clip = active();
  renderAnimationPanel(clip);
  if (!clip) {
    panel.textContent = 'Select a clip to edit its properties.';
    return;
  }
  const name = document.createElement('div');
  name.className = 'clip-name';
  name.textContent = clip.track === 'title' ? 'Text overlay' : assets.get(clip.asset)?.name ?? clip.preset ?? effectPresetLabel(clip.effect);
  panel.append(name);
  if (canExtractAudio(clip)) {
    const extract = document.createElement('button');
    extract.type = 'button';
    extract.id = 'extractAudio';
    extract.textContent = 'Extract audio';
    extract.onclick = () => extractAudio(clip);
    panel.append(extract);
  }
  if (clip.track === 'audio') {
    const importLyrics = document.createElement('button');
    importLyrics.type = 'button';
    importLyrics.id = 'importLyrics';
    importLyrics.textContent = 'Import lyrics';
    importLyrics.onclick = () => openLyricsDialog(clip);
    panel.append(importLyrics);
  }
  if (clip.track === 'title' && clips.some(item => item.track === 'title' && item !== clip)) {
    const applyStyle = document.createElement('button');
    applyStyle.type = 'button';
    applyStyle.id = 'applyTextStyle';
    applyStyle.textContent = 'Apply style to all text';
    applyStyle.onclick = () => applyTitleStyleToAll(clip);
    panel.append(applyStyle);
  }
  const section = document.createElement('div');
  section.className = 'section';
  panel.append(section);
  const title = document.createElement('h3');
  title.textContent = 'Timing';
  section.append(title);
  const source = assets.get(clip.asset);
  const field = (label, value, min, max, change, step = '.01', container = section) => {
    const row = document.createElement('label');
    row.className = 'field';
    row.textContent = label;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = Number(value.toFixed(2));
    input.onchange = () => {
      if (!Number.isFinite(input.valueAsNumber)) return inspector();
      remember();
      change(clamp(input.valueAsNumber, min, max));
      refresh();
    };
    row.append(input);
    container.append(row);
    return input;
  };
  const sliderField = (label, value, min, max, change, step = '.01', container = section) =>
    inspectorSliderField(label, value, min, max, change, step, container);
  field('Position (s)', clip.at, 0, 36000, value => clip.at = value);
  const hasSource = Boolean(source);
  field(hasSource ? 'Source in (s)' : 'Start (s)', clip.start, 0, clip.end - .05, value => clip.start = value);
  field(hasSource ? 'Source out (s)' : 'End (s)', clip.end, clip.start + .05, source?.duration ?? 36000, value => clip.end = value);
  if (clip.track === 'effect') section.append(...effectSettings(clip));
  if (clip.track === 'overlay' || clip.track === 'visual') overlayInspector(clip, section, sliderField);
  if (source && source.type !== 'image' && !clip.audioExtracted) {
    section.append(scalarKeyframeField(clip, volumeKeyframes));
  }
  if (canFadeAudio(clip)) appendAudioFadeInspector(clip, panel);
  if (clip.track === 'audio') appendVisualizerInspector(clip, panel);
  if (clip.track === 'visual') {
    const heading = document.createElement('h3');
    heading.className = 'section';
    heading.textContent = 'Transitions and effects';
    section.append(heading);
    const choice = (label, property, options) => {
      const row = document.createElement('label');
      row.className = 'field visual-choice';
      row.textContent = label;
      const select = document.createElement('select');
      select.add(new Option('None', ''));
      for (const option of Object.keys(options)) {
        const name = option === 'Neon Outline' ? 'Neon Outline (Body)' : option;
        select.add(new Option(name, option));
      }
      select.value = clip[property] ?? '';
      select.onchange = () => {
        remember();
        clip[property] = select.value;
        refresh();
      };
      row.append(select);
      section.append(row);
    };
    choice('Effect', 'effect', effects);
    if (animatedEffects.includes(clip.effect)) section.append(...effectSettings(clip));
    else if (simpleVideoFields[clip.effect]) section.append(videoEffectSettings(clip, simpleVideoFields[clip.effect]));
    const next = nextVisual(clip);
    if (next) {
      const row = document.createElement('label');
      row.className = 'field visual-choice';
      row.textContent = 'Transition to next clip';
      const select = document.createElement('select');
      select.add(new Option('None', ''));
      for (const type of transitionTypes) select.add(new Option(type));
      const setting = cutTransition(clip, next);
      select.value = setting?.type ?? '';
      select.onchange = () => setCutTransition(clip, next, select.value, setting?.duration ?? defaultFadeDuration);
      row.append(select);
      section.append(row);
      if (setting) {
        const max = maxTransitionDuration(clip, next);
        const holdNote = document.createElement('p');
        holdNote.className = 'preset-help secondary';
        const updateNote = () => {
          holdNote.textContent = transitionHoldNote(clip, next, transitionDuration(clip, next, setting.duration));
          holdNote.hidden = !holdNote.textContent;
        };
        field('Transition duration (s)', transitionDuration(clip, next, setting.duration), Math.min(.05, max), max, value => {
          setting.duration = value;
          previewTransition(clip, next);
          syncCutMenu();
          updateNote();
        });
        section.append(holdNote);
        updateNote();
      }
    }
  }
  if (clip.track === 'visual' || clip.track === 'title') {
    const settings = animationSettings(clip, field);
    if (settings) panel.append(settings);
  }
  if (clip.track === 'visual') panel.append(backgroundInspector(clip));
  if (clip.track === 'title') {
    const copyLabel = document.createElement('label');
    copyLabel.className = 'field stacked-field';
    copyLabel.textContent = 'Text';
    const copy = document.createElement('textarea');
    copy.rows = 3;
    copy.value = clip.text;
    copy.onchange = () => {
      remember();
      clip.text = copy.value;
      refresh();
    };
    copyLabel.append(copy);
    section.append(copyLabel);
    sliderField('Font size', clip.size, 16, 160, value => clip.size = value, '1');
    titleFormattingFields(clip, section);
    titleAppearanceFields(clip, section, sliderField);
    overlayInspector(clip, section, sliderField);
  }
}

function transitionSpan(clip, next, setting, scale) {
  const span = document.createElement('div');
  span.className = 'transition-span';
  const label = document.createElement('span');
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'transition-resize';
  const position = () => {
    const seconds = transitionDuration(clip, next, setting.duration);
    span.style.left = (next.at - seconds / 2) * scale + 'px';
    span.style.width = seconds * scale + 'px';
    label.textContent = seconds.toFixed(2) + ' s';
    handle.setAttribute('aria-label', 'Resize ' + setting.type + ' transition, ' + label.textContent);
    handle.title = 'Drag to resize ' + setting.type;
  };
  handle.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    event.preventDefault();
    handle.focus({ preventScroll: true });
    pause();
    const initialTime = time;
    const state = snapshot();
    const original = setting.duration;
    const initial = transitionDuration(clip, next, original);
    selected = clip.id;
    inspector();
    const move = nextEvent => {
      if (nextEvent.pointerId !== event.pointerId) return;
      const delta = event.clientX - nextEvent.clientX;
      const seconds = transitionDuration(clip, next, initial + 2 * Math.round(delta / scale * 100) / 100);
      setting.duration = seconds === initial ? original : seconds;
      position();
      previewTransition(clip, next);
      inspector();
      syncCutMenu();
    };
    const end = nextEvent => {
      if (nextEvent.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (nextEvent.type === 'pointercancel') {
        setting.duration = original;
        seek(initialTime);
      } else if (setting.duration !== original) {
        remember(state);
      }
      refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  handle.onclick = event => event.stopPropagation();
  handle.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? .1 : .01;
    const current = transitionDuration(clip, next, setting.duration);
    const size = transitionDuration(clip, next, Number((current + (event.key === 'ArrowLeft' ? step : -step)).toFixed(2)));
    if (size === current) return;
    setCutTransition(clip, next, setting.type, size);
    document.querySelector('[data-transition-span="' + CSS.escape(clip.id) + '"] button')?.focus({ preventScroll: true });
  };
  span.dataset.transitionSpan = clip.id;
  span.append(label, handle);
  position();
  return span;
}

function scalarKeyframeDiamond(clip, key, scale, { field, label }, row) {
  const diamond = document.createElement('button');
  diamond.type = 'button';
  diamond.className = label.toLowerCase() + '-diamond';
  diamond.dataset.keyframeClip = clip.id;
  diamond.dataset.keyframeField = field;
  const position = at => {
    diamond.dataset.keyframeTime = at;
    diamond.style.left = (clip.at + at - clip.start) * scale + 'px';
    diamond.classList.toggle('at-start', at === clip.start);
    if (row !== undefined) diamond.style.top = row * 53 + (at === clip.start ? 37 : 29) + 'px';
    const title = label + ' keyframe, ' + (at - clip.start).toFixed(2) + ' s, ' + Math.round(key.value) + '%';
    diamond.title = title;
    diamond.setAttribute('aria-label', title);
  };
  const selectKey = at => {
    pause();
    selected = clip.id;
    seekClipKeyframe(clip, at);
  };
  const place = (at, keys) => {
    const index = keys.findIndex(item => item.at === key.at);
    const before = keys[index - 1];
    const after = keys[index + 1];
    const min = Math.max(clip.start, before ? Math.min(key.at, before.at + .001) : clip.start);
    const max = Math.min(clip.end, after ? Math.max(key.at, after.at - .001) : clip.end);
    return clamp(Number(at.toFixed(3)), min, max);
  };
  const replace = (at, keys) => {
    clip[field] = at === key.at ? keys : keys.map(item => item.at === key.at ? { ...item, at } : item);
  };
  const isCurveOpen = () => isKeyframeCurveOpen(field, clip, key.at);
  const moveOpenCurve = (at, wasOpen) => {
    if (wasOpen) openKeyframeCurves[field] = { clip: clip.id, at };
  };
  const focus = at => {
    document.querySelector('[data-keyframe-clip="' + CSS.escape(clip.id) +
      '"][data-keyframe-field="' + field + '"][data-keyframe-time="' + at + '"]')?.focus({ preventScroll: true });
  };
  diamond.onpointerdown = event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    event.preventDefault();
    const state = snapshot();
    const originalKeys = clip[field];
    const originalTime = time;
    const curveWasOpen = isCurveOpen();
    let at = key.at;
    selectKey(at);
    inspector();
    diamond.classList.add('dragging');
    const move = next => {
      if (next.pointerId !== event.pointerId) return;
      at = place(key.at + (next.clientX - event.clientX) / scale, originalKeys);
      moveOpenCurve(at, curveWasOpen);
      replace(at, originalKeys);
      position(at);
      seekClipKeyframe(clip, at);
      inspector();
    };
    const end = next => {
      if (next.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (next.type === 'pointercancel') {
        replace(key.at, originalKeys);
        moveOpenCurve(key.at, curveWasOpen);
        seek(originalTime);
      } else if (at !== key.at) {
        remember(state);
      }
      refresh();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };
  diamond.onclick = event => {
    event.stopPropagation();
    if (event.detail !== 0) return;
    selectKey(key.at);
    refresh();
    focus(key.at);
  };
  diamond.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? .1 : .01;
    const keys = clip[field];
    const at = place(key.at + (event.key === 'ArrowLeft' ? -step : step), keys);
    if (at === key.at) return;
    remember();
    replace(at, keys);
    moveOpenCurve(at, isCurveOpen());
    selectKey(at);
    refresh();
    focus(at);
  };
  position(key.at);
  return diamond;
}

function renderTimeline() {
  syncExtractedAudioTracks();
  const scale = zoom();
  const width = Math.max($('scroll').clientWidth, (duration() + 2) * scale);
  const span = Math.max(1, Math.ceil(56 / scale));
  $('lanes').style.width = width + 'px';
  $('lanes').style.setProperty('--tick', scale * span / 5 + 'px');
  const ruler = $('ruler');
  ruler.replaceChildren();
  for (let value = 0; value * scale < width; value += span) {
    const mark = document.createElement('span');
    mark.className = 'tick mono';
    mark.style.left = (value * scale + 4) + 'px';
    mark.textContent = formatTime(value).slice(0, 5);
    ruler.append(mark);
  }
  for (const lane of document.querySelectorAll('.lane')) lane.replaceChildren();
  timelineWaveforms.length = 0;
  const effectRows = effectTrackRows();
  for (const clip of clips) {
    const button = document.createElement('button');
    const asset = assets.get(clip.asset);
    button.className = 'clip ' + ({visual: 'picture', title: 'title-clip', audio: 'audio-clip', overlay: 'overlay-clip', effect: 'effect-clip'}[clip.track]);
    if (selected === clip.id) button.classList.add('selected');
    button.dataset.id = clip.id;
    button.style.left = clip.at * scale + 'px';
    button.style.width = length(clip) * scale + 'px';
    if (asset?.thumb) button.style.backgroundImage = 'linear-gradient(90deg,#0b112099,#0b112033),url("' + asset.thumb + '")';
    const label = document.createElement('span');
    label.textContent = clipLabelText(clip);
    button.title = label.textContent;
    button.append(label);
    if (!clip.audioExtracted && (asset?.type === 'video' || asset?.type === 'audio')) addTimelineWaveform(button, clip, asset);
    for (const edge of ['start', 'end']) {
      const handle = document.createElement('i');
      handle.className = 'handle ' + edge;
      handle.dataset.edge = edge;
      button.append(handle);
    }
    button.onpointerdown = event => dragClip(event, clip);
    button.oncontextmenu = event => showTimelineClipMenu(event, clip);
    button.onclick = event => {
      if (event.detail === 0) {
        selected = clip.id;
        refresh();
      }
    };
    const lane = document.querySelector('[data-track="' + timelineTrack(clip) + '"]');
    lane.append(button);
    if (canFadeAudio(clip)) lane.append(audioFadeHandles(clip, scale));
    if (clip.track === 'effect') {
      const row = effectRows.get(clip.id);
      button.style.top = row * 53 + 6 + 'px';
      for (const key of clip.effectIntensityKeys ?? []) {
        if (key.at >= clip.start && key.at <= clip.end) lane.append(scalarKeyframeDiamond(clip, key, scale, intensityKeyframes, row));
      }
    }
    const badge = animationClipBadge(clip, scale);
    if (badge) lane.append(badge);
    const animations = animationClipSpans(clip, scale);
    if (animations) lane.append(animations);
    if (hasLayerTransform(clip)) {
      for (const key of clip.overlayKeys ?? []) {
        if (key.at >= clip.start && key.at <= clip.end) lane.append(overlayKeyDiamond(clip, key, scale));
      }
    }
    if (!clip.audioExtracted && (asset?.type === 'video' || asset?.type === 'audio')) {
      for (const key of clip.volumeKeys ?? []) {
        if (key.at >= clip.start && key.at <= clip.end) lane.append(scalarKeyframeDiamond(clip, key, scale, volumeKeyframes));
      }
    }
  }
  const order = videoTrackOrder();
  const videoLane = document.querySelector('[data-track="visual"]');
  for (const clip of order) {
    if (animatedEffects.includes(clip.effect)) {
      for (const key of clip.effectIntensityKeys ?? []) {
        if (key.at >= clip.start && key.at <= clip.end) videoLane.append(scalarKeyframeDiamond(clip, key, scale, intensityKeyframes));
      }
    }
    const next = nextVisual(clip, order);
    if (!next) continue;
    const setting = cutTransition(clip, next);
    if (setting) videoLane.append(transitionSpan(clip, next, setting, scale));
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'cut-marker';
    marker.classList.toggle('has-transition', Boolean(setting));
    marker.dataset.cut = clip.id;
    marker.setAttribute('aria-haspopup', 'dialog');
    marker.setAttribute('aria-controls', 'cutMenu');
    marker.style.left = next.at * scale + 'px';
    marker.textContent = setting ? '\u25c6' : '+';
    marker.title = (setting ? 'Edit ' + setting.type : 'Add transition') + ' at ' + formatTime(next.at);
    marker.setAttribute('aria-label', marker.title);
    marker.onclick = event => {
      event.stopPropagation();
      openCutMenu(clip, next, marker);
    };
    videoLane.append(marker);
  }
  syncCutMenu();
  syncTimelineRange();
  paintAudioWaveforms();
}

function updateHistoryButtons() {
  $('undo').disabled = !undo.length;
  $('redo').disabled = !redo.length;
}

function refresh() {
  time = clamp(time, 0, duration());
  reconcileTimelineRange();
  updateHistoryButtons();
  syncTrackMixer();
  const clip = active();
  $('remove').disabled = $('rippleDelete').disabled = !clip;
  const lyrics = $('timelineImportLyrics');
  lyrics.disabled = clip?.track !== 'audio';
  lyrics.title = lyrics.disabled ? 'Select an audio clip first' : 'Import timed lyrics for this audio clip';
  if (lyrics.disabled) lyrics.setAttribute('aria-describedby', 'timelineImportLyricsWhy');
  else lyrics.removeAttribute('aria-describedby');
  syncFramecutSongSpecSelection(clip);
  renderTimeline();
  inspector();
  prewarmTransitions();
  draw(Boolean(playback));
}

function magneticVideo(clip) {
  return clip.track === 'visual' && $('magnet').getAttribute('aria-pressed') === 'true';
}

function videoTrackOrder() {
  return clips.filter(clip => clip.track === 'visual').sort((a, b) => a.at - b.at);
}

function packVideoTrack(order) {
  let at = 0;
  for (const clip of order) {
    clip.at = at;
    at += length(clip);
  }
}

function dragClip(event, clip) {
  if (event.button !== 0) return;
  event.preventDefault();
  pause();
  selected = clip.id;
  const state = snapshot();
  const origin = { ...clip };
  const edge = event.target.dataset.edge;
  const x = event.clientX;
  const scale = zoom();
  const guide = $('snapGuide');
  const magnet = magneticVideo(clip);
  const videoOrder = magnet ? videoTrackOrder() : [];
  const videoPositions = videoOrder.map(item => ({ item, at: item.at, midpoint: item.at + length(item) / 2 }));
  const neighbors = videoPositions.filter(position => position.item !== clip);
  const targets = [time];
  let trimStart = origin.at;
  let packedAt = 0;
  for (const other of magnet && edge ? videoOrder : []) {
    if (other === clip) trimStart = packedAt;
    else targets.push(packedAt, packedAt + length(other));
    packedAt += length(other);
  }
  for (const other of clips) {
    if (other === clip || (magnet && edge && other.track === 'visual')) continue;
    targets.push(other.at, other.at + length(other));
  }

  const trailing = trimStart + length(origin);
  const movingEdges = edge === 'start' ? [trimStart] : edge === 'end' ? [trailing] : [origin.at, trailing];
  let minimum = -origin.at;
  let maximum = 36000 - origin.at;
  if (edge === 'start') {
    minimum = magnet ? -origin.start : Math.max(-origin.start, -origin.at);
    maximum = length(origin) - .05;
  } else if (edge === 'end') {
    minimum = .05 - length(origin);
    maximum = (assets.get(clip.asset)?.duration ?? 36000) - origin.end;
  }

  const snapDistance = 8 / scale;
  let dragging = false;
  const move = next => {
    if (next.pointerId !== event.pointerId) return;
    const pixels = next.clientX - x;
    if (!dragging && Math.abs(pixels) < 3) return;
    dragging = true;
    const rawDelta = pixels / scale;
    if (magnet && !edge) {
      const midpoint = origin.at + length(origin) / 2 + rawDelta;
      const order = neighbors.map(position => position.item);
      const slot = neighbors.findIndex(position => midpoint < position.midpoint);
      order.splice(slot === -1 ? order.length : slot, 0, clip);
      packVideoTrack(order);
      renderTimeline();
      draw();
      return;
    }
    let delta = clamp(Math.round(rawDelta * 100) / 100, minimum, maximum);
    let target;
    let nearest = snapDistance;
    if ($('snap').getAttribute('aria-pressed') === 'true') {
      for (const position of targets) {
        for (const boundary of movingEdges) {
          const candidate = position - boundary;
          const distance = Math.abs(candidate - rawDelta);
          if (candidate < minimum || candidate > maximum || distance > nearest ||
              (distance === nearest && target !== undefined)) continue;
          delta = candidate;
          target = position;
          nearest = distance;
        }
      }
    }
    guide.hidden = target === undefined;
    if (target !== undefined) guide.style.left = target * scale + 'px';

    if (edge === 'start') {
      clip.start = origin.start + delta;
      if (!magnet) clip.at = origin.at + delta;
    } else if (edge === 'end') {
      clip.end = origin.end + delta;
    } else {
      clip.at = origin.at + delta;
    }
    if (magnet) packVideoTrack(videoOrder);
    renderTimeline();
    draw();
  };
  const end = next => {
    if (next.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    guide.hidden = true;
    if (next.type === 'pointercancel') {
      Object.assign(clip, origin);
      for (const { item, at } of videoPositions) item.at = at;
    } else if (clip.at !== origin.at || clip.start !== origin.start || clip.end !== origin.end ||
        videoPositions.some(({ item, at }) => item.at !== at)) {
      remember(state);
    } else if (!dragging) {
      seek(clip.at);
    }
    refresh();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  refresh();
}

function addAsset(assetId) {
  const asset = assets.get(assetId);
  const track = asset.type === 'audio' ? 'audio' : 'visual';
  const end = asset.type === 'image' ? 5 : asset.duration;
  const trackEnd = Math.max(0, ...clips.filter(clip => clip.track === track).map(clip => clip.at + length(clip)));
  const clip = { id: id(), track, asset: assetId, at: track === 'audio' ? Math.max(trackEnd, time) : trackEnd, start: 0, end, volume: 1 };
  remember();
  if (magneticVideo(clip)) {
    const order = videoTrackOrder();
    let slot = 0;
    let nearest = Infinity;
    let boundary = Infinity;
    for (const [index, existing] of order.entries()) {
      for (const [position, insertion] of [[existing.at, index], [existing.at + length(existing), index + 1]]) {
        const distance = Math.abs(time - position);
        if (distance < nearest || (distance === nearest && position < boundary)) {
          nearest = distance;
          boundary = position;
          slot = insertion;
        }
      }
    }
    order.splice(slot, 0, clip);
    packVideoTrack(order);
  }
  clips.push(clip);
  selected = clip.id;
  seek(clip.at);
  refresh();
}

function releaseMediaAsset(asset) {
  asset.gain?.disconnect();
  if (asset.type !== 'image') {
    asset.media.pause();
    asset.media.removeAttribute('src');
    asset.media.load();
  }
  if (!asset.sourceVideo) URL.revokeObjectURL(asset.url);
}

async function loadMediaAsset(file, assetId) {
  const type = file.type.split('/')[0];
  if (!['image', 'video', 'audio'].includes(type)) throw Error('Unsupported media: ' + file.name);
  const url = URL.createObjectURL(file);
  const media = type === 'image' ? new Image() : document.createElement(type);
  try {
    await new Promise((resolve, reject) => {
      media.addEventListener(type === 'image' ? 'load' : 'loadeddata', resolve, { once: true });
      media.addEventListener('error', () => reject(Error('Could not decode ' + file.name)), { once: true });
      if (type !== 'image') media.preload = 'auto';
      media.src = url;
    });
    const duration = type === 'image' ? 36000 : media.duration;
    if (!Number.isFinite(duration) || duration < .05) throw Error('Unsupported duration: ' + file.name);
    let thumb = type === 'image' ? url : '';
    let features;
    if (type === 'video') {
      const still = document.createElement('canvas');
      still.width = 160;
      still.height = 90;
      still.getContext('2d').drawImage(media, 0, 0, 160, 90);
      thumb = still.toDataURL('image/jpeg', .7);
      features = sceneFeatures(still);
    }
    const asset = { name: file.name, type, media, url, duration, thumb, features, file };
    if (type === 'video') {
      asset.hasAudio = await hasEmbeddedAudio(asset);
      media.addEventListener('seeked', () => {
        if (assets.get(assetId) === asset && !playback && !exporting) draw();
      });
    }
    return asset;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function importFiles(files, overlayAt) {
  pause();
  const revision = projectRevision;
  const errors = [];
  for (const file of files) {
    try {
      if (overlayAt !== undefined && !file.type.startsWith('image/')) {
        throw Error('Choose an image for the overlay: ' + file.name);
      }
      const assetId = id();
      const asset = await loadMediaAsset(file, assetId);
      if (revision !== projectRevision) {
        releaseMediaAsset(asset);
        return;
      }
      assets.set(assetId, asset);
      if (overlayAt === undefined) addAsset(assetId);
      else addOverlay({ asset: assetId, at: overlayAt });
    } catch (error) {
      if (revision !== projectRevision) return;
      errors.push(error.message);
    }
  }
  renderBin();
  if (errors.length) notify(errors.join(' · '));
  else notify(overlayAt === undefined ? 'Media added to the timeline.' : 'Images added to the Overlay track.');
}

function canSplitClip(clip) {
  return Boolean(clip && time > clip.at + .049 && time < clip.at + length(clip) - .049);
}

function split() {
  const clip = active();
  if (!canSplitClip(clip)) return;
  remember();
  const point = clip.start + time - clip.at;
  const right = { ...clip, id: id(), at: time, start: point };
  if (clip.background) right.background = { ...clip.background };
  if (clip.visualizer) right.visualizer = { ...clip.visualizer };
  if (clip.audioFadeIn || clip.audioFadeOut) {
    const { audioFadeIn, audioFadeOut } = audioFadeDurations(clip);
    clip.audioFadeIn = audioFadeIn;
    right.audioFadeOut = audioFadeOut;
    delete clip.audioFadeOut;
    delete right.audioFadeIn;
  }
  clip.end = point;
  delete clip.fadeOut;
  delete clip.exit;
  delete clip.textOut;
  delete clip.transition;
  delete right.fadeIn;
  delete right.entrance;
  delete right.textIn;
  clips.splice(clips.indexOf(clip) + 1, 0, right);
  selected = right.id;
  refresh();
}

function clipLabelText(clip) {
  const text = assets.get(clip.asset)?.name ?? clip.preset ?? clip.text ?? effectPresetLabel(clip.effect);
  return String(text ?? 'clip').replace(/\s+/g, ' ').trim() || 'clip';
}

function remove(ripple = false) {
  const removed = active();
  if (!removed) return;
  remember();
  clips = clips.filter(clip => clip !== removed);
  if (ripple) {
    const removedLength = length(removed);
    const removedEnd = removed.at + removedLength;
    for (const clip of clips) {
      if (timelineTrack(clip) === timelineTrack(removed) && clip.at >= removedEnd - 1e-9) {
        clip.at = Math.max(removed.at, clip.at - removedLength);
      }
    }
  } else if (magneticVideo(removed)) {
    packVideoTrack(videoTrackOrder());
  }
  selected = null;
  refresh();
  notify('Deleted \u201c' + clipLabelText(removed) + '\u201d. Press Ctrl Z to undo.');
}

function createTitleClip(text, at, seconds) {
  return { id: id(), track: 'title', text, at, start: 0, end: seconds, size: 64 };
}

function addTitle() {
  remember();
  const clip = createTitleClip('Your title', time, 3);
  clips.push(clip);
  selected = clip.id;
  refresh();
  $('inspect').querySelector('textarea').select();
}

const formats = [
  ['MP4', 'video/mp4', 'mp4'],
  ['WebM', 'video/webm;codecs=vp9,opus', 'webm'],
  ['WebM (VP8)', 'video/webm;codecs=vp8,opus', 'webm'],
  ['Transparent WebM (VP8)', 'video/webm;codecs=vp8,opus', 'webm', 'transparent-webm']
].filter(([, mime]) => globalThis.MediaRecorder?.isTypeSupported(mime));
for (const [name, mime, , value = mime] of formats) $('format').add(new Option(name, value));

async function connectAudio() {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  audioBus ??= audioContext.createMediaStreamDestination();
  for (const asset of assets.values()) {
    if (asset.type === 'image' || asset.gain) continue;
    const node = audioContext.createMediaElementSource(asset.media);
    asset.gain = audioContext.createGain();
    asset.media.volume = 1;
    node.connect(asset.gain);
    asset.gain.connect(audioContext.destination);
    asset.gain.connect(audioBus);
  }
}

const minutesSeconds = seconds => {
  const whole = Math.max(0, Math.round(seconds));
  return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
};

function resetExportDialog() {
  const total = duration();
  $('exportText').textContent = 'Render the timeline to a downloadable video. Keep this tab open during export.';
  $('exportSummary').textContent = 'Project length ' + minutesSeconds(total) + ' \u00b7 ' + canvas.width + ' \u00d7 ' + canvas.height +
    ' (' + $('ratio').value + '). Recording takes about ' + minutesSeconds(total) + ' \u2014 keep this tab open.';
  $('cancel').textContent = 'Cancel';
  $('render').hidden = false;
  $('render').disabled = false;
  $('format').disabled = false;
  $('exportElapsed').hidden = true;
  $('progress').hidden = true;
}

async function renderExport() {
  const total = duration();
  if (!total || !formats.length) return;
  const initialTime = time;
  const format = $('format').value;
  const [, mimeType, extension] = formats.find(([, mime, , value = mime]) => value === format);
  $('render').disabled = true;
  $('format').disabled = true;
  $('cancel').textContent = 'Cancel';
  $('progress').hidden = false;
  $('progress').value = 0;
  $('exportElapsed').hidden = false;
  $('exportElapsed').textContent = minutesSeconds(0) + ' / ' + minutesSeconds(total);
  $('exportText').textContent = 'Rendering at playback speed…';
  const job = { cancel: false, transparent: format === 'transparent-webm' };
  exporting = job;
  let stream;
  let recorder;
  try {
    await Promise.all(clips.filter(clip => clip.track === 'title').map(loadTitleClipFont));
    const hasAudio = clips.some(clip => {
      const asset = assets.get(clip.asset);
      return asset && asset.type !== 'image' && trackOutputLevel(timelineTrack(clip)) > 0 && clipHasVolume(clip);
    });
    if (hasAudio) await connectAudio();
    if (clips.some(clip => activeBackground(clip) || subjectEffects.includes(clip.effect))) await loadPersonModel();
    const details = new Set(clips.map(clip => bodyDetailKind(clip.effect)).filter(Boolean));
    if (details.has('face')) details.add('hand');
    await Promise.all([...details].map(loadBodyDetailModel));
    const order = videoTrackOrder();
    const beatAssets = new Set();
    if (clips.some(clip => beatFlashEffects.includes(clip.effect))) {
      for (const asset of effectAudioAssets()) beatAssets.add(asset);
    }
    for (const clip of order) {
      if (clip.transition?.type !== 'Beat Sync') continue;
      const next = nextVisual(clip, order);
      if (next?.id !== clip.transition.to) continue;
      const span = transitionDuration(clip, next, clip.transition.duration);
      for (const source of beatSources(clip, next, span)) beatAssets.add(assets.get(source.asset));
    }
    await Promise.all([...beatAssets].map(asset => audioOnsets(asset).done));
    if (!job.cancel) {
      const prepared = prepareBodyTrails(0, total, () => job.cancel);
      if (prepared) {
        $('exportText').textContent = 'Preparing motion trails…';
        await prepared;
        $('exportText').textContent = 'Rendering at playback speed…';
      }
    }
    if (job.cancel) return;
    await warmTransitions();
    if (job.cancel) return;
    maskHistory.delete(canvas);
    maskHistory.delete(transitionLayer);
    bodyOutlineTracks = new WeakMap();
    renderFrame(0);
    stream = canvas.captureStream(0);
    const videoTrack = stream.getVideoTracks()[0];
    if (hasAudio) {
      for (const track of audioBus.stream.getAudioTracks()) stream.addTrack(track.clone());
    }
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });
    const parts = [];
    recorder.ondataavailable = event => {
      if (event.data.size) parts.push(event.data);
    };
    let failed;
    recorder.onerror = event => {
      failed = event.error || Error('Recording failed.');
      job.cancel = true;
    };
    const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
    recorder.start();
    renderFrame(0);
    videoTrack.requestFrame();
    let lastFrame = 0;
    const start = performance.now();
    await new Promise(resolve => {
      const frame = now => {
        const position = (now - start) / 1000;
        if (job.cancel || position >= total) return resolve();
        if (position - lastFrame >= 1 / 30 - .002) {
          time = position;
          lastFrame = position;
          draw(true);
          videoTrack.requestFrame();
          $('progress').value = position / total;
          $('exportElapsed').textContent = minutesSeconds(position) + ' / ' + minutesSeconds(total);
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    if (failed) throw failed;
    if (job.cancel) {
      $('exportText').textContent = 'Export canceled.';
      return;
    }
    if (!parts.length) throw Error('The browser returned an empty recording.');
    const exportBlob = new Blob(parts, { type: mimeType.split(';')[0] });
    const exportName = ($('project').value.trim().replace(/[\\/:*?"<>|]/g, '-') || 'Framecut') + '.' + extension;
    const url = URL.createObjectURL(exportBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    rememberLastExport(exportBlob, exportName, exportBlob.type);
    job.finished = exportName;
    $('exportText').textContent = 'Exported ' + exportName + '. Check your browser downloads.';
    notify('Export complete. Check your browser downloads.');
  } catch (error) {
    $('exportText').textContent = 'Export failed. ' + error.message;
  } finally {
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop());
    exporting = null;
    maskHistory.delete(canvas);
    maskHistory.delete(transitionLayer);
    bodyOutlineTracks = new WeakMap();
    seek(initialTime);
    $('render').disabled = false;
    $('format').disabled = false;
    $('cancel').textContent = job.finished ? 'Done' : 'Cancel';
    $('render').hidden = Boolean(job.finished);
    if (job.finished) $('exportSummary').textContent = '';
    $('progress').hidden = true;
    $('exportElapsed').hidden = true;
  }
}

$('new').onclick = () => {
  if (clips.length && !confirm('Clear the current timeline and start a new project?')) return;
  pause();
  remember();
  clips = [];
  trackMix = defaultTrackMix();
  selected = null;
  $('project').value = 'Untitled project';
  seek(0);
  refresh();
  savedProjectState = projectEditState();
};
$('import').onclick = () => $('file').click();
$('importOverlay').onclick = () => $('overlayFile').click();
$('overlayFile').onchange = async () => {
  const files = [...$('overlayFile').files];
  $('overlayFile').value = '';
  if (files.length) await importFiles(files, time);
};
$('file').onchange = async () => {
  await importFiles([...$('file').files]);
  $('file').value = '';
};
$('media').ondragover = event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  $('media').classList.add('drop');
};
$('media').ondragleave = () => $('media').classList.remove('drop');
$('media').ondrop = event => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  $('media').classList.remove('drop');
  const files = [...event.dataTransfer.files];
  const spec = files.find(isSongSpecFile);
  if (spec) dropFramecutSongSpec(spec);
  const media = files.filter(file => !isSongSpecFile(file));
  if (media.length) importFiles(media);
};
$('play').onclick = togglePlayback;
$('back').onclick = () => seek(0);
$('forward').onclick = () => seek(duration());
$('ratio').onchange = () => {
  if (exporting) return;
  remember({ ...snapshot(), ratio: canvas.width === canvas.height ? '1:1' : canvas.width > canvas.height ? '16:9' : '9:16' });
  setRatio($('ratio').value);
  refresh();
};
$('lanes').onclick = event => {
  if (event.target.closest('.lane, #ruler') &&
      !event.target.closest('.clip, .transition-span, .intensity-diamond, .volume-diamond, .overlay-key-diamond, .clip-animation-spans, .clip-animation-badge, .audio-fade-handle')) {
    seek((event.clientX - $('lanes').getBoundingClientRect().left) / zoom());
  }
};
connectTimelineRange();
connectTrackMixer();
{
  const bar = document.querySelector('.timeline .toolbar');
  const sync = () => bar.classList.toggle('can-scroll-right', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
  bar.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  setTimeout(sync, 0);
}
$('zoom').oninput = () => {
  zoomChosen = true;
  refresh();
};
$('zoomFit').onclick = () => {
  fitZoom(true);
  zoomChosen = false;
  refresh();
};
$('cutType').add(new Option('None', ''));
for (const type of transitionTypes) $('cutType').add(new Option(type));
$('cutType').onchange = () => editOpenCut($('cutType').value, Number($('cutDuration').value));
$('cutDuration').onchange = () => {
  const value = $('cutDuration').valueAsNumber;
  if (Number.isFinite(value)) editOpenCut($('cutType').value, clamp(value, .05, 10));
  else syncCutMenu();
};
$('cutRemove').onclick = () => {
  editOpenCut('', defaultFadeDuration);
  $('cutType').focus({ preventScroll: true });
};
$('scroll').addEventListener('scroll', syncCutMenu);
$('scroll').addEventListener('scroll', scheduleAudioWaveforms, { passive: true });
for (const lane of document.querySelectorAll('[data-track="visual"], [data-track="title"]')) {
  const track = lane.dataset.track;
  lane.ondragover = event => {
    const drop = presetDropTarget(event, track);
    clearPresetDrop();
    if (!drop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    drop.target.classList.add(drop.highlight);
  };
  lane.ondragleave = event => {
    if (!lane.contains(event.relatedTarget)) clearPresetDrop();
  };
  lane.ondrop = event => {
    const drop = presetDropTarget(event, track);
    clearPresetDrop();
    if (!drop) return;
    event.preventDefault();
    const { target, mime } = drop;
    const payload = event.dataTransfer.getData(mime);
    const clip = clips.find(item => item.id === (target.dataset.cut ?? target.dataset.id));
    if (!clip) return;
    if (mime === animationDragTypes[track]) {
      applyDroppedAnimation(clip, payload);
    } else if (mime === effectDragType) {
      if (animatedEffects.includes(payload)) applyEffectPreset(clip, payload);
    } else {
      const next = nextVisual(clip);
      if (next) applyTransitionPreset(clip, next, payload);
    }
  };
}
for (const control of ['snap', 'magnet']) {
  const button = $(control);
  button.onclick = () => button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
}
$('undo').onclick = () => history(undo, redo);
$('redo').onclick = () => history(redo, undo);
$('split').onclick = split;
$('remove').onclick = () => remove();
$('rippleDelete').onclick = () => remove(true);
$('addTitle').onclick = addTitle;
$('export').onclick = () => {
  if (!duration()) return notify('Add a clip before exporting.');
  if (!formats.length) return notify('Video export requires a browser that supports MediaRecorder.');
  pause();
  resetExportDialog();
  $('dialog').showModal();
};
$('render').onclick = async () => {
  const toDrive = $('exportToDrive').checked;
  let signing;
  if (toDrive && typeof SongDrive !== 'undefined') {
    // Google's sign-in popup has to open from this click, before the render starts.
    $('render').disabled = true;
    signing = SongDrive.signIn();
    try {
      await signing;
    } catch (error) {
      $('exportText').textContent = driveError(error);
      $('render').disabled = false;
      return;
    }
    if (!$('dialog').open) {
      $('render').disabled = false;
      return;
    }
  }
  const before = lastExport;
  await renderExport();
  $('render').disabled = false;
  if (toDrive && lastExport && lastExport !== before) {
    const saved = await saveExportToDriveAfterExport(lastExport);
    if ($('dialog').open) {
      $('exportText').textContent += saved ? ' Also saved to Google Drive.' : ' Saving to Google Drive failed; use Drive \u203a Save last export to Drive to try again.';
    }
  }
};
$('cancel').onclick = () => {
  if (exporting) exporting.cancel = true;
  else $('dialog').close();
};
$('dialog').oncancel = event => {
  if (!exporting) return;
  event.preventDefault();
  exporting.cancel = true;
};
window.addEventListener('keydown', event => {
  if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'z' &&
    !event.target.closest('textarea, select, input:not([type=range]), [contenteditable=true]') && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    $('zoomFit').click();
    return;
  }
  if (event.target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const shortcut = event.key.toLowerCase();
  if (!event.ctrlKey && !event.metaKey && !event.altKey && (shortcut === 'i' || shortcut === 'o')) {
    event.preventDefault();
    markTimelineRange(shortcut === 'i' ? 'start' : 'end');
    return;
  }
  if (event.target.closest('button')) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) history(redo, undo);
    else history(undo, redo);
  } else if (event.code === 'Space') {
    event.preventDefault();
    togglePlayback();
  } else if (event.key.toLowerCase() === 's') split();
  else if (event.key === 'Delete') remove();
});
window.addEventListener('resize', () => {
  if (!zoomChosen) fitZoom();
  renderTimeline();
  updatePosition();
});
demo.addEventListener('load', () => draw());
renderBin();
renderPresets();
connectEffectTrack();
renderOverlayPresets();
connectOverlayPreview();
connectBodySubjectPreview();
connectAnimationClipboard();
refresh();
connectProjectFiles();
connectFramecutSongSpec();
connectPlaceClips();
connectFramecutDrive();
connectLyricsImport();
