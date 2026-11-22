'use strict';

const textAtmosphereSurfaces = new WeakMap();
const textAtmosphereGeometry = new WeakMap();

function atmosphereSurface(frame, name, width, height) {
  if (!textAtmosphereSurfaces.has(frame)) textAtmosphereSurfaces.set(frame, {});
  const layers = textAtmosphereSurfaces.get(frame);
  const ctx = layers[name] ??= document.createElement('canvas').getContext('2d', { willReadFrequently: name === 'ink' });
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
  }
  return ctx;
}

function smokeSmooth(t) {
  const p = clamp(t, 0, 1);
  return p * p * (3 - 2 * p);
}

function smokeNoise(x, y) {
  const left = Math.floor(x);
  const top = Math.floor(y);
  const u = smokeSmooth(x - left);
  const v = smokeSmooth(y - top);
  const seed = Math.imul(left, 1640531513) ^ Math.imul(top, 374761393);
  const a = stableTextRandom(seed);
  const b = stableTextRandom(Math.imul(left + 1, 1640531513) ^ Math.imul(top, 374761393));
  const c = stableTextRandom(Math.imul(left, 1640531513) ^ Math.imul(top + 1, 374761393));
  const d = stableTextRandom(Math.imul(left + 1, 1640531513) ^ Math.imul(top + 1, 374761393));
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function textAtmosphereSources(frame, image, clip, index, anchor) {
  const font = titleCanvasFont(clip);
  const fixed = !clip.textLoop && document.fonts.check(font, clip.text);
  const key = fixed ? JSON.stringify([image.width, image.height, index, anchor, clip.text, font,
    clip.textUnderline, clip.textStrike, clip.textColor, clip.textAppearance]) : null;
  const cached = textAtmosphereGeometry.get(clip);
  if (fixed && cached?.key === key) return cached.ink;
  const scale = Math.min(1, 320 / image.width, 224 / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const unit = Math.max(5, clip.size * scale);
  const ink = atmosphereSurface(frame, 'ink', width, height);
  ink.clearRect(0, 0, width, height);
  ink.drawImage(image, 0, 0, width, height);
  const { data } = ink.getImageData(0, 0, width, height);
  const cells = new Map();
  const cellWidth = Math.max(4, Math.round(unit * .72));
  const cellHeight = Math.max(4, Math.round(unit * .96));
  const stride = Math.ceil(width / cellWidth);
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 12) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      if (alpha < 80) continue;
      const cell = Math.floor(y / cellHeight) * stride + Math.floor(x / cellWidth);
      let source = cells.get(cell);
      if (!source) cells.set(cell, source = { cell, x: 0, y: 0, mass: 0 });
      source.x += x * alpha;
      source.y += y * alpha;
      source.mass += alpha;
    }
  }
  if (right < left) return null;
  let sources = [...cells.values()].filter(source => source.mass >= unit * 38)
    .map(({ cell, mass, x, y }) => ({ seed: cell, x: x / mass, y: y / mass }));
  if (!sources.length) sources = [{ seed: 0, x: (left + right) / 2, y: (top + bottom) / 2 }];
  const geometry = { width, height, unit, left, top, right, bottom, sources };
  if (fixed) textAtmosphereGeometry.set(clip, { key, ink: geometry });
  return geometry;
}

