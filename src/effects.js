'use strict';

const trendingEffects = ['Playful Pendulum', 'Camera Shake', 'Flash Vibration', 'Rebound Swing', 'Black flash', 'White flash'];
const glitchVideoEffects = ['RGB Split', 'Digital Artifacts', 'Chromatic Screen Tear', 'Signal Loss',
  'Pixelate', 'Scanlines', 'Wave Distortion', 'Ripple', 'Liquid', 'Data Moshing', 'Cyberpunk Glitch', 'TV Static'];
const lightVideoEffects = ['Lens Flare', 'Atmospheric lighting', 'Light Leaks', 'Prism', 'Rainbow', 'Sunbeam', 'Disco',
  'Strobe', 'Neon Edge', 'Angel Light', 'Bloom', 'Soft Glow', 'Stage Spotlight', 'Chromatic Glow', 'Bokeh', 'Light Rays'];
const blurVideoEffects = ['Oblique Blur', 'Gaussian Blur', 'Motion Blur', 'Chrome Blur', 'Radial Blur', 'Zoom Blur',
  'Lens Blur', 'Fisheye', 'Wide Angle', 'Edge Glow', 'Vignette', 'Tilt Shift', 'Smart Sharpen', 'Focus Pull'];
const retroVideoEffects = ['VHS', 'DV', '1998', 'Fault Cassette', 'Film Grain', 'Film Scratches', 'Dust', 'Super 8',
  'Old Film', 'Camcorder', 'Kodak/Fuji Film Emulations', 'Film Burn', 'Sepia', 'Vintage TV'];
const partyVideoEffects = ['Color Negative', 'Flash', 'Laser Beam', 'Beat Zoom', 'Club Strobe',
  'Black and White Flash', 'Vibration Flash'];
const textureVideoEffects = ['Rain', 'Snow', 'Fog', 'Smoke', 'Sparks', 'Embers', 'Cherry Blossoms', 'Film Scratch',
  'Water Droplets', 'Paper Texture', 'CRT Grid', 'Lightning', 'Wind'];
const videoNeonOutline = 'Neon Outline (Video)';
const artisticVideoEffects = ['Cartoon', 'Comic Book', 'Pencil Sketch', 'Ink Outline', 'Watercolor', 'Oil Painting',
  'Halftone', 'Pop Art', videoNeonOutline, 'Manga Speed Lines', 'Posterize'];
const splitVideoEffects = ['2-Screen', '3-Screen', '4-Screen', '9-Grid', 'Mirror', 'Kaleidoscope', 'Tunnel', 'Echo/Ghosting'];
const frameVideoEffects = ['Film Frame', 'Polaroid Frame', 'Viewfinder', 'Letterbox', 'Rounded Corners', 'Neon Frame'];
const filmStocks = {
  'Kodak-style': 'saturate(1.19) sepia(.22) contrast(1.13) brightness(1.04)',
  'Fuji-style': 'sepia(.17) hue-rotate(17deg) saturate(1.3) contrast(.95) brightness(1.07)'
};
const retroGrades = {
  DV: 'saturate(.75) contrast(1.24) brightness(1.03)',
  '1998': 'saturate(.73) sepia(.26) hue-rotate(-9deg) contrast(.86) brightness(1.14)',
  'Fault Cassette': 'saturate(1.34) hue-rotate(-18deg) contrast(1.08)',
  'Super 8': 'sepia(.34) saturate(1.3) contrast(1.13)',
  'Old Film': 'grayscale(.9) sepia(.38) contrast(1.24)',
  Camcorder: 'saturate(.8) contrast(1.13) hue-rotate(9deg)',
  Sepia: 'sepia(.8)',
  'Vintage TV': 'grayscale(.9) contrast(1.6) brightness(.89)'
};
const outlineEffects = ['Neon Outline', 'Electric Edge', 'Saber/Laser Outline', 'Doodle Outline', 'Dashed Line', 'Rainbow Aura', 'Double Outline'];
const cloneTrailEffects = ['Shadow Clone', 'Ghost Trail', 'Step Print', 'Rainbow Trail', 'Afterimage', 'Split Clone'];
const auraEnergyEffects = ['Energy Aura', 'Fire Aura', 'Electric Aura', 'Angel Halo', 'Laser Eyes',
  'Lightning Hands', 'Ice Breath', 'Electric Shock', 'Wings', 'Spirit Glow'];
const bodyDistortionEffects = ['Big Head', 'Big Eyes', 'Bobblehead', 'Pixel Face', 'Emoji Face', 'Glitch Head',
  '3D Sunglasses', 'Neon Mask', 'Anime Eyes', 'Long Legs', 'Slim Body', 'Stretch Body'];
const moodyBodyEffects = ['Dark Angel', 'Red Eyes', 'Smoke Body', 'Shadow Silhouette', 'Shatter Body', 'Statue/Stone'];
const poseBodyEffects = [...auraEnergyEffects, ...bodyDistortionEffects, ...moodyBodyEffects];
const bodyEffectPlacement = ['size', 'offsetX', 'offsetY'];
const bodyEffectControls = {
  size: { label: 'Effect size (%)', min: 25, max: 250, step: '.1', initial: 100 },
  offsetX: { label: 'Horizontal offset (%)', min: -25, max: 25, step: '.1', initial: 0 },
  offsetY: { label: 'Vertical offset (%)', min: -25, max: 25, step: '.1', initial: 0 },
  range: { label: 'Range (%)', min: 0, max: 250, step: '.1', initial: 100 },
  thickness: { label: 'Outline thickness (%)', min: 10, max: 400, step: '.1', initial: 100 },
  trailLength: { label: 'Trail length (s)', min: .08, max: 2.5, step: '.01' }
};
const bodyEffectDefaults = { size: 1, dx: 0, dy: 0, range: 1, thickness: 1 };

function bodyEffectControlNames(effect) {
  if (outlineEffects.includes(effect)) return ['offsetX', 'offsetY', 'thickness'];
  if (cloneTrailEffects.includes(effect)) {
    return [...bodyEffectPlacement, 'range', ...(isMotionTrail(effect) ? ['trailLength'] : [])];
  }
  if (bodyDistortionEffects.includes(effect) || effect === 'Angel Halo') return bodyEffectPlacement;
  if (auraEnergyEffects.includes(effect) || ['Dark Angel', 'Red Eyes', 'Smoke Body'].includes(effect)) {
    return [...bodyEffectPlacement, 'range'];
  }
  if (effect === 'Magic Brush') return ['size'];
  if (['Body Effects', 'AI Portrait', 'Shatter Body'].includes(effect)) return ['range'];
  return [];
}

function bodyEffectValue(clip, name) {
  const { min, max, initial } = bodyEffectControls[name];
  const value = clip.bodyEffectAdjustments?.[clip.effect]?.[name];
  return Number.isFinite(value) ? clamp(value, min, max) : initial ?? trailPresets[clip.effect].delays[0];
}

function bodyEffectGeometry(clip, subject) {
  const { width, height, pose } = subject.bodySource ?? subject;
  const scale = pose?.scale ?? 1;
  const offsetX = bodyEffectValue(clip, 'offsetX') / 100 * width * scale;
  const offsetY = bodyEffectValue(clip, 'offsetY') / 100 * height * scale;
  const [dx, dy] = pose ? rotateOverlayPoint(offsetX, offsetY, pose.angle) : [offsetX, offsetY];
  return { dx, dy, size: bodyEffectValue(clip, 'size') / 100,
    range: bodyEffectValue(clip, 'range') / 100, thickness: bodyEffectValue(clip, 'thickness') / 100 };
}

function offsetBodyAnchor(point, { dx, dy }) {
  return point && (dx || dy ? [point[0] + dx, point[1] + dy] : point);
}

const beatFlashEffects = ['Flash Vibration', 'Black flash', 'White flash', 'Beat Zoom', 'Club Strobe',
  'Black and White Flash', 'Vibration Flash'];
const effectBlendModes = { Normal: 'source-over', Screen: 'screen', Multiply: 'multiply', Overlay: 'overlay', 'Soft light': 'soft-light' };
const effectOutlineCache = new WeakMap();
const outlineSample = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const timelineEffectMask = document.createElement('canvas').getContext('2d');

function effectPresetLabel(effect) {
  return effect === videoNeonOutline ? 'Neon Outline' : effect;
}

function effectAudioAssets() {
  return [...new Set(clips.filter(clip => (clip.track === 'audio' || clip.track === 'visual') && clipHasVolume(clip))
    .map(clip => assets.get(clip.asset)).filter(asset => asset?.type === 'audio' || asset?.type === 'video'))];
}

function flashStrengthAt(position, elapsed, visual, effectClip = visual) {
  const options = effectClip && presetOptions(effectClip, 'effect', effectClip.effect);
  const decay = .24 * presetRatio(options, 'pulse');
  for (const clip of [...clips.filter(item => item.track === 'audio'), visual]) {
    if (!clip || !layerOnScreen(clip, position)) continue;
    const sourceTime = clip.start + position - clip.at;
    if (!(clipVolumeAt(clip, sourceTime) > 0)) continue;
    const asset = assets.get(clip.asset);
    if (!asset || !['audio', 'video'].includes(asset.type)) continue;
    const peaks = audioOnsets(asset).peaks;
    let previous = -Infinity;
    let foundBeat = false;
    for (const peak of peaks) {
      if (peak < clip.start || peak >= clip.end || peak - previous < .65) continue;
      foundBeat = true;
      if (peak > sourceTime) break;
      previous = peak;
    }
    if (foundBeat) return Math.max(0, 1 - (sourceTime - previous) / decay) ** 2;
  }
  return Math.max(0, 1 - (elapsed % .88) / decay) ** 2;
}

function drawTrendingEffect(target, source, effect, elapsed, strength, beat, options) {
  const { width: w, height: h } = target.canvas;
  if (effect === 'Black flash' || effect === 'White flash') {
    target.globalCompositeOperation = 'source-atop';
    target.globalAlpha = beat * strength * .76;
    target.fillStyle = effect === 'White flash' ? '#fff' : '#000';
    target.fillRect(0, 0, w, h);
    return;
  }
  const swing = Math.sin(elapsed * 5.2);
  const rebound = elapsed % 1.25;
  const kick = Math.sin(rebound * 14) * Math.exp(-rebound * 3.3);
  const vibration = effect === 'Flash Vibration';
  const amount = (vibration ? beat : 1) * presetRatio(options, 'movement');
  const movement = effect === 'Rebound Swing' ? kick : vibration ? Math.sin(elapsed * 60) : swing;
  const zoom = 1 + strength * amount * (vibration ? .11 : .09 + .055 * Math.abs(movement));
  target.save();
  target.translate(w / 2 + movement * w * .032 * strength * amount, h / 2);
  target.rotate(movement * strength * amount * (vibration ? .045 : .13));
  target.scale(zoom, zoom);
  target.drawImage(source, -w / 2, -h / 2);
  target.restore();
  if (vibration) {
    target.globalCompositeOperation = 'source-atop';
    target.globalAlpha = beat * strength * .48;
    target.fillStyle = '#fcf4ff';
    target.fillRect(0, 0, w, h);
  }
}

function drawPartyVideoEffect(target, source, effect, elapsed, strength, beat, options) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  target.globalCompositeOperation = 'source-atop';
  if (effect === 'Color Negative') {
    target.filter = 'invert(1) saturate(' + 1.2 * presetRatio(options, 'saturation') + ')';
    target.globalAlpha = strength;
    target.drawImage(source, 0, 0);
    return;
  }
  if (effect === 'Laser Beam') {
    target.globalAlpha = strength * .78;
    const x = w * (.5 + .21 * Math.sin(elapsed * 1.8));
    const y = h * .07;
    for (const [offset, color] of [[-.14, '#5bfcac'], [.11, '#ff52d7'], [.28, '#5b93ff']]) {
      const angle = Math.PI / 2 + offset + Math.sin(elapsed * 2.2 + offset * 12) * .48;
      drawLightBeams(target, x, y, Math.hypot(w, h), angle, .59, 3, color, elapsed);
    }
    paintRadialLight(target, x, y, unit * .16, '#d8ffeb');
    return;
  }
  if (effect === 'Flash') {
    const phase = elapsed % 1.18;
    const pulse = Math.max(0, 1 - phase / .38) ** 2;
    target.globalAlpha = strength * pulse * .94;
    paintRadialLight(target, w * .48, h * .46, Math.hypot(w, h) * .62, '#fff3d4');
    return;
  }
  if (effect === 'Beat Zoom' || effect === 'Vibration Flash') {
    const vibration = effect === 'Vibration Flash';
    const amount = strength * beat;
    const motion = amount * presetRatio(options, 'movement');
    const zoom = 1 + motion * (vibration ? .055 : .34);
    const y = vibration ? Math.sin(elapsed * 54) * h * .052 * motion : 0;
    target.globalAlpha = vibration ? strength : Math.min(1, beat * 3) * strength;
    target.drawImage(source, w * (1 - zoom) / 2, h * (1 - zoom) / 2 + y, w * zoom, h * zoom);
    if (vibration) {
      target.globalAlpha = amount * .42;
      target.fillStyle = '#dfa4ff';
      target.fillRect(0, 0, w, h);
    }
    return;
  }
  const alternating = effect === 'Black and White Flash';
  const dark = Math.floor(elapsed / .88) % 2 === 1;
  target.globalAlpha = strength * (alternating ? beat * .63 : beat ** 2 * .72);
  target.fillStyle = alternating ? (dark ? '#000' : '#fff') : '#bbd9ff';
  target.fillRect(0, 0, w, h);
}

function glitchNoise(seed) {
  const bits = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d);
  return ((bits ^ (bits >>> 15)) >>> 0) / 4294967296;
}

function paintFilmGrain(target, surface, elapsed, amount, grainSize = 1) {
  const { width, height } = target.canvas;
  const grain = surface('filmGrain', Math.round(192 / grainSize), Math.round(108 / grainSize));
  const pixels = grain.createImageData(grain.canvas.width, grain.canvas.height);
  const frame = Math.floor(elapsed * 24);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const random = glitchNoise(frame * 104729 + i);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = random < .5 ? 0 : 255;
    pixels.data[i + 3] = Math.round(255 * Math.abs(.5 - random) * 2);
  }
  grain.putImageData(pixels, 0, 0);
  target.save();
  target.globalAlpha = amount;
  target.imageSmoothingEnabled = false;
  target.drawImage(grain.canvas, 0, 0, width, height);
  target.restore();
}