function drawSmokePlume(pixels, width, height, source, unit, phase, loose, spread, leaving) {
  const random = stableTextRandom(source.seed + 157);
  const wave = random * Math.PI * 2 + phase * 2.4;
  const rise = unit * spread * (.82 + loose * (1.46 + random * .69));
  const foot = source.y + unit * (.52 - (leaving ? loose * .56 : phase * .21));
  const airflow = (stableTextRandom(source.seed + 619) - .46) * unit * spread;
  const influence = unit * spread;
  for (let y = Math.max(0, Math.floor(foot - rise)); y <= Math.min(height - 1, Math.ceil(foot)); y++) {
    const lift = (foot - y) / rise;
    if (lift < 0 || lift > 1) continue;
    const swell = Math.sin(lift * Math.PI) ** .67;
    const center = source.x + airflow * lift * (1 + loose * 1.2) +
      influence * lift * (.49 * Math.sin(wave + lift * 7.8) + .18 * Math.sin(wave * .78 - lift * 13));
    const radius = influence * (.19 + swell * (.29 + lift * .28));
    for (let x = Math.max(0, Math.floor(center - radius)); x <= Math.min(width - 1, Math.ceil(center + radius)); x++) {
      const across = (x - center) / radius;
      if (Math.abs(across) >= 1) continue;
      const u = (x - source.x) / influence + random * 11;
      const v = lift * (2.2 + loose * 2.3) - phase * 2.5;
      const billow = smokeNoise(u * 3.9 + .7 * Math.sin(v * 4.2 + wave), v * 1.45);
      const detail = smokeNoise(u * 9.2 - v * .7, v * 3.2 + phase * .53);
      const shape = (1 - across ** 2) ** 1.5 * swell;
      const cloud = shape * smokeSmooth((billow * .72 + detail * .28 - .10) / .73) * .83;
      const i = y * width + x;
      pixels[i] += (1 - pixels[i]) * cloud;
    }
  }
}

function drawFlameTongue(pixels, width, height, source, unit, phase, loose, spread, leaving) {
  const random = stableTextRandom(source.seed + 769);
  const flicker = phase * 17 + random * Math.PI * 2;
  const length = unit * spread * (1.01 + loose * .95 + random * .68 + .24 * Math.sin(flicker));
  const foot = source.y + unit * (.50 - (leaving ? loose * .18 : 0));
  const sway = (stableTextRandom(source.seed + 93) - .46) * unit * spread;
  for (let y = Math.max(0, Math.floor(foot - length)); y <= Math.min(height - 1, Math.ceil(foot)); y++) {
    const rise = (foot - y) / length;
    if (rise < 0 || rise >= 1) continue;
    const center = source.x + (sway + unit * spread * .41 * Math.sin(rise * 6.8 - flicker)) * rise;
    const widthAtHeight = unit * spread * (.48 + .15 * Math.sin(rise * Math.PI)) * (1 - rise) ** .65;
    const stem = smokeSmooth(rise / .12) * (1 - rise * .67);
    for (let x = Math.max(0, Math.floor(center - widthAtHeight * 1.45)); x <= Math.min(width - 1, Math.ceil(center + widthAtHeight * 1.45)); x++) {
      const distance = Math.abs(x - center) / widthAtHeight;
      const grain = smokeNoise((x - source.x) / (unit * spread) * 4 + random * 6, rise * 7 + phase * 10);
      const edge = smokeSmooth((1 + grain * .23 - distance) / .56);
      const heat = stem * edge * (.65 + grain * .35) * (.82 + random * .18);
      const halo = stem * Math.max(0, 1 - distance / 1.45) * .13;
      const i = y * width + x;
      pixels[i] += (1 - pixels[i]) * Math.min(1, heat + halo);
    }
  }
}

function drawFlameEmbers(target, sources, x0, y0, unit, phase, envelope, intensity, tint) {
  target.save();
  target.fillStyle = tint ? mixTitleTint('#ffeadd', '#ffb743', tint) : '#ffeadd';
  for (const { x, y, seed } of sources) {
    const random = stableTextRandom(seed + 243);
    if (random < .42) continue;
    const age = (phase * (1.5 + random * .6) + random) % 1;
    target.globalAlpha = clamp(envelope * intensity * (1 - age) * .82, 0, 1);
    target.beginPath();
    target.arc(x - x0 + Math.sin(seed + age * 4) * unit * .73 * age,
      y - y0 - unit * (.32 + age * 2.35), Math.max(.65, unit * .034 * (1 - age * .5)), 0, Math.PI * 2);
    target.fill();
  }
  target.restore();
}

function drawTextAtmosphere(target, image, clip, style, index, anchor) {
  const progress = clamp(style.progress, 0, 1);
  if (progress >= .96) {
    target.drawImage(image, 0, 0);
    return;
  }
  if (progress <= 0) return;
  const frame = target.canvas;
  const flame = style.type === 'Flame';
  const density = presetRatio(style.options, flame ? 'flameIntensity' : 'smokeDensity');
  const showLetters = progress > .18;
  if (!density && !showLetters) return;
  const ink = textAtmosphereSources(frame, image, clip, index, anchor);
  if (!ink) return;
  const { width, height, unit, sources } = ink;
  const spread = Math.sqrt(presetRatio(style.options, 'glow'));
  const tint = presetRatio(style.options, 'tint');
  const phase = style.leaving ? 1 - progress : progress;
  const loose = 1 - progress;
  const x0 = Math.max(0, Math.floor(ink.left - unit * (spread * 1.7 + .3)));
  const y0 = Math.max(0, Math.floor(ink.top - unit * (spread * 2.6 + .3)));
  const x1 = Math.min(width, Math.ceil(ink.right + unit * (spread * 1.7 + .3) + 1));
  const y1 = Math.min(height, Math.ceil(ink.bottom + unit * .85 + 1));
  const w = x1 - x0;
  const h = y1 - y0;
  const vapor = atmosphereSurface(frame, 'air', w, h);
  const matte = showLetters ? atmosphereSurface(frame, 'matte', w, h) : null;
  const layers = textAtmosphereSurfaces.get(frame);
  if (layers.cloud?.length !== w * h) layers.cloud = new Float32Array(w * h);
  const cloud = layers.cloud;
  cloud.fill(0);
  const envelope = smokeSmooth(progress / (flame ? .16 : .13)) * (1 - smokeSmooth((progress - .53) / .43));
  if (density) {
    const plume = flame ? drawFlameTongue : drawSmokePlume;
    for (const source of sources) {
      plume(cloud, w, h, { ...source, x: source.x - x0, y: source.y - y0 }, unit, phase, loose, spread, style.leaving);
    }
  }
  const smoke = vapor.createImageData(w, h);
  const reveal = matte?.createImageData(w, h);
  const span = Math.max(unit, ink.right - ink.left);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = (x + x0 - ink.left) / unit;
      const v = (y + y0 - ink.top) / unit;
      if (reveal) {
        const grain = smokeNoise(u * 2.7, v * 3.3);
        const front = clamp((x + x0 - ink.left) / span, 0, 1);
        const delay = .18 + .28 * front + .25 * grain;
        reveal.data[i * 4 + 3] = 255 * smokeSmooth((progress - delay) / .24);
      }
      if (!cloud[i]) continue;
      if (flame) {
        const core = smokeSmooth((cloud[i] - .06) / .81);
        const neutral = 90 + core * 162;
        smoke.data[i * 4] = neutral + (255 - neutral) * tint;
        smoke.data[i * 4 + 1] = neutral + (23 + core * 226 - neutral) * tint;
        smoke.data[i * 4 + 2] = neutral + (10 + core ** 4.5 * 219 - neutral) * tint;
      } else {
        const light = smokeNoise(u * 4 - phase, v * 4 + phase * 2.1);
        const tone = 66 + 171 * clamp(light * .66 + Math.sqrt(cloud[i]) * .43, 0, 1);
        smoke.data[i * 4] = tone - tint * 10;
        smoke.data[i * 4 + 1] = tone + tint * 2;
        smoke.data[i * 4 + 2] = tone + tint * 21;
      }
      smoke.data[i * 4 + 3] = 255 * Math.min(.95, cloud[i] * envelope * density * (flame ? 1.55 : 1.35));
    }
  }
  const box = [x0 * frame.width / width, y0 * frame.height / height, w * frame.width / width, h * frame.height / height];
  if (density) {
    vapor.putImageData(smoke, 0, 0);
    if (flame) drawFlameEmbers(vapor, sources, x0, y0, unit, phase, envelope, density, tint);
    target.drawImage(vapor.canvas, ...box);
  }
  if (!reveal) return;
  matte.putImageData(reveal, 0, 0);
  const letters = cutoutLayer(frame);
  letters.drawImage(image, 0, 0);
  letters.save();
  letters.globalCompositeOperation = 'destination-in';
  letters.drawImage(matte.canvas, ...box);
  letters.restore();
  target.drawImage(letters.canvas, 0, 0);
}