function paintFilmMarks(target, elapsed, amount, scratches, continuous = false, density = 1) {
  const { width: w, height: h } = target.canvas;
  const phase = Math.floor(elapsed * (continuous ? 3 : scratches ? 12 : 19));
  target.save();
  for (let index = 0; index < Math.round((continuous ? 5 : scratches ? 11 : 54) * density); index++) {
    const seed = phase * 719 + index * 79;
    const x = w * glitchNoise(seed + 17);
    const y = h * glitchNoise(seed + 31);
    const size = .25 + glitchNoise(seed + 55);
    const color = index % 3 ? '#ffe5b7' : '#1a1117';
    target.globalAlpha = amount * (.19 + glitchNoise(seed + 13) * .67);
    if (scratches) {
      target.strokeStyle = color;
      target.lineWidth = Math.max(.6, w * .0019 * size);
      target.beginPath();
      const drift = continuous ? Math.sin(elapsed * 9 + index) * w * .009 : 0;
      target.moveTo(x + drift, y - h * (continuous ? .7 : .38) * size);
      target.lineTo(x + drift + w * (size - .65) * .018, y + h * (continuous ? .9 : .55) * size);
      target.stroke();
    } else {
      target.fillStyle = color;
      target.beginPath();
      const unit = Math.min(w, h) * .006 * size;
      target.ellipse(x, y, unit * 1.34, unit * .61, size, 0, Math.PI * 2);
      target.fill();
    }
  }
  target.restore();
}

function drawRetroVideoEffect(target, source, effect, elapsed, strength, surface, stock, options) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  target.globalCompositeOperation = 'source-atop';
  if (effect === 'Film Burn') {
    const phase = elapsed * .57 % 1;
    const sweep = w * (-.15 + 1.25 * phase);
    target.globalAlpha = strength * (.56 + .35 * Math.sin(Math.PI * phase));
    paintRadialLight(target, sweep, h * .78, Math.max(w, h) * .61, '#f22e11');
    paintRadialLight(target, sweep - w * .07, h * .62, unit * .55, '#ff872b');
    paintRadialLight(target, sweep - w * .1, h * .67, unit * .35, '#fff3a7');
    return;
  }
  const selectedStock = effect === 'Kodak/Fuji Film Emulations';
  const grade = selectedStock ? filmStocks[stock] ?? filmStocks['Kodak-style']
    : effect === 'Sepia' ? 'sepia(' + .8 * presetRatio(options, 'sepia') + ')' : retroGrades[effect];
  const density = presetRatio(options, 'density');
  if (grade) {
    const weave = effect === 'Super 8' || effect === 'Old Film';
    const jitter = weave ? Math.sin(Math.floor(elapsed * 16) * 3) * unit * .008 : 0;
    target.globalAlpha = strength * (selectedStock ? presetRatio(options, 'grade') : 1);
    target.filter = grade;
    target.drawImage(source, jitter, -jitter * .64);
    target.filter = 'none';
  }
  if (effect === 'Film Grain' || effect === 'Super 8' || effect === '1998' || selectedStock) {
    paintFilmGrain(target, surface, elapsed, strength * (effect === 'Film Grain' ? .45 : effect === 'Super 8' ? .26 : .13), presetRatio(options, 'grain'));
  }
  if (effect === 'Film Scratches' || effect === 'Old Film') paintFilmMarks(target, elapsed, strength, true, false, density);
  if (effect === 'Dust' || effect === 'Super 8' || effect === 'Old Film') {
    paintFilmMarks(target, elapsed, strength * (effect === 'Dust' ? 1 : .66), false, false, density);
  }
  if (effect === 'Fault Cassette' || effect === 'DV') {
    const fault = effect === 'Fault Cassette';
    const frame = Math.floor(elapsed * (fault ? 18 : 13));
    target.globalAlpha = strength * (fault ? .91 : .42);
    for (let band = 0; band < (fault ? 8 : 4); band++) {
      const y = Math.floor(glitchNoise(frame * 97 + band * 31) * h * .88);
      const span = h * (fault ? .09 : .03);
      const x = (glitchNoise(frame * 251 + band * 13) - .5) * w * strength * (fault ? .35 : .15) * presetRatio(options, 'shift');
      target.drawImage(source, 0, y, w, span, x, y, w, span);
    }
  }
  if (effect === 'Camcorder') {
    target.globalAlpha = .81 * strength;
    target.font = '600 ' + Math.max(8, unit * .045) + 'px monospace';
    target.textBaseline = 'top';
    target.fillStyle = '#f5faf2';
    target.fillText('REC', w * .062, h * .068);
    if (Math.floor(elapsed * 2) % 2 === 0) {
      target.fillStyle = '#ff4653';
      target.beginPath();
      target.arc(w * .047, h * .085, unit * .009, 0, Math.PI * 2);
      target.fill();
    }
    const frames = Math.floor(elapsed * 30);
    target.textAlign = 'right';
    target.fillStyle = '#f5faf2';
    target.fillText([Math.floor(frames / 1800), Math.floor(frames / 30) % 60, frames % 30]
      .map(value => String(value).padStart(2, '0')).join(':'), w * .951, h * .884);
  }
  if (effect === 'Vintage TV' || effect === 'Super 8') {
    const tv = effect === 'Vintage TV';
    target.globalAlpha = strength * (tv ? .75 : .36);
    const vignette = target.createRadialGradient(w / 2, h / 2, unit * .25, w / 2, h / 2, Math.hypot(w, h) * .54);
    vignette.addColorStop(0, '#03040900');
    vignette.addColorStop(1, '#030409');
    target.fillStyle = vignette;
    target.fillRect(0, 0, w, h);
    if (tv) {
      const lines = Math.max(3, Math.round(h / 105 * presetRatio(options, 'pitch')));
      target.globalAlpha = strength * .54;
      target.fillStyle = '#15212a';
      for (let y = Math.floor(elapsed * 15) % lines; y < h; y += lines) target.fillRect(0, y, w, lines * .38);
    }
  }
}

function paintRadialLight(target, x, y, radius, color) {
  const glow = target.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, color + 'ef');
  glow.addColorStop(.38, color + '65');
  glow.addColorStop(1, color + '00');
  target.fillStyle = glow;
  target.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawWeatherParticles(target, effect, elapsed, strength, options) {
  const { width: w, height: h } = target.canvas;
  const unit = Math.min(w, h);
  const rain = effect === 'Rain';
  const snow = effect === 'Snow';
  const petals = effect === 'Cherry Blossoms';
  const sparks = effect === 'Sparks';
  const falling = rain || snow || petals;
  const speed = rain ? 1.4 : snow ? .19 : petals ? .26 : sparks ? .95 : .32;
  const count = Math.round((rain ? 112 : snow ? 83 : petals ? 32 : sparks ? 64 : 53) * presetRatio(options, 'density'));
  const particleSize = presetRatio(options, 'particle');
  for (let i = 0; i < count; i++) {
    const size = .35 + glitchNoise(i * 13 + 9);
    const phase = (glitchNoise(i * 23 + 7) + elapsed * speed * size) % 1;
    const wind = rain ? phase * w * .17 : Math.sin(elapsed * size * 2.2 + i) * w * .074;
    const x = w * glitchNoise(i * 1987 + 11) + wind;
    const y = h * (falling ? phase : 1 - phase);
    const fade = falling ? .35 + .6 * size : Math.sin(Math.PI * phase) * .74;
    target.globalAlpha = strength * Math.min(1, fade) * (rain ? .52 : .92);
    target.beginPath();
    if (rain || sparks) {
      target.lineWidth = Math.max(.6, unit * .0023 * size * particleSize);
      target.strokeStyle = rain ? '#c3e8ff' : i % 2 ? '#ffca6b' : '#fff3bc';
      target.moveTo(x, y);
      target.lineTo(x - unit * (rain ? .038 : .017) * size * particleSize, y + unit * (rain ? -.115 : .045) * size * particleSize);
      target.stroke();
    } else if (petals) {
      target.fillStyle = ['#ff9dcc', '#ffc1db', '#df76a7'][i % 3];
      target.ellipse(x, y, unit * .014 * size * particleSize, unit * .0075 * size * particleSize, elapsed * size + i, 0, Math.PI * 2);
      target.fill();
    } else {
      target.fillStyle = snow ? '#f0faff' : i % 2 ? '#ff7935' : '#ffbd61';
      target.arc(x, y, unit * (snow ? .006 : .0045) * size * particleSize, 0, Math.PI * 2);
      target.fill();
    }
  }
}

function drawWaterDroplets(target, source, elapsed, strength) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  for (let i = 0; i < 22; i++) {
    const seed = i * 251;
    const phase = (glitchNoise(seed + 17) + elapsed * (.05 + glitchNoise(seed + 23) * .17)) % 1;
    const x = w * (.04 + .92 * glitchNoise(seed + 5));
    const y = h * (.03 + .94 * phase);
    const radius = unit * (.013 + glitchNoise(seed + 41) * .034);
    target.save();
    target.beginPath();
    target.ellipse(x, y, radius, radius * 1.26, -.13, 0, Math.PI * 2);
    target.clip();
    const sx = clamp(x - radius * .55, 0, w - radius);
    const sy = clamp(y - radius * .55, 0, h - radius);
    target.globalAlpha = strength * .88;
    target.drawImage(source, sx, sy, radius, radius, x - radius, y - radius * 1.28, radius * 2, radius * 2.56);
    target.fillStyle = '#09152143';
    target.fillRect(x - radius, y - radius * 1.3, radius * 2, radius * 2.6);
    paintRadialLight(target, x - radius * .35, y - radius * .54, radius * .51, '#f5fbff');
    target.restore();
    target.globalAlpha = strength * .5;
    target.lineWidth = Math.max(.6, radius * .12);
    target.strokeStyle = '#182638';
    target.stroke();
  }
}

function drawLightning(target, elapsed, strength) {
  const { width: w, height: h } = target.canvas;
  const phase = elapsed % 1.65;
  const pulse = Math.max(0, 1 - phase / .27) ** 2;
  if (!pulse) return;
  const strike = Math.floor(elapsed / 1.65);
  let x = w * (.22 + glitchNoise(strike * 33 + 197) * .56);
  target.globalAlpha = strength * pulse * .23;
  paintRadialLight(target, x, h * .2, Math.hypot(w, h) * .68, '#bbcaff');
  target.globalAlpha = strength * pulse;
  target.strokeStyle = '#eff4ff';
  target.shadowColor = '#94b7ff';
  target.shadowBlur = Math.min(w, h) * .032;
  target.lineWidth = Math.max(1, Math.min(w, h) * .008);
  target.beginPath();
  target.moveTo(x, 0);
  for (let node = 1; node <= 10; node++) {
    const y = h * node * .081;
    x += (glitchNoise(strike * 911 + node * 63) - .5) * w * .13;
    target.lineTo(x, y);
    if (node === 3 || node === 6) {
      const direction = node === 3 ? -1 : 1;
      target.lineTo(x + direction * w * .062, y + h * .057);
      target.lineTo(x + direction * w * .082, y + h * .16);
      target.moveTo(x, y);
    }
  }
  target.stroke();
}

function drawTextureVideoEffect(target, source, effect, elapsed, strength, options) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  target.globalCompositeOperation = 'source-atop';
  if (effect === 'Fog' || effect === 'Smoke') {
    const fog = effect === 'Fog';
    target.globalAlpha = strength * (fog ? .23 : .34);
    for (let i = 0; i < Math.round((fog ? 9 : 13) * presetRatio(options, 'density')); i++) {
      const phase = (elapsed * (fog ? .095 : .24) + i * .618) % 1;
      const x = w * (fog ? phase * 1.4 - .2 : .48 + Math.sin(i + phase * 5) * .33);
      const y = h * (fog ? .68 + .17 * Math.sin(i) : 1.08 - phase * .98);
      target.save();
      target.translate(x, y);
      target.scale(fog ? 2.3 : .76 + phase * .37, fog ? .63 : 1.24);
      paintRadialLight(target, 0, 0, unit * (fog ? .39 : .11 + phase * .22), fog ? '#ddeaef' : '#858394');
      target.restore();
    }
  } else if (effect === 'Film Scratch') {
    paintFilmMarks(target, elapsed, strength, true, true, presetRatio(options, 'density'));
  } else if (effect === 'Water Droplets') {
    drawWaterDroplets(target, source, elapsed, strength);
  } else if (effect === 'Paper Texture') {
    target.globalAlpha = strength * .19;
    target.fillStyle = '#e9c993';
    target.fillRect(0, 0, w, h);
    for (let i = 0, count = Math.round(270 * presetRatio(options, 'density')); i < count; i++) {
      const seed = i * 83;
      const x = w * glitchNoise(seed);
      const y = h * glitchNoise(seed + 19);
      target.globalAlpha = strength * (.15 + glitchNoise(seed + 39) * .26);
      target.strokeStyle = i % 2 ? '#fff0d3' : '#593f39';
      target.lineWidth = Math.max(.55, unit * .00146);
      target.beginPath();
      target.moveTo(x, y);
      target.lineTo(x + unit * (.008 + glitchNoise(seed + 9) * .035), y + unit * (glitchNoise(seed + 31) - .5) * .015);
      target.stroke();
    }
  } else if (effect === 'CRT Grid') {
    const pitch = Math.max(3, Math.round(unit / 90 * presetRatio(options, 'pitch')));
    target.globalAlpha = strength * .52;
    target.fillStyle = '#0b1424';
    for (let y = Math.floor(elapsed * 8) % pitch; y < h; y += pitch) target.fillRect(0, y, w, pitch * .28);
    target.globalAlpha = strength * .23;
    for (let x = 0; x < w; x += pitch) {
      target.fillStyle = ['#ff4160', '#6cff85', '#6a87ff'][(x / pitch) % 3];
      target.fillRect(x, 0, pitch * .32, h);
    }
  } else if (effect === 'Lightning') {
    drawLightning(target, elapsed, strength);
  } else if (effect === 'Wind') {
    target.lineCap = 'round';
    target.strokeStyle = '#d4efff';
    target.lineWidth = Math.max(.6, unit * .0022);
    for (let i = 0; i < 32; i++) {
      const phase = (elapsed * (.22 + glitchNoise(i * 11) * .54) + glitchNoise(i * 71)) % 1;
      const x = w * (phase * 1.25 - .18);
      const y = h * glitchNoise(i * 83 + 12);
      target.globalAlpha = strength * Math.sin(phase * Math.PI) * .49;
      target.beginPath();
      target.moveTo(x, y);
      target.quadraticCurveTo(x + w * .057, y - unit * .042, x + w * .16, y + unit * .012);
      target.stroke();
    }
  } else {
    drawWeatherParticles(target, effect, elapsed, strength, options);
  }
}

function drawLightBeams(target, x, y, reach, angle, spread, count, color, phase) {
  const glow = target.createRadialGradient(x, y, 0, x, y, reach);
  glow.addColorStop(0, color + 'df');
  glow.addColorStop(.48, color + '45');
  glow.addColorStop(1, color + '00');
  target.fillStyle = glow;
  for (let i = 0; i < count; i++) {
    const direction = angle + spread * ((i + .5) / count - .5) + .025 * Math.sin(phase + i);
    const width = spread / count * (.18 + .22 * Math.sin(i * 3.7 + phase) ** 2);
    target.beginPath();
    target.moveTo(x, y);
    for (const edge of [direction - width, direction + width]) {
      target.lineTo(x + Math.cos(edge) * reach, y + Math.sin(edge) * reach);
    }
    target.closePath();
    target.fill();
  }
}

function drawNeonEdges(target, source, elapsed, strength, surface, neutral = false, options) {
  const sample = surface('edgeSample', 160, 90);
  sample.clearRect(0, 0, 160, 90);
  sample.drawImage(source, 0, 0, 160, 90);
  const { data } = sample.getImageData(0, 0, 160, 90);
  const edges = sample.createImageData(160, 90);
  const luma = index => (data[index] * .21 + data[index + 1] * .72 + data[index + 2] * .07) * data[index + 3] / 255;
  const phase = .5 + .5 * Math.sin(elapsed * 2.7);
  const threshold = presetRatio(options, 'edge');
  const hue = presetValue(options, 'hue');
  for (let y = 1; y < 89; y++) {
    for (let x = 1; x < 159; x++) {
      const pixel = 4 * (y * 160 + x);
      const gradient = Math.hypot(luma(pixel - 4) - luma(pixel + 4), luma(pixel - 640) - luma(pixel + 640));
      edges.data[pixel] = neutral ? 238 : 45 + phase * 160;
      edges.data[pixel + 1] = neutral ? 244 : 230 - phase * 120;
      edges.data[pixel + 2] = 255;
      edges.data[pixel + 3] = Math.min(255, gradient * 2.7 / threshold);
    }
  }
  sample.putImageData(edges, 0, 0);
  const { width, height } = target.canvas;
  target.globalAlpha = strength * .85;
  target.filter = 'blur(' + Math.max(1, height * .013) + 'px) hue-rotate(' + hue + 'deg)';
  target.drawImage(sample.canvas, 0, 0, width, height);
  target.filter = hue ? 'hue-rotate(' + hue + 'deg)' : 'none';
  target.globalAlpha = strength * .7;
  target.drawImage(sample.canvas, 0, 0, width, height);
}

function drawHalftone(target, source, elapsed, strength, surface, options) {
  const { width: w, height: h } = source;
  const pitch = Math.min(w, h) * .024;
  const cols = Math.ceil(w / pitch);
  const rows = Math.ceil(h / pitch);
  const sample = surface('artSample', cols, rows);
  sample.clearRect(0, 0, cols, rows);
  sample.drawImage(source, 0, 0, cols, rows);
  const { data } = sample.getImageData(0, 0, cols, rows);
  target.globalAlpha = strength * .58;
  target.fillStyle = '#f9e5c6';
  target.fillRect(0, 0, w, h);
  target.globalAlpha = strength * .82;
  target.fillStyle = '#252036';
  target.beginPath();
  const size = presetRatio(options, 'dot');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      if (data[i + 3] < 72) continue;
      const radius = size * pitch * (.07 + .53 * (1 - (data[i] * .21 + data[i + 1] * .72 + data[i + 2] * .07) / 255));
      const cx = (x + .28 + (y % 2) * .38) * pitch;
      const cy = (y + .45 + Math.sin(elapsed * 1.7) * .12) * pitch;
      target.moveTo(cx + radius, cy);
      target.arc(cx, cy, radius, 0, Math.PI * 2);
    }
  }
  target.fill();
}

function drawMangaLines(target, elapsed, strength) {
  const { width: w, height: h } = target.canvas;
  const reach = Math.hypot(w, h);
  const x = w * (.5 + .09 * Math.sin(elapsed * 3));
  const y = h * .49;
  const phase = Math.floor(elapsed * 12);
  for (let i = 0; i < 77; i++) {
    const angle = i * Math.PI * 2 / 77 + phase * .036;
    const start = reach * (.18 + .27 * glitchNoise(i * 53 + phase * 181));
    const spread = .001 + glitchNoise(i * 31 + phase * 7) * .007;
    target.globalAlpha = strength * (i % 3 ? .68 : .75);
    target.fillStyle = i % 3 ? '#161123' : '#fff9ed';
    target.beginPath();
    target.moveTo(x + Math.cos(angle) * start, y + Math.sin(angle) * start);
    target.lineTo(x + Math.cos(angle - spread) * reach, y + Math.sin(angle - spread) * reach);
    target.lineTo(x + Math.cos(angle + spread) * reach, y + Math.sin(angle + spread) * reach);
    target.closePath();
    target.fill();
  }
}

function paintArtisticRaster(target, source, effect, elapsed, strength, surface, options) {
  const { width: w, height: h } = source;
  const watercolor = effect === 'Watercolor';
  const oil = effect === 'Oil Painting';
  const pencil = effect === 'Pencil Sketch';
  const ink = effect === 'Ink Outline';
  const comic = effect === 'Comic Book';
  const cartoon = effect === 'Cartoon';
  const pop = effect === 'Pop Art';
  const scale = Math.min(1, (oil ? 158 : 320) / Math.max(w, h));
  const width = Math.max(2, Math.round(w * scale));
  const height = Math.max(2, Math.round(h * scale));
  const sample = surface('artSample', width, height);
  sample.clearRect(0, 0, width, height);
  sample.save();
  if (watercolor || cartoon || oil) sample.filter = 'blur(' + (watercolor ? 1.45 : oil ? .9 : .75) + 'px)';
  sample.drawImage(source, 0, 0, width, height);
  sample.restore();
  const { data } = sample.getImageData(0, 0, width, height);
  const image = sample.createImageData(width, height);
  const stride = width * 4;
  const luma = i => data[i] * .21 + data[i + 1] * .72 + data[i + 2] * .07;
  const colorStep = (comic || pop ? 64 : cartoon || oil ? 36 : watercolor ? 24 : 51) * presetRatio(options, 'levels');
  const edgeThreshold = presetRatio(options, 'edge');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * 4;
      const value = luma(i);
      const edge = Math.max(Math.abs(value - luma(x + 1 < width ? i + 4 : i)),
        Math.abs(value - luma(y + 1 < height ? i + stride : i)));
      const fleck = glitchNoise(x * 271 + y * 107) - .5;
      const brushX = oil ? clamp(x + Math.round(Math.sin(y * .64 + x * .13) * 3), 0, width - 1) : x;
      const pigment = y * stride + brushX * 4;
      for (let c = 0; c < 3; c++) {
        let color = Math.round(data[pigment + c] / colorStep) * colorStep;
        if (pencil) {
          const hatch = (x + y * 2) % 6 < 2 ? (255 - value) * .43 : 0;
          color = 253 - edge * 2.4 / edgeThreshold - hatch - (255 - value) * .19 + fleck * 14;
        } else if (ink || comic || cartoon) {
          const limit = ink ? 8 : comic ? 12 : 19;
          if (edge > limit * edgeThreshold) color = ink ? 12 : comic ? 18 : color * .48;
          else if (ink) color = 232 + value * .09;
          else if (comic && (x % 4 === 0 && y % 4 === 0)) color *= .75;
        } else if (watercolor) {
          color = color * .69 + [248, 237, 217][c] * .31 + fleck * 22 - edge * .2;
        } else if (oil) {
          color = color * 1.09 + fleck * 17 + Math.sin(y * 1.8 + x * .28) * 7;
        }
        image.data[i + c] = color;
      }
      image.data[i + 3] = data[i + 3];
    }
  }
  sample.putImageData(image, 0, 0);
  target.globalAlpha = strength;
  target.imageSmoothingEnabled = !comic && !pop && effect !== 'Posterize';
  if (pop) target.filter = 'saturate(2.8) contrast(1.3) hue-rotate(' + Math.round(22 + 17 * Math.sin(elapsed * 2.7)) + 'deg)';
  else if (oil) target.filter = 'saturate(1.36) contrast(1.08)';
  else if (cartoon) target.filter = 'saturate(1.3)';
  target.drawImage(sample.canvas, 0, 0, w, h);
}

function drawArtisticVideoEffect(target, source, effect, elapsed, strength, surface, options) {
  target.globalCompositeOperation = 'source-atop';
  if (effect === 'Halftone') {
    drawHalftone(target, source, elapsed, strength, surface, options);
  } else if (effect === 'Manga Speed Lines') {
    drawMangaLines(target, elapsed, strength);
  } else if (effect === videoNeonOutline) {
    target.globalAlpha = strength * .8;
    target.filter = 'brightness(.3) saturate(1.7)';
    target.drawImage(source, 0, 0);
    target.filter = 'none';
    drawNeonEdges(target, source, elapsed, strength, surface, false, options);
  } else {
    paintArtisticRaster(target, source, effect, elapsed, strength, surface, options);
  }
}

function drawScreenGrid(target, source, columns, rows, strength, divider) {
  const { width: w, height: h } = source;
  const gap = Math.round(Math.max(1, Math.round(Math.min(w, h) * .005)) * divider);
  const cellW = w / columns;
  const cellH = h / rows;
  const fit = Math.max(cellW / w, cellH / h);
  const cropW = cellW / fit;
  const cropH = cellH / fit;
  target.globalAlpha = strength;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = Math.round(column * cellW);
      const top = Math.round(row * cellH);
      const right = Math.round((column + 1) * cellW);
      const bottom = Math.round((row + 1) * cellH);
      target.drawImage(source, (w - cropW) / 2, (h - cropH) / 2, cropW, cropH,
        left, top, right - left, bottom - top);
    }
  }
  target.fillStyle = '#101422';
  for (let column = 1; column < columns; column++) target.fillRect(Math.round(column * cellW) - gap / 2, 0, gap, h);
  for (let row = 1; row < rows; row++) target.fillRect(0, Math.round(row * cellH) - gap / 2, w, gap);
}

function drawKaleidoscopeEffect(target, source, elapsed, strength) {
  const { width: w, height: h } = source;
  const sectors = 8;
  const step = 2 * Math.PI / sectors;
  const reach = Math.hypot(w, h);
  const spin = elapsed * .32;
  target.globalAlpha = strength;
  target.translate(w / 2, h / 2);
  for (let index = 0; index < sectors; index++) {
    target.save();
    target.rotate(index * step + spin);
    target.beginPath();
    target.moveTo(0, 0);
    target.lineTo(reach, -Math.tan(step / 2) * reach - .5);
    target.lineTo(reach, Math.tan(step / 2) * reach + .5);
    target.closePath();
    target.clip();
    if (index % 2) target.scale(1, -1);
    target.drawImage(source, -w * .24, -h * .79, w * 1.65, h * 1.65);
    target.restore();
  }
}

function drawSplitVideoEffect(target, source, effect, elapsed, strength, options) {
  const { width: w, height: h } = source;
  const sizes = { '2-Screen': [2, 1], '3-Screen': [3, 1], '4-Screen': [2, 2], '9-Grid': [3, 3] };
  target.globalCompositeOperation = 'source-atop';
  if (sizes[effect]) {
    drawScreenGrid(target, source, ...sizes[effect], strength, presetRatio(options, 'gap'));
  } else if (effect === 'Mirror') {
    target.globalAlpha = strength;
    target.translate(w, 0);
    target.scale(-1, 1);
    const seam = w * presetRatio(options, 'axis');
    target.drawImage(source, 0, 0, seam, h, 0, 0, w - seam, h);
  } else if (effect === 'Kaleidoscope') {
    drawKaleidoscopeEffect(target, source, elapsed, strength);
  } else if (effect === 'Tunnel') {
    target.translate(w * (.5 + .081 * Math.sin(elapsed * 1.37)), h * (.5 + .07 * Math.cos(elapsed * 1.51)));
    for (let index = 1; index <= 9; index++) {
      const phase = (index - elapsed * .7 % 1) / 9;
      const zoom = .72 * .64 ** (phase * 8);
      target.rotate(.1 + Math.sin(elapsed * 1.17) * .047);
      target.globalAlpha = strength * (.52 + .42 * (1 - phase));
      target.drawImage(source, -w * zoom / 2, -h * zoom / 2, w * zoom, h * zoom);
    }
  } else {
    const sway = Math.sin(elapsed * 4.5);
    for (let copy = 4; copy >= 1; copy--) {
      target.globalAlpha = strength * (.29 - copy * .042);
      const shift = copy * strength * presetRatio(options, 'shift');
      const drift = shift * w * (.014 + .007 * sway);
      const rise = shift * h * (.012 + .005 * Math.cos(elapsed * 3.7));
      const zoom = 1 + copy * strength * .015;
      target.drawImage(source, drift + w * (1 - zoom) / 2, -rise + h * (1 - zoom) / 2, w * zoom, h * zoom);
    }
  }
}

function drawViewfinder(target, elapsed, strength) {
  const { width: w, height: h } = target.canvas;
  const unit = Math.min(w, h);
  target.globalAlpha = strength * .9;
  target.strokeStyle = '#f2fffa';
  target.lineWidth = Math.max(1, unit * .003);
  for (const [x, y] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const left = w / 2 - x * w * .43;
    const top = h / 2 - y * h * .39;
    target.beginPath();
    target.moveTo(left + x * unit * .12, top);
    target.lineTo(left, top);
    target.lineTo(left, top + y * unit * .12);
    target.stroke();
  }
  target.globalAlpha = strength * (.44 + .31 * Math.sin(elapsed * 3.8) ** 2);
  const focus = unit * .105;
  target.strokeRect(w / 2 - focus / 2, h / 2 - focus / 2, focus, focus);
  target.beginPath();
  target.moveTo(w / 2 - focus * .24, h / 2);
  target.lineTo(w / 2 + focus * .24, h / 2);
  target.moveTo(w / 2, h / 2 - focus * .24);
  target.lineTo(w / 2, h / 2 + focus * .24);
  target.stroke();
}

function drawFrameVideoEffect(target, effect, elapsed, strength, bounds, options) {
  const { width: w, height: h } = target.canvas;
  const unit = Math.min(w, h);
  target.globalCompositeOperation = 'source-atop';
  target.globalAlpha = strength;
  const border = presetRatio(options, 'border');
  if (effect === 'Letterbox') {
    const bar = h * .145 * strength * border;
    target.globalAlpha = 1;
    target.fillStyle = '#000';
    target.fillRect(0, 0, w, bar);
    target.fillRect(0, h - bar, w, bar);
  } else if (effect === 'Rounded Corners') {
    const [x, y, width, height] = bounds ?? [0, 0, w, h];
    target.globalCompositeOperation = 'destination-out';
    target.globalAlpha = 1;
    target.beginPath();
    target.rect(x, y, width, height);
    target.roundRect(x, y, width, height, Math.min(width, height) * .26 * strength * presetRatio(options, 'corner'));
    target.fill('evenodd');
  } else if (effect === 'Viewfinder') {
    drawViewfinder(target, elapsed, strength);
  } else if (effect === 'Neon Frame') {
    if (!border) return;
    const hue = (elapsed * 58 + 284 + presetValue(options, 'hue')) % 360;
    const inset = unit * .051;
    target.beginPath();
    target.roundRect(inset, inset, w - inset * 2, h - inset * 2, unit * .065);
    target.strokeStyle = 'hsl(' + hue + ',100%,58%)';
    target.shadowColor = target.strokeStyle;
    target.shadowBlur = unit * .036;
    target.lineWidth = Math.max(1, unit * .017 * border);
    target.stroke();
    target.shadowBlur = 0;
    target.strokeStyle = 'hsl(' + hue + ',100%,88%)';
    target.lineWidth *= .31;
    target.stroke();
  } else if (effect === 'Polaroid Frame') {
    if (!border) return;
    const inset = unit * .068 * border;
    const bottom = unit * .215 * border;
    const paper = target.createLinearGradient(0, 0, w, h);
    paper.addColorStop(0, '#fffbeb');
    paper.addColorStop(1, '#dfd7c3');
    target.fillStyle = paper;
    target.beginPath();
    target.rect(0, 0, w, h);
    target.rect(inset, inset, w - inset * 2, h - inset - bottom);
    target.fill('evenodd');
    target.lineWidth = Math.max(1, unit * .003);
    target.strokeStyle = '#2d252467';
    target.strokeRect(inset, inset, w - inset * 2, h - inset - bottom);
  } else {
    const bar = unit * .117 * border;
    target.fillStyle = '#211c21';
    target.fillRect(0, 0, w, bar);
    target.fillRect(0, h - bar, w, bar);
    const pitch = unit * .126;
    target.fillStyle = '#f5dcb4';
    const phase = elapsed * unit * .06 % pitch;
    target.beginPath();
    for (let x = phase - pitch; x < w; x += pitch) {
      target.roundRect(x, bar * .22, pitch * .48, bar * .42, bar * .095);
      target.roundRect(x, h - bar * .68, pitch * .48, bar * .42, bar * .095);
    }
    target.fill();
  }
}

function drawLensDistortion(target, source, effect, elapsed, strength, surface, displacement) {
  const { width: w, height: h } = source;
  const scale = Math.min(1, 320 / Math.max(w, h));
  const width = Math.max(2, Math.round(w * scale));
  const height = Math.max(2, Math.round(h * scale));
  const scratch = surface('lensMapping', width, height);
  scratch.clearRect(0, 0, width, height);
  scratch.drawImage(source, 0, 0, width, height);
  const pixels = scratch.getImageData(0, 0, width, height).data;
  const warped = scratch.createImageData(width, height);
  const fisheye = effect === 'Fisheye';
  const power = strength * (fisheye ? .86 : .39) * (.94 + .06 * Math.sin(elapsed * 2)) * displacement;
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1) * 2 - 1;
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1) * 2 - 1;
      const radius = (u * u + v * v) / 2;
      const multiplier = 1 + power * (fisheye ? radius * .76 - .42 : .29 - radius * .62);
      const sx = clamp((u * multiplier + 1) * (width - 1) / 2, 0, width - 1);
      const sy = clamp((v * multiplier + 1) * (height - 1) / 2, 0, height - 1);
      const left = Math.floor(sx);
      const top = Math.floor(sy);
      const right = Math.min(width - 1, left + 1);
      const bottom = Math.min(height - 1, top + 1);
      const ax = sx - left;
      const ay = sy - top;
      const output = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = pixels[(top * width + left) * 4 + c] * (1 - ax) + pixels[(top * width + right) * 4 + c] * ax;
        const b = pixels[(bottom * width + left) * 4 + c] * (1 - ax) + pixels[(bottom * width + right) * 4 + c] * ax;
        warped.data[output + c] = a * (1 - ay) + b * ay;
      }
    }
  }
  scratch.putImageData(warped, 0, 0);
  target.globalAlpha = strength;
  target.drawImage(scratch.canvas, 0, 0, w, h);
}

function drawSharpenEffect(target, source, strength, surface, threshold) {
  const { width: w, height: h } = source;
  const scale = Math.min(1, 480 / Math.max(w, h));
  const width = Math.max(2, Math.round(w * scale));
  const height = Math.max(2, Math.round(h * scale));
  const scratch = surface('sharpen', width, height);
  scratch.clearRect(0, 0, width, height);
  scratch.drawImage(source, 0, 0, width, height);
  const pixels = scratch.getImageData(0, 0, width, height).data;
  const mask = scratch.createImageData(width, height);
  const luma = i => (pixels[i] * .21 + pixels[i + 1] * .72 + pixels[i + 2] * .07);
  const stride = width * 4;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * stride + x * 4;
      if (pixels[i + 3] < 245 || pixels[i - 1] < 245 || pixels[i + 7] < 245 ||
          pixels[i - stride + 3] < 245 || pixels[i + stride + 3] < 245) continue;
      const detail = luma(i) - (luma(i - 4) + luma(i + 4) + luma(i - stride) + luma(i + stride)) / 4;
      if (Math.abs(detail) < 2 * threshold) continue;
      mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = detail > 0 ? 255 : 0;
      mask.data[i + 3] = Math.min(134, Math.abs(detail) * 2.3);
    }
  }
  scratch.putImageData(mask, 0, 0);
  target.globalAlpha = strength;
  target.drawImage(scratch.canvas, 0, 0, w, h);
}

function drawFocusMask(target, source, effect, elapsed, strength, surface, radius) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  const focusPull = effect === 'Focus Pull';
  const blur = surface('focusMask');
  blur.clearRect(0, 0, w, h);
  blur.save();
  blur.filter = 'blur(' + unit * strength * (focusPull ? .058 : .044) * radius + 'px)';
  blur.drawImage(source, 0, 0);
  blur.filter = 'none';
  blur.globalCompositeOperation = 'destination-in';
  let mask;
  if (focusPull) {
    const x = w * (.5 + .26 * Math.sin(elapsed * 1.8 - .6));
    const y = h * (.48 + .1 * Math.sin(elapsed * 1.25));
    mask = blur.createRadialGradient(x, y, unit * .1, x, y, unit * .62);
    mask.addColorStop(0, '#0000');
    mask.addColorStop(.31, '#0002');
    mask.addColorStop(1, '#000');
  } else {
    const center = .52 + .08 * Math.sin(elapsed * 1.4);
    mask = blur.createLinearGradient(0, 0, 0, h);
    mask.addColorStop(0, '#000');
    mask.addColorStop(center - .29, '#000b');
    mask.addColorStop(center - .1, '#0000');
    mask.addColorStop(center + .1, '#0000');
    mask.addColorStop(center + .28, '#000a');
    mask.addColorStop(1, '#000');
  }
  blur.fillStyle = mask;
  blur.fillRect(0, 0, w, h);
  blur.restore();
  target.globalAlpha = strength;
  target.drawImage(blur.canvas, 0, 0);
}

function drawBlurVideoEffect(target, source, effect, elapsed, strength, surface, options) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  const radius = presetRatio(options, 'radius');
  target.globalCompositeOperation = 'source-atop';
  if (effect === 'Fisheye' || effect === 'Wide Angle') {
    drawLensDistortion(target, source, effect, elapsed, strength, surface, presetRatio(options, 'shift'));
  } else if (effect === 'Smart Sharpen') {
    drawSharpenEffect(target, source, strength, surface, presetRatio(options, 'edge'));
  } else if (effect === 'Edge Glow') {
    drawNeonEdges(target, source, elapsed, strength, surface, true, options);
  } else if (effect === 'Vignette') {
    const focus = presetRatio(options, 'focus');
    const gradient = target.createRadialGradient(w / 2, h / 2, unit * .19 * focus, w / 2, h / 2, Math.hypot(w, h) * .52);
    gradient.addColorStop(0, '#08091700');
    gradient.addColorStop(.46, '#08091719');
    gradient.addColorStop(1, '#080917ed');
    target.globalAlpha = strength;
    target.fillStyle = gradient;
    target.fillRect(0, 0, w, h);
  } else if (effect === 'Tilt Shift' || effect === 'Focus Pull') {
    drawFocusMask(target, source, effect, elapsed, strength, surface, radius);
  } else if (effect === 'Gaussian Blur' || effect === 'Chrome Blur') {
    const chrome = effect === 'Chrome Blur';
    target.globalAlpha = strength * (chrome ? .76 : 1);
    target.filter = 'blur(' + unit * strength * (chrome ? .027 : .045) * radius + 'px)' +
      (chrome ? ' grayscale(.9) contrast(1.9) brightness(1.35)' : '');
    target.drawImage(source, chrome ? unit * .02 * strength : 0, 0);
  } else {
    const radial = effect === 'Radial Blur';
    const zoom = effect === 'Zoom Blur';
    const lens = effect === 'Lens Blur';
    const oblique = effect === 'Oblique Blur';
    const distance = unit * strength * (lens ? .035 : oblique ? .115 : .17) * radius;
    for (let pass = 1; pass <= 8; pass++) {
      const phase = pass / 8;
      const offset = (pass - 4.5) / 4;
      const angle = pass * Math.PI / 4;
      target.save();
      target.globalAlpha = strength * (lens ? .17 : .12);
      target.translate(w / 2, h / 2);
      if (radial) target.rotate(offset * strength * .43 * radius);
      else if (zoom) target.scale(1 + phase * strength * .36 * radius, 1 + phase * strength * .36 * radius);
      else if (lens) {
        target.filter = 'brightness(1.13)';
        target.translate(Math.cos(angle) * distance, Math.sin(angle) * distance);
      } else {
        target.translate(offset * distance, oblique ? offset * distance * .75 : Math.sin(elapsed * 3) * phase * distance * .11);
      }
      target.drawImage(source, -w / 2, -h / 2);
      target.restore();
    }
  }
}

function drawLightVideoEffect(target, source, effect, elapsed, strength, surface, options) {
  const { width: w, height: h } = source;
  const unit = Math.min(w, h);
  const drift = Math.sin(elapsed * 1.7);
  const radiusScale = presetRatio(options, 'radius');
  const glowScale = presetRatio(options, 'glow');
  target.globalCompositeOperation = 'source-atop';
  target.globalAlpha = strength;
  if (effect === 'Neon Edge') {
    drawNeonEdges(target, source, elapsed, strength, surface, false, options);
  } else if (effect === 'Bloom' || effect === 'Soft Glow' || effect === 'Chromatic Glow') {
    const glow = surface('lightImage');
    glow.clearRect(0, 0, w, h);
    const bloom = effect === 'Bloom';
    const soft = effect === 'Soft Glow';
    glow.save();
    if (bloom || soft) {
      glow.filter = 'blur(' + unit * (bloom ? .021 : .04) * radiusScale + 'px) ' +
        (bloom ? 'contrast(2.4) brightness(1.18)' : 'brightness(1.24) saturate(.7)');
      glow.drawImage(source, 0, 0);
    } else {
      const shift = unit * (.014 + .005 * drift) * presetRatio(options, 'shift');
      glow.filter = 'blur(' + unit * .032 * radiusScale + 'px) saturate(3) hue-rotate(70deg)';
      glow.drawImage(source, -shift, 0);
      glow.globalCompositeOperation = 'screen';
      glow.filter = 'blur(' + unit * .029 * radiusScale + 'px) saturate(2.7) hue-rotate(-75deg)';
      glow.drawImage(source, shift, 0);
    }
    glow.restore();
    target.globalAlpha = strength * (bloom ? .57 : soft ? .34 : .5);
    if (soft) {
      target.drawImage(glow.canvas, 0, 0);
    } else {
      const combined = surface('lightComposite');
      combined.clearRect(0, 0, w, h);
      combined.drawImage(source, 0, 0);
      combined.save();
      combined.globalCompositeOperation = 'screen';
      combined.drawImage(glow.canvas, 0, 0);
      combined.restore();
      target.drawImage(combined.canvas, 0, 0);
    }
  } else if (effect === 'Lens Flare') {
    const x = w * (.22 + drift * .16);
    const y = h * (.22 + .08 * Math.cos(elapsed * 1.1));
    paintRadialLight(target, x, y, unit * .34 * glowScale, '#ffd29c');
    paintRadialLight(target, x, y, unit * .105 * glowScale, '#fff8e1');
    for (const [offset, radius, color] of [[.4, .065, '#69b3dc'], [1.14, .11, '#88f1c2'], [1.48, .075, '#eb86b9']]) {
      paintRadialLight(target, x + (w / 2 - x) * offset, y + (h / 2 - y) * offset, unit * radius * glowScale, color);
    }
    target.globalAlpha *= .62;
    const streak = target.createLinearGradient(x - w * .47, y, x + w * .47, y);
    streak.addColorStop(0, '#c8dcff00');
    streak.addColorStop(.5, '#c8dcffaa');
    streak.addColorStop(1, '#c8dcff00');
    target.fillStyle = streak;
    target.fillRect(x - w * .47, y - unit * .008, w * .94, unit * .016);
  } else if (effect === 'Atmospheric lighting' || effect === 'Light Leaks' || effect === 'Angel Light') {
    if (effect === 'Light Leaks') {
      paintRadialLight(target, w * (.04 + .12 * drift), h * .56, unit * .8, '#ff6442');
      paintRadialLight(target, w * .88, h * (.91 - .18 * drift), unit * .52, '#ffbd56');
    } else if (effect === 'Angel Light') {
      const x = w * (.5 + .08 * drift);
      paintRadialLight(target, x, h * .08, unit * .62, '#fff5be');
      drawLightBeams(target, x, -h * .1, h * 1.3, Math.PI / 2, 1.04, 5, '#fff6d9', elapsed);
    } else {
      target.globalAlpha *= .65;
      paintRadialLight(target, w * (.26 + .14 * drift), h * .08, Math.max(w, h) * .7, '#56a4d3');
      paintRadialLight(target, w * .91, h * (.73 - .06 * drift), unit * .76, '#b57ede');
    }
  } else if (effect === 'Sunbeam' || effect === 'Light Rays') {
    const sun = effect === 'Sunbeam';
    const x = w * (sun ? .14 + drift * .1 : .48 + drift * .23);
    const y = h * (sun ? -.06 : .31);
    const color = sun ? '#ffca83' : '#a8dfff';
    drawLightBeams(target, x, y, Math.hypot(w, h), sun ? .86 : elapsed * .47, sun ? .83 : Math.PI * 2, sun ? 7 : 16, color, elapsed * 2);
    paintRadialLight(target, x, y, unit * (sun ? .44 : .23), color);
  } else if (effect === 'Rainbow' || effect === 'Prism') {
    const prism = effect === 'Prism';
    const colors = ['#ff6164', '#ffc168', '#ffed92', '#67eb9e', '#63dfff', '#bc82ff'];
    target.globalAlpha *= prism ? .53 : .46;
    if (prism) {
      target.translate(w * (.41 + drift * .14), h * .55);
      target.rotate(-.45 + drift * .12);
      for (const [index, color] of colors.entries()) {
        target.fillStyle = color + 'b5';
        const top = (index - 3) * h * .065;
        target.beginPath();
        target.moveTo(-w * .58, top * .29);
        target.lineTo(w * .7, top * 1.8);
        target.lineTo(w * .7, top * 1.8 + h * .085);
        target.closePath();
        target.fill();
      }
    } else {
      const radius = unit * (.74 + drift * .045);
      for (const [index, color] of colors.entries()) {
        target.strokeStyle = color + 'd6';
        target.lineWidth = unit * .029;
        target.beginPath();
        target.arc(w * .48, h * 1.17, radius - index * unit * .029, Math.PI, Math.PI * 2);
        target.stroke();
      }
    }
  } else if (effect === 'Bokeh' || effect === 'Disco') {
    const disco = effect === 'Disco';
    const colors = disco ? ['#ef4aae', '#55c9ff', '#a480ff', '#73ecb8'] : ['#ffe3a6', '#b8dfef', '#fec2ab', '#ffeedd'];
    target.globalAlpha *= disco ? .69 : .58;
    const count = Math.round((disco ? 9 : 17) * presetRatio(options, 'density'));
    for (let i = 0; i < count; i++) {
      const angle = elapsed * (disco ? 2.2 : .62) + i * 2.39;
      const x = w * ((i * .317) % .94 + .03 + Math.sin(angle) * .11);
      const y = h * ((i * .461) % .94 + .03 + Math.cos(angle) * .14);
      const radius = unit * ((disco ? .21 : .043) + (i % 4) * .018) * glowScale;
      paintRadialLight(target, x, y, radius, colors[i % colors.length]);
      if (!disco) {
        target.strokeStyle = colors[i % colors.length] + '42';
        target.lineWidth = unit * .003;
        target.beginPath();
        target.arc(x, y, radius * .65, 0, Math.PI * 2);
        target.stroke();
      }
    }
  } else if (effect === 'Stage Spotlight') {
    const x = w * (.5 + .23 * drift);
    const spotlight = target.createRadialGradient(x, h * .49, unit * .086, x, h * .49, unit * .6);
    spotlight.addColorStop(0, '#050c2100');
    spotlight.addColorStop(.52, '#050c213a');
    spotlight.addColorStop(1, '#050c21df');
    target.fillStyle = spotlight;
    target.fillRect(0, 0, w, h);
    paintRadialLight(target, x, h * .45, unit * .32, '#fbdbab');
  } else {
    const pulse = Math.max(0, 1 - (elapsed % .85) / .23) ** 2;
    target.globalAlpha *= .56 * pulse;
    target.fillStyle = '#f5f9ff';
    target.fillRect(0, 0, w, h);
  }
}

function drawGlitchVideoEffect(target, source, effect, elapsed, strength, surface, options) {
  const { width: w, height: h } = source;
  const frame = Math.floor(elapsed * 18);
  const displacement = presetRatio(options, 'shift');
  const noise = (index, channel) => glitchNoise(frame * 113 + index * 71 + channel * 1307);
  if (effect === 'Pixelate') {
    const block = 1 + Math.min(w, h) * .11 * strength ** 1.6 * presetRatio(options, 'pixel');
    const small = surface('pixelate', Math.max(1, Math.round(w / block)), Math.max(1, Math.round(h / block)));
    small.clearRect(0, 0, small.canvas.width, small.canvas.height);
    small.drawImage(source, 0, 0, small.canvas.width, small.canvas.height);
    target.globalCompositeOperation = 'source-atop';
    target.globalAlpha = strength;
    target.imageSmoothingEnabled = false;
    target.drawImage(small.canvas, 0, 0, w, h);
    return;
  }
  if (effect === 'Scanlines' || effect === 'TV Static') {
    target.globalCompositeOperation = 'source-atop';
    if (effect === 'Scanlines') {
      const line = Math.max(2, Math.round(h / 93 * presetRatio(options, 'pitch')));
      target.fillStyle = '#07101e';
      target.globalAlpha = strength * .67;
      for (let y = Math.floor(elapsed * 16) % line; y < h; y += line) target.fillRect(0, y, w, line * .45);
      const sweep = h * ((elapsed * .8) % 1);
      const glow = target.createLinearGradient(0, sweep - h * .08, 0, sweep + h * .08);
      glow.addColorStop(0, '#52adff00');
      glow.addColorStop(.5, '#52adff83');
      glow.addColorStop(1, '#52adff00');
      target.fillStyle = glow;
      target.fillRect(0, sweep - h * .08, w, h * .16);
    } else {
      const block = presetRatio(options, 'pixel');
      const staticLayer = surface('static', Math.round(144 / block), Math.round(81 / block));
      const pixels = staticLayer.createImageData(staticLayer.canvas.width, staticLayer.canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const tone = Math.round(255 * glitchNoise(frame * 2251 + i));
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tone;
        pixels.data[i + 3] = 255;
      }
      staticLayer.putImageData(pixels, 0, 0);
      target.globalAlpha = .78 * strength;
      target.imageSmoothingEnabled = false;
      target.drawImage(staticLayer.canvas, 0, 0, w, h);
    }
    return;
  }
  if (effect === 'Signal Loss') {
    target.globalCompositeOperation = 'source-atop';
    const dropout = .4 + .6 * Math.sin(elapsed * 3.1) ** 6;
    target.globalAlpha = strength * dropout * .76;
    target.fillStyle = '#0a1723';
    target.fillRect(0, 0, w, h);
    const y = (elapsed * .7 % 1) * h;
    target.globalAlpha = strength * .68;
    target.filter = 'saturate(.08) contrast(1.75)';
    target.drawImage(source, 0, 0, w, h * .13, -w * .04 * strength * displacement, y - h * .09, w * 1.08, h * .08);
    return;
  }
  if (['Wave Distortion', 'Ripple', 'Liquid', 'Chromatic Screen Tear'].includes(effect)) {
    const tear = effect === 'Chromatic Screen Tear';
    const rows = Math.min(h, tear ? 17 : 72);
    target.globalCompositeOperation = 'source-atop';
    for (let row = 0; row < rows; row++) {
      const y = Math.round(row * h / rows);
      const height = Math.round((row + 1) * h / rows) - y;
      const t = row / rows;
      const ripple = Math.abs(t - .5);
      const wave = effect === 'Ripple' ? Math.sin(ripple * 38 - elapsed * 11) * (1 - ripple * 1.6)
        : Math.sin(t * (effect === 'Liquid' ? 9 : 24) + elapsed * 7);
      const shift = w * strength * displacement * (tear ? (noise(row, 2) - .5) * .31 : .07 * wave);
      if (tear && noise(row, 0) < .49) continue;
      const stretch = effect === 'Liquid' ? 1 + strength * .23 * Math.sin(t * 13 - elapsed * 5) : 1;
      target.filter = tear ? 'hue-rotate(' + Math.round((noise(row, 1) - .5) * 210 * strength) + 'deg)' : 'none';
      target.globalAlpha = tear ? .89 * strength : 1;
      target.drawImage(source, 0, y, w, height, shift + w * (1 - stretch) / 2, y, w * stretch, height);
    }
    return;
  }
  const mosh = effect === 'Data Moshing';
  const cyberpunk = effect === 'Cyberpunk Glitch';
  target.globalCompositeOperation = 'source-atop';
  target.globalAlpha = strength * (cyberpunk ? .69 : .85);
  if (cyberpunk) {
    target.filter = 'saturate(2.2) hue-rotate(38deg) contrast(1.2)';
    target.drawImage(source, w * .014 * strength, 0);
    target.filter = 'none';
  }
  for (let i = 0, count = Math.round((mosh ? 24 : 35) * presetRatio(options, 'density')); i < count; i++) {
    const x = w * noise(i, 0);
    const y = h * noise(i, 1);
    const width = Math.min(w - x, w * (.025 + noise(i, 2) * (mosh ? .18 : .09)));
    const height = Math.min(h - y, h * (.014 + noise(i, 3) * (mosh ? .14 : .057)));
    const offset = (noise(i, 4) - .5) * strength * w * (mosh ? .6 : .32) * displacement;
    if ((cyberpunk || !mosh) && i % 3 === 0) {
      target.fillStyle = (cyberpunk ? ['#12d9ef', '#fb35d3', '#4d4bff'] : ['#ecd35a', '#ec468a', '#7df6a9'])[Math.floor(i / 3) % 3];
      target.fillRect(x + offset, y, width, height * .45);
    } else {
      target.drawImage(source, x, y, width, height, x + offset, y, width * (mosh ? 1.7 : 1), height);
      if (mosh) target.drawImage(source, x, y, Math.max(1, width * .16), height, x + offset + width, y, width * 2.3, height);
    }
  }
}

function subjectContours(mask, interpolate = false) {
  const version = personMaskVersions.get(mask);
  const cached = effectOutlineCache.get(mask);
  if (version !== undefined && cached?.version === version && cached.interpolate === interpolate) return cached.paths;
  const scale = 110 / Math.max(mask.width, mask.height);
  const w = Math.max(4, Math.round(mask.width * scale));
  const h = Math.max(4, Math.round(mask.height * scale));
  outlineSample.canvas.width = w + 2;
  outlineSample.canvas.height = h + 2;
  outlineSample.drawImage(mask, 1, 1, w, h);
  const stride = w + 2;
  const rgba = outlineSample.getImageData(0, 0, stride, h + 2).data;
  const gridWidth = stride * 2;
  const paths = [];
  const links = new Map();
  const crossings = new Map();
  const join = (a, b) => {
    if (!links.has(a)) links.set(a, new Set());
    links.get(a).add(b);
  };
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const pixel = y * stride + x;
      const alpha = [pixel, pixel + 1, pixel + stride + 1, pixel + stride].map(i => rgba[i * 4 + 3]);
      const gx = x * 2;
      const gy = y * 2 * gridWidth;
      const edges = [gy + gx + 1, gy + gridWidth + gx + 2, gy + 2 * gridWidth + gx + 1, gy + gridWidth + gx]
        .filter((edge, index) => {
          const start = alpha[index];
          const end = alpha[(index + 1) % 4];
          if ((start >= 128) === (end >= 128)) return false;
          if (interpolate && !crossings.has(edge)) {
            const t = (128 - start) / (end - start);
            const u = [t, 1, 1 - t, 0][index];
            const v = [0, t, 1, 1 - t][index];
            crossings.set(edge, [(x + u - 1) / w, (y + v - 1) / h]);
          }
          return true;
        });
      for (let index = 0; index < edges.length; index += 2) {
        join(edges[index], edges[index + 1]);
        join(edges[index + 1], edges[index]);
      }
    }
  }
  while (links.size) {
    const start = links.keys().next().value;
    const path = [];
    let point = start;
    while (links.has(point)) {
      path.push(crossings.get(point) ?? [(point % gridWidth / 2 - 1) / w, (Math.floor(point / gridWidth) / 2 - 1) / h]);
      const next = links.get(point).values().next().value;
      links.get(point).delete(next);
      if (!links.get(point).size) links.delete(point);
      links.get(next).delete(point);
      if (!links.get(next).size) links.delete(next);
      point = next;
    }
    if (path.length >= 7) paths.push(path);
  }
  if (version !== undefined) effectOutlineCache.set(mask, { version, interpolate, paths });
  return paths;
}

function drawSubjectOutline(target, name, elapsed, strength, subject) {
  const { x, y, width, height, bodySource } = subject;
  const { dx, dy, thickness } = subject.geometry ?? bodyEffectDefaults;
  const paths = subjectContours(bodySource ? stableBodyOutlineMask(bodySource) : subject.mask, true);
  const unit = Math.max(1, Math.min(target.canvas.width, target.canvas.height) / 180);
  const electric = name === 'Electric Edge';
  const doodle = name === 'Doodle Outline';
  const double = name === 'Double Outline';
  const saber = name === 'Saber/Laser Outline';
  const rainbow = name === 'Rainbow Aura';
  const pulse = .82 + .18 * Math.sin(elapsed * (saber ? 8 : 4)) ** 2;
  let color = electric ? '#8aefff' : doodle ? '#fff5b1' : saber ? '#47f49b' : double ? '#f18bff' : '#ff61d6';
  if (rainbow) {
    color = target.createLinearGradient(x + dx, y + dy, x + dx + width, y + dy + height);
    for (let i = 0; i <= 6; i++) color.addColorStop(i / 6, 'hsl(' + (i * 60 + elapsed * 95) % 360 + ',100%,66%)');
  }
  target.globalAlpha *= strength * pulse * (bodySource?.pose?.opacity ?? 1);
  target.lineJoin = 'round';
  target.lineCap = 'round';
  if (name === 'Dashed Line' || electric) {
    target.setLineDash(electric ? [6 * unit, 3 * unit, unit, 2 * unit] : [4 * unit, 3 * unit]);
    target.lineDashOffset = -elapsed * unit * 18;
  }
  const trace = expansion => {
    target.beginPath();
    for (const path of paths) {
      for (const [index, [u, v]] of path.entries()) {
        const shake = electric ? unit * Math.sin(index * 6.1 + elapsed * 22) : doodle ? unit * Math.sin(index * .55 + elapsed * 6) : 0;
        const method = index ? 'lineTo' : 'moveTo';
        const [px, py] = projectBodyPoint(bodySource ?? subject, .5 + (u - .5) * expansion, .5 + (v - .5) * expansion);
        target[method](px + dx + shake, py + dy - shake * .65);
      }
      target.closePath();
    }
  };
  target.strokeStyle = color;
  target.shadowColor = color instanceof CanvasGradient ? '#a86cfd' : color;
  target.shadowBlur = unit * pulse * (doodle ? 1 : saber ? 6 : 4) * Math.sqrt(thickness);
  target.lineWidth = unit * (saber ? 3.7 : 2.35) * thickness;
  trace(1);
  target.stroke();
  if (saber || double || electric) {
    target.shadowBlur = 0;
    target.lineWidth = unit * (double ? 1.05 : .8) * thickness;
    target.strokeStyle = '#fff';
    if (double) trace(1.045 + .025 * pulse);
    target.stroke();
  }
}

function isolateTrailSubject(output, body, w, h) {
  const { width, height } = output.canvas;
  output.clearRect(0, 0, width, height);
  output.save();
  output.scale(width / w, height / h);
  const { media, mask, width: fittedW, height: fittedH, pose } = body;
  let x = body.x;
  let y = body.y;
  if (pose) {
    output.translate(pose.x, pose.y);
    output.rotate(pose.angle);
    output.scale(pose.scale, pose.scale);
    x = -fittedW / 2;
    y = -fittedH / 2;
  }
  output.drawImage(media, x, y, fittedW, fittedH);
  if (mask) {
    output.globalCompositeOperation = 'destination-in';
    output.drawImage(mask, x, y, fittedW, fittedH);
  }
  output.restore();
}

const trailPresets = {
  'Shadow Clone': { delays: [0, 0], spacing: .105, colors: ['#171327', '#29263a'], opacity: .67 },
  'Ghost Trail': { delays: [.46, .29, .14], spacing: .025, colors: ['#d0e9ff'], opacity: .41 },
  'Step Print': { delays: [.57, .38, .19], spacing: .06, colors: [], opacity: .73 },
  'Rainbow Trail': { delays: [.56, .43, .31, .2, .1], spacing: .033, colors: ['#944dff', '#3e9aff', '#40f7a5', '#ffd358', '#ff577f'], opacity: .65 },
  Afterimage: { delays: [.25, .16, .077], spacing: .014, colors: ['#7ef9ee'], opacity: .45 },
  'Split Clone': { delays: [0, 0], spacing: .2, colors: [], opacity: .89 }
};
const isMotionTrail = effect => Boolean(trailPresets[effect]?.delays[0]);
const trailSubjectCenters = new WeakMap();

function bodyTrailDelays(clip) {
  const delays = trailPresets[clip.effect]?.delays;
  if (!delays?.[0]) return delays;
  const seconds = bodyEffectValue(clip, 'trailLength');
  return seconds === delays[0] ? delays : delays.map(delay => delay * seconds / delays[0]);
}

function trailSubjectCenter(mask) {
  const version = personMaskVersions.get(mask);
  const cached = trailSubjectCenters.get(mask);
  if (cached && cached.version === version) return cached.center;
  const points = subjectContours(mask).flat();
  const center = points.length ? [0, 1].map(axis => {
    const coordinates = points.map(point => point[axis]);
    return (Math.min(...coordinates) + Math.max(...coordinates)) / 2;
  }) : [.5, .5];
  trailSubjectCenters.set(mask, { version, center });
  return center;
}

function drawBodyTrail(target, name, elapsed, strength, surface, subject) {
  const { width: w, height: h } = target.canvas;
  const body = subject.bodySource;
  if (!body || (body.media.readyState ?? 2) < 2 || body.pose?.opacity === 0) return;
  const scale = Math.min(1, 480 / Math.max(w, h));
  const current = surface('bodyTrailCurrent', Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
  const preset = trailPresets[name];
  const { dx, dy, size, range } = subject.geometry ?? bodyEffectDefaults;
  const staticPair = preset.delays[0] === 0;
  if (staticPair || !body.visual) isolateTrailSubject(current, body, w, h);
  const tinted = preset.colors.length ? surface('bodyTrailTint') : null;
  for (const [index, delay] of (subject.trailDelays ?? preset.delays).entries()) {
    let pose = body.pose;
    let matte = body.mask;
    if (!staticPair && body.visual) {
      const sample = bodyTrailFrame(body, delay);
      if (!sample) continue;
      if (pose) pose = overlayPose(body.visual, sample.at, target.canvas);
      isolateTrailSubject(current, { ...body, media: sample.image, mask: sample.mask, pose }, w, h);
      matte = sample.mask ?? sample.image;
    }
    let image = current.canvas;
    if (tinted) {
      tinted.clearRect(0, 0, w, h);
      tinted.save();
      tinted.drawImage(image, 0, 0, w, h);
      tinted.globalCompositeOperation = 'source-atop';
      tinted.globalAlpha = name === 'Shadow Clone' ? .92 : .63;
      tinted.fillStyle = preset.colors[index % preset.colors.length];
      tinted.fillRect(0, 0, w, h);
      tinted.restore();
      image = tinted.canvas;
    }
    const distance = staticPair ? (index ? 1 : -1) * (.94 + .12 * Math.sin(elapsed * 3))
      : (preset.delays.length - index) * (body.visual ? .42 : 1) * (.83 + .17 * Math.cos(elapsed * 4));
    const offset = w * preset.spacing * distance * strength;
    target.save();
    target.globalAlpha = strength * (pose?.opacity ?? 1) * preset.opacity *
      (staticPair ? 1 : .42 + .58 * (index + 1) / preset.delays.length);
    const zoom = staticPair ? .91 : 1;
    target.translate(w / 2 + offset * range + dx, -h * Math.abs(distance) * .011 * strength * range + dy);
    if (name === 'Split Clone' && index === 0) target.scale(-1, 1);
    const [cx, cy] = size === 1 ? [0, 0] : projectBodyPoint({ ...body, pose }, ...trailSubjectCenter(matte));
    target.drawImage(image, zoom * (-w / 2 + cx * (1 - size)), zoom * cy * (1 - size), w * zoom * size, h * zoom * size);
    target.restore();
  }
}

function bodyEffectAnchors(body, detailKind) {
  const { width, height, pose } = body;
  const project = (u, v) => projectBodyPoint(body, u, v);
  const joints = body.joints ?? personPoseFor(body.media) ?? {};
  const detailFace = detailKind === 'face' ? faceDetailsFor(body, joints) : null;
  const face = detailFace?.nose ? detailFace : null;
  const hands = detailKind === 'hand' ? handDetailsFor(body, joints) : null;
  const projectDetail = point => point && project(point.x, point.y);
  const landmark = name => joints[name] && project(joints[name].x, joints[name].y);
  const midpoint = (a, b) => a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a ?? b;
  const points = subjectContours(body.mask).flat();
  const minX = points.length ? Math.min(...points.map(([u]) => u)) : .25;
  const maxX = points.length ? Math.max(...points.map(([u]) => u)) : .75;
  const minY = points.length ? Math.min(...points.map(([, v]) => v)) : .08;
  const maxY = points.length ? Math.max(...points.map(([, v]) => v)) : .92;
  const cx = (minX + maxX) / 2;
  const shoulder = midpoint(landmark('leftShoulder'), landmark('rightShoulder'));
  const hips = midpoint(landmark('leftHip'), landmark('rightHip'));
  const torso = shoulder && hips ? midpoint(shoulder, hips) : shoulder ?? project(cx, minY + (maxY - minY) * .44);
  let poseEyes = [joints.leftEye, joints.rightEye].filter(Boolean);
  if (detailFace && !face && poseEyes.length === 2) {
    const [ear, other] = [joints.leftEar, joints.rightEar].filter(Boolean).sort((a, b) => b.confidence - a.confidence);
    if (ear?.confidence >= .74 && (other?.confidence ?? 0) < .65) {
      const distances = poseEyes.map(point => Math.hypot((point.x - ear.x) * width, (point.y - ear.y) * height));
      if (Math.max(...distances) > Math.min(...distances) * 1.2) poseEyes = [poseEyes[distances[0] <= distances[1] ? 0 : 1]];
    }
  }
  const eyes = face ? face.eyes.map(eye => projectDetail(eye.center)) : poseEyes.map(projectDetail);
  const pupils = face ? face.eyes.map(eye => projectDetail(eye.pupil))
    : poseEyes.map(eye => {
    const point = eye.pupil ?? eye;
    return project(point.x, point.y);
  });
  const ears = ['leftEar', 'rightEar'].flatMap(name => {
    const point = landmark(name);
    return point ? [{ point, confidence: joints[name].confidence }] : [];
  });
  const nose = face ? projectDetail(face.nose) : landmark('nose');
  const eyeMid = midpoint(...eyes);
  const scale = pose?.scale ?? 1;
  const size = Math.max(8, Math.min(width, height) * scale * Math.max(.25, maxX - minX));
  const wrists = hands ? hands.map(hand => ({
    wrist: projectDetail(hand.wrist), elbow: projectDetail(hand.elbow), palm: projectDetail(hand.palm), detailed: true
  })) : ['left', 'right'].flatMap(side => {
    const wrist = landmark(side + 'Wrist');
    if (!wrist) return [];
    const elbow = landmark(side + 'Elbow');
    const dx = elbow ? wrist[0] - elbow[0] : 0;
    const dy = elbow ? wrist[1] - elbow[1] : 0;
    const extension = Math.min(.19, size * .1 / Math.max(1, Math.hypot(dx, dy)));
    return [{ wrist, elbow, palm: [wrist[0] + dx * extension, wrist[1] + dy * extension] }];
  });
  const headReference = joints.nose ?? joints.leftEye ?? joints.rightEye;
  let top = project(cx, minY);
  if (headReference) {
    const span = Math.max(.08, Math.abs((joints.leftEye?.x ?? headReference.x) - (joints.rightEye?.x ?? headReference.x)));
    const headPoints = points.filter(([u, v]) => Math.abs(u - headReference.x) < span * .95 &&
      v <= headReference.y && v >= headReference.y - Math.max(.11, span * width / height * 2.1));
    const crown = headPoints.length ? Math.min(...headPoints.map(([, v]) => v))
      : Math.max(0, headReference.y - span * width / height * 1.3);
    top = project(headReference.x, crown);
  }
  top = projectDetail(face?.crown) ?? top;
  const head = projectDetail(face?.head) ?? (headReference ? midpoint(top, nose ?? eyeMid) : null);
  const [left, right] = [landmark('leftShoulder'), landmark('rightShoulder')].sort((a, b) => (a?.[0] ?? 0) - (b?.[0] ?? 0));
  const legs = ['left', 'right'].map(side => ({
    hip: landmark(side + 'Hip'), knee: landmark(side + 'Knee'), ankle: landmark(side + 'Ankle')
  }));
  return { torso, shoulder: shoulder ?? torso, left, right, hips, eyes, pupils, ears, eyeMid, nose, wrists, legs, size,
    angle: pose?.angle ?? 0, top, head, mouth: projectDetail(face?.mouth), detailedFace: Boolean(face) };
}

function effectBodyAnchors(body, effect) {
  const kind = bodyDetailKind(effect);
  const bucket = kind ?? 'pose';
  body.anchorsByKind ??= {};
  return body.anchorsByKind[bucket] ??= bodyEffectAnchors(body, kind);
}

function warpBodyRegion(target, source, center, radii, stretch, amount, surface, shift = 0) {
  const { width: w, height: h } = source;
  const [cx, cy] = center;
  const [rx, ry] = radii;
  const left = Math.max(0, Math.floor(cx - rx));
  const top = Math.max(0, Math.floor(cy - ry));
  const right = Math.min(w, Math.ceil(cx + rx));
  const bottom = Math.min(h, Math.ceil(cy + ry));
  const cropW = right - left;
  const cropH = bottom - top;
  if (cropW < 2 || cropH < 2) return;
  const scale = Math.min(1, 220 / Math.max(cropW, cropH));
  const width = Math.max(2, Math.round(cropW * scale));
  const height = Math.max(2, Math.round(cropH * scale));
  const sample = surface('bodyWarpPixels', width, height);
  sample.clearRect(0, 0, width, height);
  sample.drawImage(source, left, top, cropW, cropH, 0, 0, width, height);
  const data = sample.getImageData(0, 0, width, height).data;
  const result = sample.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const dy = top + y * cropH / height - cy;
    for (let x = 0; x < width; x++) {
      const dx = left + x * cropW / width - cx;
      const radius = dx ** 2 / rx ** 2 + dy ** 2 / ry ** 2;
      if (radius >= 1) continue;
      const falloff = (1 - radius) ** 2;
      const sx = clamp(x - dx * width / cropW * stretch[0] * falloff * amount, 0, width - 1);
      const sy = clamp(y - (dy * stretch[1] + shift) * height / cropH * falloff * amount, 0, height - 1);
      const px = Math.floor(sx), py = Math.floor(sy);
      const nx = Math.min(width - 1, px + 1), ny = Math.min(height - 1, py + 1);
      const ax = sx - px, ay = sy - py;
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const upper = data[(py * width + px) * 4 + channel] * (1 - ax) + data[(py * width + nx) * 4 + channel] * ax;
        const lower = data[(ny * width + px) * 4 + channel] * (1 - ax) + data[(ny * width + nx) * 4 + channel] * ax;
        result.data[index + channel] = (upper * (1 - ay) + lower * ay) * (channel === 3 ? Math.min(1, falloff * 8) : 1);
      }
    }
  }
  sample.putImageData(result, 0, 0);
  target.drawImage(sample.canvas, left, top, cropW, cropH);
}

const bodyFaceGraphics = new Set(['Emoji Face', '3D Sunglasses', 'Neon Mask']);

function drawBodyFaceGraphic(target, effect, face, width, angle, strength, pupils) {
  target.translate(...face);
  target.rotate(angle);
  target.scale(width, width);
  target.globalAlpha = strength;
  target.lineWidth = .065;
  target.lineJoin = 'round';
  if (effect === 'Emoji Face') {
    target.fillStyle = '#ffc947';
    target.beginPath();target.ellipse(0, .12, .73, .88, 0, 0, Math.PI * 2);target.fill();
    target.fillStyle = '#443024';
    for (const x of [-.25, .25]) {
      target.beginPath();target.ellipse(x, -.04, .08, .12, 0, 0, Math.PI * 2);target.fill();
    }
    target.strokeStyle = '#693326';
    target.beginPath();target.arc(0, .15, .32, .15, Math.PI - .15);target.stroke();
  } else if (effect === '3D Sunglasses') {
    const centers = pupils.map(([x, y]) => rotateOverlayPoint((x - face[0]) / width, (y - face[1]) / width, -angle))
      .sort((a, b) => a[0] - b[0]);
    target.strokeStyle = '#18152b';
    if (centers.length === 2) {
      target.beginPath();target.moveTo(centers[0][0], centers[0][1]);
      target.lineTo(centers[1][0], centers[1][1]);target.stroke();
    }
    for (const [index, [cx, cy]] of centers.entries()) {
      const x = cx - .225, y = cy - .17;
      const color = index ? '#f44776' : '#21d8f5';
      const glass = target.createLinearGradient(x, y, x + .45, y + .34);
      glass.addColorStop(0, color);
      glass.addColorStop(.75, '#20203c');
      target.fillStyle = glass;
      target.beginPath();target.roundRect(x, y, .45, .34, .085);target.fill();target.stroke();
    }
  } else {
    target.strokeStyle = '#1af0db';
    target.beginPath();
    target.moveTo(-.67, -.25);target.lineTo(-.48, .49);target.lineTo(0, .79);
    target.lineTo(.48, .49);target.lineTo(.67, -.25);target.lineTo(0, -.7);target.closePath();target.stroke();
    target.strokeStyle = '#f05bff';
    for (const [x, y] of pupils) {
      const [u, v] = rotateOverlayPoint((x - face[0]) / width, (y - face[1]) / width, -angle);
      target.beginPath();target.moveTo(u - .15, v);
      target.lineTo(u, v - .1);target.lineTo(u + .15, v);target.lineTo(u, v + .1);
      target.closePath();target.stroke();
    }
    target.beginPath();target.moveTo(-.21, .45);target.lineTo(0, .51);target.lineTo(.21, .45);target.stroke();
  }
}

function drawBodyDistortion(target, effect, elapsed, strength, surface, subject) {
  const body = subject.bodySource;
  if (!body) return;
  const anchors = effectBodyAnchors(body, effect);
  const { pupils, nose, torso, shoulder, hips, legs, size } = anchors;
  const geometry = subject.geometry ?? bodyEffectDefaults;
  const offset = point => offsetBodyAnchor(point, geometry);
  const scale = geometry.size;
  const { width: w, height: h } = target.canvas;
  const face = offset(pupils.length === 2 ? [(pupils[0][0] + pupils[1][0]) / 2, (pupils[0][1] + pupils[1][1]) / 2] : pupils[0] ?? nose);
  const torsoEffect = effect === 'Slim Body' || effect === 'Stretch Body';
  if (!face && !torsoEffect && effect !== 'Long Legs') return;
  const amount = strength * (body.pose?.opacity ?? 1);
  if (!amount) return;
  const eyePair = [...pupils].sort((a, b) => a[0] - b[0]);
  const eyeGap = eyePair.length === 2 ? Math.hypot(eyePair[1][0] - eyePair[0][0], eyePair[1][1] - eyePair[0][1]) : 0;
  const faceSize = Math.max(size * .26, eyeGap * 1.85);
  const faceAngle = eyeGap ? Math.atan2(eyePair[1][1] - eyePair[0][1], eyePair[1][0] - eyePair[0][0]) : anchors.angle;
  if (bodyFaceGraphics.has(effect)) {
    drawBodyFaceGraphic(target, effect, face, faceSize * scale, faceAngle, amount, pupils.map(offset));
    return;
  }
  let source = subject.distortionSource;
  if (!source) {
    const copy = surface('bodyWarpSource');
    copy.clearRect(0, 0, w, h);
    copy.drawImage(target.canvas, 0, 0);
    source = copy.canvas;
    target.globalCompositeOperation = 'source-atop';
  }
  if (effect === 'Big Eyes' || effect === 'Anime Eyes') {
    const anime = effect === 'Anime Eyes';
    const horizontal = Math.min(faceSize * .35, eyeGap ? eyeGap * .48 : Infinity) * scale;
    const irisSize = faceSize * scale;
    for (const eye of pupils.map(offset)) {
      warpBodyRegion(target, source, eye, [horizontal, irisSize * .33], [.58, anime ? .88 : .61], amount, surface);
      if (!anime) continue;
      target.save();
      target.translate(...eye);target.rotate(faceAngle);
      target.globalAlpha = amount * .74;
      target.fillStyle = '#6b82ff';
      target.beginPath();target.ellipse(0, 0, irisSize * .094, irisSize * .137, 0, 0, Math.PI * 2);target.fill();
      target.fillStyle = '#fff8fc';
      target.beginPath();target.arc(-irisSize * .027, -irisSize * .053, irisSize * .034, 0, Math.PI * 2);target.fill();
      target.restore();
    }
  } else if (effect === 'Big Head' || effect === 'Bobblehead') {
    const bobble = effect === 'Bobblehead';
    const swell = bobble ? .38 + .27 * Math.sin(elapsed * 8.5) : .66;
    warpBodyRegion(target, source, offset(anchors.head) ?? face, [faceSize * 1.08 * scale, faceSize * 1.22 * scale],
      [swell, swell], amount, surface, bobble ? Math.sin(elapsed * 9.8) * faceSize * .42 * scale : 0);
  } else if (torsoEffect) {
    const halfHeight = hips ? Math.max(size * .46, Math.hypot(hips[0] - shoulder[0], hips[1] - shoulder[1]) * 1.12) : size * .83;
    const slim = effect === 'Slim Body';
    warpBodyRegion(target, source, offset(torso), [size * .87 * scale, halfHeight * scale], slim ? [-.56, .08] : [.16, .72], amount, surface);
  } else if (effect === 'Long Legs') {
    for (const { hip, knee, ankle } of legs) {
      if (!hip || !knee || !ankle) continue;
      const center = [(knee[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2];
      const length = Math.hypot(ankle[0] - hip[0], ankle[1] - hip[1]);
      warpBodyRegion(target, source, offset(center), [Math.max(size * .3, Math.abs(ankle[0] - hip[0]) * .75) * scale, length * .85 * scale],
        [.04, .73], amount, surface, length * .11 * scale);
    }
  } else {
    const radius = faceSize * .82 * scale;
    const x = face[0] - radius, y = face[1] - radius;
    target.beginPath();
    target.ellipse(...face, radius, radius * 1.16, faceAngle, 0, Math.PI * 2);
    target.clip();
    if (effect === 'Pixel Face') {
      const cells = Math.round(19 - amount * 12);
      const pixel = surface('bodyPixelFace', cells, cells);
      pixel.clearRect(0, 0, cells, cells);
      pixel.drawImage(source, x, y - radius * .2, radius * 2, radius * 2.4, 0, 0, cells, cells);
      target.globalAlpha = amount;
      target.imageSmoothingEnabled = false;
      target.drawImage(pixel.canvas, x, y - radius * .2, radius * 2, radius * 2.4);
    } else {
      const tick = Math.floor(elapsed * 14);
      target.globalAlpha = amount * .88;
      for (let row = 0; row < 13; row++) {
        const y0 = y - radius * .3 + row * radius * .2;
        const shift = (glitchNoise(tick * 113 + row * 23) - .5) * radius * .9 * amount;
        target.filter = row % 3 === 0 ? 'hue-rotate(83deg) saturate(2)' : 'none';
        target.drawImage(source, 0, y0, w, radius * .2, shift, y0, w, radius * .2);
      }
    }
  }
}

function strokeEnergyBolt(target, start, end, color, unit, phase, spread = 1) {
  const [x, y] = start;
  const dx = end[0] - x;
  const dy = end[1] - y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return;
  target.save();
  target.strokeStyle = color;
  target.shadowColor = color;
  target.shadowBlur = unit * .28;
  target.lineWidth = Math.max(1, unit * .09);
  target.beginPath();
  target.moveTo(x, y);
  for (let i = 1; i < 9; i++) {
    const jump = phase === null ? 0 : Math.sin(i * 7.71 + phase) * unit * .45 * spread;
    target.lineTo(x + dx * i / 9 - dy / distance * jump, y + dy * i / 9 + dx / distance * jump);
  }
  target.lineTo(...end);
  target.stroke();
  target.strokeStyle = '#f4fcff';
  target.lineWidth *= .37;
  target.stroke();
  target.restore();
}

function laserEyeRays({ eyes, pupils, ears = [], eyeMid, nose, angle = 0 }, frameWidth) {
  if (!pupils.length) return [];
  const local = point => rotateOverlayPoint(point[0] - eyeMid[0], point[1] - eyeMid[1], -angle);
  const [left, right] = eyes.map(local).sort((a, b) => a[0] - b[0]);
  const gap = right ? Math.max(1, Math.hypot(right[0] - left[0], right[1] - left[1])) : 1;
  const [noseX, noseY] = nose ? local(nose) : [0, 0];
  const orderedEars = [...ears].sort((a, b) => b.confidence - a.confidence);
  const ear = orderedEars[0];
  const [earX, earY] = ear ? local(ear.point) : [0, 0];
  const profile = ear?.confidence >= .7 && (orderedEars[1]?.confidence ?? 0) < .66 &&
    Math.abs(earX) > Math.max(gap * .88, 10);
  const scale = right ? gap : Math.max(12, Math.abs(noseY) * 1.45, Math.abs(earX) * .6);
  const shift = pupils.reduce((total, eye, i) => total + local(eye)[0] - local(eyes[i])[0], 0) / (scale * pupils.length);
  const gaze = profile ? -Math.sign(earX) * Math.min(.36, Math.abs(earX) / scale * .23)
    : nose ? noseX / scale + shift * .65 : 0;
  const pitch = profile ? clamp(-earY / Math.max(1, Math.abs(earX)) * .32, -.19, .19) * Math.sign(gaze)
    : right ? clamp(Math.atan2(right[1] - left[1], Math.max(1, right[0] - left[0])), -.21, .21) : 0;
  const [ux, uy] = rotateOverlayPoint(1, pitch, angle);
  const length = Math.abs(gaze) < .058 ? 0 : Math.min(.48, Math.abs(gaze) * 1.9) * frameWidth;
  const direction = Math.sign(gaze) * length;
  return pupils.map(start => ({ start, end: [start[0] + direction * ux, start[1] + direction * uy] }));
}

function drawBodyEnergy(target, effect, elapsed, strength, subject) {
  const body = subject.bodySource;
  if (!body) return;
  const anchors = effectBodyAnchors(body, effect);
  const { shoulder, left, right, eyeMid, nose, wrists, angle, top } = anchors;
  const geometry = subject.geometry ?? bodyEffectDefaults;
  const offset = point => offsetBodyAnchor(point, geometry);
  const torso = offset(anchors.torso);
  const size = anchors.size * geometry.size;
  const reach = anchors.size * geometry.range;
  const { width: w, height: h } = target.canvas;
  const pulse = .8 + .2 * Math.sin(elapsed * 5) ** 2;
  const opacity = strength * (body.pose?.opacity ?? 1);
  target.globalAlpha = opacity * pulse;
  if (effect === 'Laser Eyes') {
    for (const ray of laserEyeRays(anchors, w)) {
      const start = offset(ray.start);
      if (subject.handOcclusion && target.isPointInPath(subject.handOcclusion, ...start)) continue;
      const end = ray.end.map((value, axis) => start[axis] + (value - ray.start[axis]) * geometry.range);
      paintRadialLight(target, ...start, size * .064, '#ff344c');
      strokeEnergyBolt(target, start, end, '#ff3955', size * .049, null);
    }
  } else if (effect === 'Lightning Hands') {
    for (const { palm, wrist, elbow, detailed } of wrists) {
      const base = detailed ? wrist : elbow ?? anchors.torso;
      const dx = palm[0] - base[0];
      const dy = palm[1] - base[1];
      const length = Math.max(1, Math.hypot(dx, dy));
      const start = offset(palm);
      for (let i = -1; i <= 1; i++) {
        strokeEnergyBolt(target, start, [start[0] + dx / length * reach * .76 - i * reach * .2,
          start[1] + dy / length * reach * .76 + i * reach * .31], '#62caff', size * .22, elapsed * 21 + i * 4);
      }
      paintRadialLight(target, ...start, size * .13, '#95e4ff');
    }
  } else if (effect === 'Ice Breath') {
    if (!nose) return;
    const [dx, dy] = rotateOverlayPoint(0, anchors.size * .095, angle);
    const mouth = offset(anchors.mouth ?? [nose[0] + dx, nose[1] + dy]);
    if (subject.handOcclusion && target.isPointInPath(subject.handOcclusion, ...mouth)) return;
    const direction = eyeMid && nose[0] < eyeMid[0] - anchors.size * .04 ? -1 : 1;
    for (let i = 9; i >= 0; i--) {
      const phase = (elapsed * 1.22 + i * .1) % 1;
      target.globalAlpha = opacity * (1 - phase) * .69;
      paintRadialLight(target, mouth[0] + direction * phase * reach * .88, mouth[1] + phase * reach * .26 +
        Math.sin(i * 3 + elapsed * 6) * phase * reach * .13, size * (.035 + phase * .19), i % 2 ? '#a5eaff' : '#ebfbff');
    }
  } else if (effect === 'Angel Halo') {
    target.translate(...offset(top));
    target.rotate(angle + Math.sin(elapsed * 2) * .07);
    target.strokeStyle = '#fff2a0';
    target.shadowColor = '#ffc553';
    target.shadowBlur = size * .14;
    target.lineWidth = Math.max(1, size * .025);
    target.beginPath();
    target.ellipse(0, -size * (.115 + Math.sin(elapsed * 3) * .019), size * .26, size * .075, 0, 0, 2 * Math.PI);
    target.stroke();
  } else if (effect === 'Wings') {
    for (const [direction, anchor] of [[-1, left ?? shoulder], [1, right ?? shoulder]]) {
      target.save();
      target.translate(...offset(anchor));
      target.rotate(angle + direction * Math.sin(elapsed * 4) * .19);
      target.scale(direction * geometry.range, 1);
      const glow = target.createLinearGradient(0, 0, size * 1.3, -size * .65);
      glow.addColorStop(0, '#c2adffc2');
      glow.addColorStop(.65, '#f5ecffed');
      glow.addColorStop(1, '#c0eaff24');
      target.fillStyle = glow;
      for (let i = 0; i < 8; i++) {
        const reach = size * (1.38 - i * .082);
        const tip = size * (-.83 + i * .153);
        target.beginPath();
        target.moveTo(0, size * .08);
        target.bezierCurveTo(reach * .49, -size * .78, reach * .7, tip * .88, reach, tip);
        target.quadraticCurveTo(reach * .73, tip + size * .24, size * .02, size * .19);
        target.fill();
      }
      target.restore();
    }
  } else if (effect === 'Electric Shock') {
    const endpoints = wrists.length ? wrists.map(point => point.palm) : [left, right].filter(Boolean);
    for (const point of endpoints) strokeEnergyBolt(target, torso, offset(point), '#a279ff', size * .3, elapsed * 23, geometry.range);
    paintRadialLight(target, ...torso, size * .56, '#9a7cff');
  } else {
    const fire = effect === 'Fire Aura';
    const electric = effect === 'Electric Aura';
    const spirit = effect === 'Spirit Glow';
    const color = fire ? '#ff7a31' : electric ? '#67d7ff' : spirit ? '#c394ed' : '#48f4bc';
    target.globalAlpha = opacity * (spirit ? .3 : .43);
    if (reach) paintRadialLight(target, ...torso, reach * (spirit ? 1.1 : .84), color);
    const count = fire ? 28 : electric ? 13 : 18;
    for (let i = 0; i < count; i++) {
      const phase = (elapsed * (fire ? .9 : .42) + i * .618) % 1;
      const sweep = i * 2.4 + elapsed * 2;
      const x = torso[0] + Math.cos(sweep) * reach * (.29 + phase * .49);
      const y = torso[1] + reach * (fire ? .55 - phase * 1.51 : Math.sin(sweep) * (.57 + phase * .35));
      target.globalAlpha = opacity * Math.sin(Math.PI * phase) * (spirit ? .4 : .75);
      if (electric) {
        strokeEnergyBolt(target, [x, y], [x + size * .2 * Math.cos(sweep), y + size * .24 * Math.sin(sweep)],
          color, size * .16, elapsed * 15 + i);
      } else {
        paintRadialLight(target, x, y, size * (.03 + (1 - phase) * (fire ? .15 : .088)), color);
      }
    }
  }
}

function drawDarkAngel(target, { shoulder, left, right, angle, size }, elapsed, strength, geometry) {
  target.globalAlpha = strength;
  for (const [direction, anchor] of [[-1, left ?? shoulder], [1, right ?? shoulder]]) {
    target.save();
    target.translate(...offsetBodyAnchor(anchor, geometry));
    target.rotate(angle + direction * Math.sin(elapsed * 3.6) * .16);
    target.scale(direction * size * geometry.size * geometry.range, size * geometry.size);
    const membrane = target.createLinearGradient(0, 0, 1.42, -.72);
    membrane.addColorStop(0, '#0a0814');
    membrane.addColorStop(.67, '#2c183b');
    membrane.addColorStop(1, '#151123ef');
    target.fillStyle = membrane;
    target.strokeStyle = '#8a456f';
    target.lineWidth = .022;
    target.beginPath();
    target.moveTo(0, .06);
    target.quadraticCurveTo(.28, -.71, 1.37, -.92);
    target.quadraticCurveTo(1.06, -.61, 1.43, -.04);
    target.quadraticCurveTo(1.02, -.24, 1.02, .32);
    target.quadraticCurveTo(.71, .03, .67, .46);
    target.quadraticCurveTo(.34, .21, 0, .24);
    target.closePath();
    target.fill();
    target.stroke();
    target.restore();
  }
}

function drawShatteredSubject(target, image, torso, elapsed, strength, range) {
  const { width: w, height: h } = target.canvas;
  const pulse = .26 + .74 * Math.sin(elapsed * 2.4) ** 2;
  const cols = 7, rows = 6;
  const dx = w / cols, dy = h / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const left = x * dx, top = y * dy;
      for (let side = 0; side < 2; side++) {
        const seed = (y * cols + x) * 97 + side * 19;
        const cx = left + dx * (side ? .32 : .68);
        const cy = top + dy * (side ? .68 : .32);
        const spread = (.14 + glitchNoise(seed) * .35) * strength * pulse * range;
        target.save();
        target.globalAlpha = strength * (.5 + glitchNoise(seed + 7) * .37);
        target.translate(cx + (cx - torso[0]) * spread, cy + (cy - torso[1]) * spread - dy * pulse * .22 * strength * range);
        target.rotate((glitchNoise(seed + 47) - .5) * spread * Math.PI);
        target.translate(-cx, -cy);
        target.beginPath();
        target.moveTo(left, top);
        target.lineTo(side ? left : left + dx, side ? top + dy : top);
        target.lineTo(left + dx, top + dy);
        target.closePath();
        target.clip();
        target.drawImage(image, left, top, dx, dy, left, top, dx, dy);
        target.restore();
      }
    }
  }
}

function drawMoodyBodyEffect(target, effect, elapsed, strength, surface, subject) {
  const body = subject.bodySource;
  if (!body || (body.media.readyState ?? 2) < 2) return;
  const opacity = strength * (body.pose?.opacity ?? 1);
  if (!opacity) return;
  const anchors = effectBodyAnchors(body, effect);
  const { pupils, torso, size } = anchors;
  const geometry = subject.geometry ?? bodyEffectDefaults;
  if (effect === 'Red Eyes') {
    target.globalAlpha = opacity * (.83 + .17 * Math.sin(elapsed * 6) ** 2);
    for (const pupil of pupils) {
      const [x, y] = offsetBodyAnchor(pupil, geometry);
      if (subject.handOcclusion && target.isPointInPath(subject.handOcclusion, x, y)) continue;
      if (geometry.range) paintRadialLight(target, x, y, size * .085 * geometry.range, '#ff1827');
      paintRadialLight(target, x, y, size * .024 * geometry.size, '#ffb2a9');
    }
    return;
  }
  const { width: w, height: h } = target.canvas;
  const layer = surface('moodySubject');
  isolateTrailSubject(layer, body, w, h);
  if (effect === 'Shatter Body') {
    drawShatteredSubject(target, layer.canvas, torso, elapsed, opacity, geometry.range);
    return;
  }
  target.globalAlpha = opacity;
  if (effect === 'Statue/Stone') {
    target.filter = 'grayscale(1) contrast(1.46) brightness(1.11)';
    target.drawImage(layer.canvas, 0, 0);
    target.filter = 'none';
    layer.save();
    layer.globalCompositeOperation = 'source-in';
    layer.fillStyle = '#adbac5';
    layer.fillRect(0, 0, w, h);
    layer.restore();
    target.globalAlpha = opacity * .22;
    target.drawImage(layer.canvas, 0, 0);
    return;
  }
  layer.save();
  layer.globalCompositeOperation = 'source-in';
  layer.fillStyle = effect === 'Smoke Body' ? '#433e52' : '#0c0b16';
  layer.fillRect(0, 0, w, h);
  layer.restore();
  target.globalAlpha = opacity * (effect === 'Dark Angel' ? .44 : effect === 'Smoke Body' ? .53 : .94);
  target.drawImage(layer.canvas, 0, 0);
  if (effect === 'Dark Angel') {
    paintBehindBody(target, subject, layer => drawDarkAngel(layer, anchors, elapsed, opacity, geometry));
  } else if (effect === 'Smoke Body') {
    const [cx, cy] = offsetBodyAnchor(torso, geometry);
    const reach = size * geometry.range;
    for (let i = 0; i < 16; i++) {
      const phase = (i * .618 + elapsed * .53) % 1;
      const x = cx + Math.sin(i * 3.7 + phase * 4) * reach * (.18 + phase * .65);
      const y = cy + reach * (.58 - phase * 1.77);
      target.globalAlpha = opacity * Math.sin(phase * Math.PI) * .47;
      paintRadialLight(target, x, y, size * geometry.size * (.13 + phase * .37), i % 2 ? '#818196' : '#38354c');
    }
  }
}

function drawLayerEffect(target, clip, elapsed, subject, beat, bounds) {
  const sourceTime = clip.start + elapsed;
  const strength = effectIntensityAt(clip, sourceTime) / 100;
  if (!strength || !animatedEffects.includes(clip.effect) || (subjectEffects.includes(clip.effect) && !subject)) return;
  if (subject && subjectEffects.includes(clip.effect) && clip.bodyEffectAdjustments?.[clip.effect]) {
    subject = { ...subject, geometry: bodyEffectGeometry(clip, subject), trailDelays: bodyTrailDelays(clip) };
  }
  if (beatFlashEffects.includes(clip.effect) && beat === 0) return;
  const options = presetOptions(clip, 'effect', clip.effect);
  const blend = effectBlendModes[clip.effectBlend] ?? effectBlendModes.Normal;
  const handOcclusion = subject?.bodySource && faceDetailEffects.has(clip.effect) ? handOcclusionPath(subject.bodySource) : null;
  const normal = blend === effectBlendModes.Normal;
  if (normal && !handOcclusion) {
    drawAnimatedEffect(target, clip.effect, sourceTime, strength, subject, beat, clip.filmStock, bounds, options);
    return;
  }
  if (clip.effect === 'Black flash' || clip.effect === 'White flash') {
    target.save();
    target.globalAlpha = strength * beat * .76;
    target.globalCompositeOperation = blend;
    target.fillStyle = clip.effect === 'White flash' ? '#fff' : '#000';
    target.fillRect(0, 0, target.canvas.width, target.canvas.height);
    target.restore();
    return;
  }
  const layer = handOcclusion ? bodyCompositeLayer(target.canvas, 'faceWithOcclusion') : cutoutLayer(target.canvas);
  if (handOcclusion) subject = { ...subject, handOcclusion };
  const distortion = bodyDistortionEffects.includes(clip.effect);
  if (distortion) {
    subject = { ...subject, distortionSource: target.canvas };
  } else if (![outlineEffects, cloneTrailEffects, auraEnergyEffects, moodyBodyEffects].some(group => group.includes(clip.effect))) {
    layer.drawImage(target.canvas, 0, 0);
  }
  drawAnimatedEffect(layer, clip.effect, sourceTime, normal ? strength : 1, subject, beat, clip.filmStock, bounds, options);
  if (handOcclusion) {
    layer.save();
    layer.globalCompositeOperation = 'destination-out';
    layer.fill(handOcclusion);
    layer.restore();
  }
  target.save();
  target.globalAlpha = normal ? 1 : strength;
  target.globalCompositeOperation = normal && distortion && !bodyFaceGraphics.has(clip.effect) ? 'source-atop' : blend;
  target.drawImage(layer.canvas, 0, 0);
  target.restore();
}

function effectBlendField(clip) {
  const row = document.createElement('label');
  row.className = 'field visual-choice';
  row.textContent = 'Blend mode';
  const select = document.createElement('select');
  for (const name of Object.keys(effectBlendModes)) select.add(new Option(name));
  select.value = clip.effectBlend ?? 'Normal';
  select.onchange = () => {
    remember();
    clip.effectBlend = select.value;
    refresh();
  };
  row.append(select);
  return row;
}

function effectSettings(clip) {
  const fields = [effectBlendField(clip)];
  if (subjectEffects.includes(clip.effect)) {
    fields.push(bodySubjectInspector(clip));
    const names = bodyEffectControlNames(clip.effect);
    if (names.length) {
      const group = document.createElement('section');
      const title = document.createElement('h3');
      title.className = 'section';
      title.textContent = 'Effect adjustments';
      group.append(title);
      for (const name of names) {
        const { label, min, max, step } = bodyEffectControls[name];
        inspectorSliderField(label, bodyEffectValue(clip, name), min, max, value => {
          const settings = clip.bodyEffectAdjustments;
          clip.bodyEffectAdjustments = { ...settings, [clip.effect]: { ...settings?.[clip.effect], [name]: value } };
          if (name === 'trailLength' && playback) pause();
          if (!playback && !layerOnScreen(clip, previewFramePosition())) seek(clip.at);
        }, step, group);
      }
      fields.push(group);
    }
  }
  if (clip.effect === 'Kodak/Fuji Film Emulations') {
    const row = document.createElement('label');
    row.className = 'field visual-choice';
    row.textContent = 'Film stock';
    const select = document.createElement('select');
    for (const name of Object.keys(filmStocks)) select.add(new Option(name));
    select.value = clip.filmStock ?? 'Kodak-style';
    select.onchange = () => {
      remember();
      clip.filmStock = select.value;
      refresh();
    };
    row.append(select);
    fields.push(row);
  }
  const adjustments = videoEffectSettings(clip);
  if (adjustments) fields.push(adjustments);
  fields.push(effectIntensityField(clip));
  return fields;
}

function timelineSubject(visual, media, position, withPose = false, historicalOnly = false) {
  const locked = visual.bodySubjectKeys?.length;
  const needsMask = !historicalOnly || locked || typeof media.currentTime !== 'number';
  if (needsMask) requestPersonModel();
  const tracked = locked ? lockedPersonFor(media, visual, visual.start + position - visual.at) : null;
  const mask = locked ? tracked?.mask : needsMask ? personMaskFor(media, withPose) : null;
  const fitted = fittedVisualSize(media, canvas);
  if ((!mask && needsMask) || !fitted) return null;
  const [width, height] = fitted;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  const bodySource = { media, visual, position, mask, x, y, width, height,
    joints: tracked?.joints, subjectKey: tracked?.key, identityNose: tracked?.candidate };
  if (!hasVisualTransform(visual)) return { mask, x, y, width, height, bodySource };
  const pose = overlayPose(visual, visual.start + position - visual.at, canvas);
  if (!needsMask) return { bodySource: { ...bodySource, pose } };
  const scale = Math.min(1, 160 / Math.max(canvas.width, canvas.height));
  const out = timelineEffectMask;
  out.canvas.width = Math.round(canvas.width * scale);
  out.canvas.height = Math.round(canvas.height * scale);
  out.scale(scale, scale);
  out.translate(pose.x, pose.y);
  out.rotate(pose.angle);
  out.scale(pose.scale, pose.scale);
  out.drawImage(mask, -width / 2, -height / 2, width, height);
  return { mask: out.canvas, x: 0, y: 0, width: canvas.width, height: canvas.height, bodySource: { ...bodySource, pose } };
}

function drawTimelineEffects(target, position, visual, media) {
  const activeEffects = clips.filter(clip => clip.track === 'effect' && layerOnScreen(clip, position));
  if (!activeEffects.length) return;
  const bodyEffects = activeEffects.filter(clip => subjectEffects.includes(clip.effect));
  const subject = bodyEffects.length ? timelineSubject(visual, media, position,
    bodyEffects.some(clip => poseBodyEffects.includes(clip.effect)), bodyEffects.every(clip => isMotionTrail(clip.effect))) : null;
  for (const clip of activeEffects) {
    const elapsed = position - clip.at;
    const beat = beatFlashEffects.includes(clip.effect) ? flashStrengthAt(position, clip.start + elapsed, visual, clip) : undefined;
    drawLayerEffect(target, clip, elapsed, subject, beat);
  }
}

function addTimelineEffect(effect, at = time) {
  if (!animatedEffects.includes(effect)) return;
  pause();
  remember();
  const footageEnd = Math.max(0, ...clips.filter(item => item.track === 'visual').map(item => item.at + length(item)));
  const remaining = footageEnd - at;
  const end = remaining >= .05 ? Math.min(3, remaining) : 3;
  const clip = { id: id(), track: 'effect', effect, at, start: 0, end };
  clips.push(clip);
  selected = clip.id;
  seek(at);
  refresh();
}

function effectTrackRows() {
  const rows = new Map();
  const ends = [];
  const effects = clips.filter(clip => clip.track === 'effect').sort((a, b) => a.at - b.at);
  for (const clip of effects) {
    const free = ends.findIndex(end => end <= clip.at + 1e-9);
    const row = free === -1 ? ends.length : free;
    ends[row] = clip.at + length(clip);
    rows.set(clip.id, row);
  }
  const height = Math.max(1, ends.length) * 53 + 'px';
  $('effectLane').style.height = $('effectTrackLabel').style.height = height;
  return rows;
}

function connectEffectTrack() {
  const lane = $('effectLane');
  lane.ondragover = event => {
    if (!event.dataTransfer.types.includes(effectDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    lane.classList.add('drop');
  };
  lane.ondragleave = event => {
    if (!lane.contains(event.relatedTarget)) lane.classList.remove('drop');
  };
  lane.ondrop = event => {
    const effect = event.dataTransfer.getData(effectDragType);
    lane.classList.remove('drop');
    if (!animatedEffects.includes(effect)) return;
    event.preventDefault();
    const at = Math.max(0, (event.clientX - lane.getBoundingClientRect().left) / zoom());
    addTimelineEffect(effect, Math.round(at * 1000) / 1000);
  };
}
