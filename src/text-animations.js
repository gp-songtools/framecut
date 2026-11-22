'use strict';

const textTypingPresets = ['Typewriter', 'Typewriter Vintage', 'Word by Word', 'Letter by Letter',
  'Fade Character', 'Bounce Character', 'Wave In', 'Random Fade', 'Decoder/Matrix'];
const textKineticPresets = ['Pop Up', 'Spring', 'Bounce', 'Elastic', 'Drop In', 'Stamp', 'Smash', 'Thump', 'Jelly', 'Rubber Band'];
const textRevealPresets = ['Slide Up', 'Slide Down', 'Slide Left', 'Slide Right',
  'Mask Reveal', 'Line Reveal', 'Split Reveal', 'Curtain Open', 'Box Reveal'];
const textGlowPresets = ['Evaporate', 'Smoke', 'Ink Bleed', 'Flash', 'Neon Flicker', 'Flame'];
const textPerspectivePresets = ['Flip Up', 'Flip Down', '3D Rotate', 'Tumble', 'Swing Down', 'Hinged Drop'];
const textGlitchPresets = ['RGB Split', 'Pixelate', 'Scanlines', 'Static'];
const textPixelLayers = new WeakMap();
const textLoopPresets = ['Wave', 'Float', 'Hover', 'Breathe', 'Pulse', 'Heartbeat', 'Ripple'];
const textJitterLoops = ['Shake', 'Jitter', 'Tremble', 'Vibrate', 'Glitch Loop', 'Flicker', 'Strobe'];
const textSpinLoops = ['Spin', 'Swing', 'Pendulum', 'See Saw', 'Wobble', 'Rock', 'Orbit'];
const textWordColorLoops = ['Karaoke Fill', 'Word Highlight', 'Pop Highlight'];
const textColorLoops = ['Glow Pulse', 'Neon Pulse', 'Neon Glow', 'Shimmer', 'Light Sweep', 'Color Cycle',
  ...textWordColorLoops, 'Rainbow Cycle'];
const textSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const textLayouts = new WeakMap();
const bundledTitleFonts = [/* BUNDLED_TITLE_FONTS */];
const titleFonts = {
  System: 'system-ui, sans-serif',
  Arial: 'Arial, sans-serif',
  'Segoe UI': '"Segoe UI", sans-serif',
  Verdana: 'Verdana, sans-serif',
  'Trebuchet MS': '"Trebuchet MS", sans-serif',
  Georgia: 'Georgia, serif',
  'Times New Roman': '"Times New Roman", serif',
  'Courier New': '"Courier New", monospace',
  Impact: 'Impact, fantasy',
  Serif: 'serif',
  Monospace: 'monospace',
  ...Object.fromEntries(bundledTitleFonts.map(name => [name, JSON.stringify(name) + ', system-ui']))
};

function titleCanvasFont(clip) {
  const family = titleFonts[clip.fontFamily] ?? titleFonts.System;
  const style = clip.textItalic ? 'italic ' : '';
  const weight = clip.textBold === false ? 400 : 750;
  return style + weight + ' ' + clip.size + 'px ' + family;
}

async function loadTitleClipFont(clip) {
  if (bundledTitleFonts.includes(clip.fontFamily)) await document.fonts.load(titleCanvasFont(clip), clip.text);
}

const titleAppearanceDefaults = {
  outline: { enabled: false, color: '#000000', opacity: 100, thickness: 4 },
  shadow: { enabled: true, color: '#000000', opacity: 73, blur: 14 },
  background: { enabled: false, color: '#111827', opacity: 75 }
};

function titleAppearance(clip, effect) {
  return { ...titleAppearanceDefaults[effect], ...clip.textAppearance?.[effect] };
}

function paintTitleBackground(layer, clip, style, left, right, alpha = 1) {
  if (right <= left || !alpha) return;
  layer.save();
  layer.shadowColor = 'transparent';
  layer.globalAlpha *= style.opacity / 100 * alpha;
  layer.fillStyle = style.color;
  const padding = clip.size * .16;
  layer.fillRect(left - padding, -clip.size * .51, right - left + padding * 2, clip.size * 1.02);
  layer.restore();
}

function paintTitleText(layer, clip, outline, text, maxWidth, advance) {
  const args = maxWidth === undefined ? [text, 0, 0] : [text, 0, 0, maxWidth];
  if (outline.enabled && outline.opacity && outline.thickness) {
    layer.save();
    layer.globalAlpha *= outline.opacity / 100;
    layer.lineWidth = outline.thickness;
    layer.lineJoin = 'round';
    layer.strokeStyle = outline.color;
    layer.strokeText(...args);
    layer.restore();
  }
  layer.fillText(...args);
  if ((!clip.textUnderline && !clip.textStrike) || !text.trim()) return;
  const metrics = layer.measureText(text);
  const width = Math.min(maxWidth ?? Infinity, advance ?? metrics.width);
  const thickness = Math.max(1, clip.size * .055);
  const descent = metrics.fontBoundingBoxDescent ?? clip.size * .29;
  if (clip.textUnderline) layer.fillRect(-width / 2, descent * .85, width, thickness);
  if (clip.textStrike) layer.fillRect(-width / 2, -clip.size * .035, width, thickness);
}

function textLayout(clip) {
  const cached = textLayouts.get(clip);
  if (cached?.text === clip.text) return cached;
  let character = 0;
  let word = 0;
  const lines = clip.text.split('\n').map(line => {
    let wordIndex = -1;
    let inWord = false;
    return Array.from(textSegments.segment(line), ({ segment }) => {
      if (/^\s+$/u.test(segment)) {
        inWord = false;
        return { text: segment, space: true };
      }
      if (!inWord) {
        wordIndex = word++;
        inWord = true;
      }
      return { text: segment, index: character++, word: wordIndex, space: false };
    });
  });
  const layout = { text: clip.text, lines, characters: character, words: word };
  textLayouts.set(clip, layout);
  return layout;
}

function textEdgeDurations(clip) {
  const span = length(clip);
  const enter = clip.textIn ? Math.min(span, clip.textInDuration ?? defaultFadeDuration) : 0;
  const leave = clip.textOut ? Math.min(span, clip.textOutDuration ?? defaultFadeDuration) : 0;
  const scale = enter + leave > span ? span / (enter + leave) : 1;
  return { textIn: enter * scale, textOut: leave * scale };
}

function textStyleAt(clip, elapsed) {
  const spans = textEdgeDurations(clip);
  const remaining = length(clip) - elapsed;
  const leaving = elapsed >= spans.textIn && remaining < spans.textOut;
  if (!leaving && elapsed >= spans.textIn) return null;
  const slot = leaving ? 'textOut' : 'textIn';
  const type = clip[slot];
  const options = presetOptions(clip, slot, type);
  const progress = presetProgress(clamp((leaving ? remaining : elapsed) / spans[slot], 0, 1), options, leaving);
  return { type, progress, leaving, options };
}

function stableTextRandom(index) {
  let value = Math.imul(index + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967296;
}

function glyphAnimation(glyph, layout, animation, elapsed, size) {
  const state = { alpha: 1, y: 0, scale: 1, text: glyph.text, tint: '#fff' };
  if (!animation) return state;
  const { type, progress } = animation;
  const stagger = presetRatio(animation.options, 'stagger');
  const order = glyph.index / Math.max(1, layout.characters);
  const random = stableTextRandom(glyph.index);
  if (type === 'Evaporate') {
    const lift = 1 - progress;
    state.alpha = clamp(progress * (1.02 + random * .95), 0, 1);
    state.y = -size * lift * (.36 + random * .83);
    state.scale = 1 + lift * (.10 + random * .28);
    return state;
  }
  if (type === 'Word by Word') {
    state.alpha = Number(progress > stagger * glyph.word / Math.max(1, layout.words));
  } else if (type === 'Typewriter' || type === 'Typewriter Vintage') {
    const delay = type === 'Typewriter Vintage' ? order * .86 + random * .12 : order;
    state.alpha = Number(progress > delay * stagger);
  } else {
    const spread = (type === 'Letter by Letter' ? .82 : .60) * stagger;
    const start = (type === 'Random Fade' ? random : order) * spread;
    const duration = 1 - spread;
    const step = clamp((progress - start) / duration, 0, 1);
    state.alpha = step * step * (3 - 2 * step);
    if (type === 'Bounce Character') {
      state.y = -size * .8 * Math.abs(Math.cos(step * Math.PI * 2.4)) * (1 - step) ** 2;
      state.scale = 1 - .25 * Math.sin(Math.PI * step);
    } else if (type === 'Wave In') {
      state.y = size * .50 * Math.sin(step * Math.PI * 2 + glyph.index * .6) * (1 - step);
    } else if (type === 'Decoder/Matrix' && progress > 0 && step < 1) {
      const symbols = '01#%+-=/<>ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      state.text = symbols[(Math.floor(elapsed * 23) + glyph.index * 13) % symbols.length];
      state.alpha = clamp(progress * 4, 0, 1) * (.30 + step * .54);
      state.tint = '#8cf8bb';
    }
  }
  return state;
}

function applyTextSpinLoop(layer, type, elapsed, size, centerY, motion = 1) {
  const tau = Math.PI * 2;
  const centerX = layer.canvas.width / 2;
  let pivotY = centerY;
  let angle = 0;
  let x = 0;
  let y = 0;
  let scale = 1;
  if (type === 'Spin') {
    angle = elapsed * tau / 2.5;
    y = -size * .53 * Math.abs(Math.sin(angle));
  } else if (type === 'Swing') {
    pivotY -= size * .9;
    const phase = elapsed * tau / 1.65;
    angle = .27 * Math.sin(phase);
    y = size * .09 * (1 - Math.cos(2 * phase));
  } else if (type === 'Pendulum') {
    pivotY -= size * 2;
    const phase = elapsed * tau / 2.65;
    angle = .38 * Math.sin(phase);
  } else if (type === 'See Saw') {
    const phase = elapsed * tau / 1.75;
    angle = .20 * Math.sin(phase);
    y = -size * .16 * Math.cos(2 * phase);
  } else if (type === 'Wobble') {
    const phase = elapsed * tau / 1.35;
    angle = .085 * Math.sin(phase) + .045 * Math.sin(2 * phase);
    x = size * .30 * Math.sin(phase - .6);
    scale += .055 * Math.cos(2 * phase);
  } else if (type === 'Rock') {
    const phase = elapsed * tau / 1.9;
    angle = .13 * Math.sin(phase) ** 3;
    x = size * .23 * Math.sin(phase);
    y = size * .075 * Math.sin(phase + Math.PI / 2);
  } else {
    const phase = elapsed * tau / 2.35;
    x = size * .82 * Math.sin(phase);
    y = size * .47 * Math.cos(phase);
    angle = .07 * Math.cos(phase);
    scale += .09 * Math.sin(phase);
  }
  layer.translate(centerX + x * motion, pivotY + y * motion);
  layer.rotate(angle * motion);
  const zoom = 1 + (scale - 1) * motion;
  layer.scale(zoom, zoom);
  layer.translate(-centerX, -pivotY);
}

function applyTextLoop(layer, type, elapsed, size, motion = 1) {
  let scale = 1;
  let offset = 0;
  let x = 0;
  let angle = 0;
  if (type === 'Shake') {
    x = size * (.19 * Math.sin(elapsed * 28) + .075 * Math.sin(elapsed * 49));
    offset = size * .07 * Math.cos(elapsed * 39);
    angle = .032 * Math.sin(elapsed * 28);
  } else if (type === 'Jitter') {
    const frame = Math.floor(elapsed * 15);
    x = size * .33 * (stableTextRandom(frame * 2) - .5);
    offset = size * .22 * (stableTextRandom(frame * 2 + 1) - .5);
  } else if (type === 'Tremble') {
    angle = .022 * Math.sin(elapsed * 58);
    offset = size * .042 * Math.sin(elapsed * 67);
    scale += .021 * Math.cos(elapsed * 49);
  } else if (type === 'Vibrate') {
    x = size * .061 * Math.sin(elapsed * 76);
  } else if (type === 'Flicker') {
    const pulse = .5 + .5 * Math.sin(elapsed * 14.5 + .65 * Math.cos(elapsed * 3));
    layer.globalAlpha *= 1 - .48 * pulse ** 3;
  } else if (type === 'Strobe') {
    const phase = (elapsed * 2.65) % 1;
    layer.globalAlpha *= phase < .28 ? .38 : 1;
  } else if (type === 'Float') offset = -size * (.16 + .15 * Math.sin(elapsed * 2.7));
  else if (type === 'Hover') offset = size * (.075 * Math.sin(elapsed * 5) + .045 * Math.sin(elapsed * 10));
  else if (type === 'Breathe') scale += .067 * Math.sin(elapsed * 2.3);
  else if (type === 'Pulse') scale += .16 * Math.max(0, Math.sin(elapsed * 5.3)) ** 2;
  else if (type === 'Heartbeat') {
    const beat = (elapsed % 1) * 10;
    scale += .21 * Math.exp(-((beat - 1.3) ** 2) / .22) + .12 * Math.exp(-((beat - 3.15) ** 2) / .35);
  }
  layer.translate(x * motion, offset * motion);
  if (angle) layer.rotate(angle * motion);
  const zoom = 1 + (scale - 1) * motion;
  layer.scale(zoom, zoom);
}

function applyKineticText(layer, { type, progress, leaving, options }, size, pivotY) {
  const t = clamp(progress, 0, 1);
  const remaining = 1 - t;
  const smooth = presetMotionAlpha(t, options);
  let sx = 1;
  let sy = 1;
  let y = 0;
  let angle = 0;
  if (type === 'Pop Up') {
    const back = t - 1;
    sx = sy = 1 + 1.89 * back ** 3 + 1.08 * back ** 2;
    y = size * .75 * (1 - smooth);
  } else if (type === 'Spring') {
    const spring = (1 - t) ** 2 * Math.cos(t * Math.PI * 4.2);
    sx = .8 + .2 * smooth;
    sy = 1 - .64 * spring;
    y = size * .65 * spring;
  } else if (type === 'Bounce') {
    const bounce = Math.abs(Math.cos(t * Math.PI * 2.75)) * remaining ** 2;
    y = -size * 1.65 * bounce;
    sx = 1 + .15 * Math.sin(t * Math.PI * 2.75) ** 2 * remaining;
    sy = 1 / sx;
  } else if (type === 'Elastic') {
    const spring = Math.cos(t * Math.PI * 5.25) * remaining ** 2.3;
    sx = 1 - .54 * spring;
    sy = 1 - .82 * spring;
  } else if (type === 'Drop In') {
    const drop = remaining ** 2.6 + .09 * Math.sin(t * Math.PI * 4) * remaining;
    y = drop * (leaving ? 1 : -1) * layer.canvas.height * .24;
  } else if (type === 'Stamp') {
    const strike = remaining ** 3;
    sx = sy = 1 + .92 * strike;
    angle = -.14 * strike;
  } else if (type === 'Smash') {
    const strike = remaining ** 2.5;
    sx = 1 + 1.05 * strike;
    sy = 1 + 1.5 * strike;
    angle = .26 * strike - .10 * Math.sin(t * Math.PI * 7) * remaining;
    y = -size * .70 * strike;
  } else if (type === 'Thump') {
    const impact = Math.sin(Math.PI * clamp(t / .68, 0, 1)) * remaining;
    sx = 1 + .25 * impact;
    sy = 1 - .54 * impact + .16 * remaining ** 2;
    y = size * .22 * impact;
  } else if (type === 'Jelly') {
    const jiggle = Math.cos(t * Math.PI * 5) * remaining ** 1.5;
    sx = 1 + .24 * jiggle;
    sy = 1 - .33 * jiggle;
    angle = Math.sin(t * Math.PI * 5) * remaining * .11;
  } else {
    const snap = Math.cos(t * Math.PI * 4.5) * remaining ** 1.7;
    sx = 1 + .75 * snap;
    sy = Math.max(.28, 1 - .52 * snap);
  }
  layer.globalAlpha *= clamp(t * (type === 'Stamp' || type === 'Smash' ? 6 : 4), 0, 1);
  const motion = presetRatio(options, 'movement');
  layer.translate(layer.canvas.width / 2, pivotY + y * motion);
  layer.rotate(angle * motion);
  layer.scale(Math.max(.01, 1 + (sx - 1) * motion), Math.max(.01, 1 + (sy - 1) * motion));
  layer.translate(-layer.canvas.width / 2, -pivotY);
}

function textRevealStyle(type) {
  return type === 'Wipe In' || type === 'Wipe Out' || textRevealPresets.includes(type);
}

function applyTextReveal(layer, style, width, height, centerY) {
  const { type, leaving } = style;
  const t = clamp(style.progress, 0, 1);
  const p = presetMotionAlpha(t, style.options);
  const cx = layer.canvas.width / 2;
  if (type.startsWith('Slide ')) {
    const [x, y] = motionDirections[type.slice(6)];
    const distance = (leaving ? 1 : -1) * (1 - p) * presetRatio(style.options, 'travel');
    layer.translate(x * layer.canvas.width * distance, y * layer.canvas.height * distance);
    return;
  }
  if (type === 'Line Reveal') return;

  const left = cx - width / 2;
  const top = centerY - height / 2;
  layer.beginPath();
  if (type === 'Wipe In' || type === 'Wipe Out') {
    layer.rect(left + (type === 'Wipe Out' ? width * (1 - p) : 0), top, width * p, height);
  } else if (type === 'Mask Reveal') {
    layer.ellipse(cx, centerY, width * p * .75, height * p * .75, 0, 0, Math.PI * 2);
  } else if (type === 'Split Reveal') {
    layer.rect(left, top, width * p, height / 2);
    layer.rect(left + width * (1 - p), centerY, width * p, height / 2);
  } else if (type === 'Curtain Open') {
    layer.rect(cx - width * p / 2, top, width * p, height);
  } else {
    layer.rect(cx - width * p / 2, centerY - height * p / 2, width * p, height * p);
  }
  layer.clip();
}

function textGlowStyle(type) {
  return type === 'Blur In' || type === 'Blur Out' || type === 'Glow In' || textGlowPresets.includes(type);
}

function mixTitleTint(base, tint, weight) {
  return weight > 0 ? 'color-mix(in srgb, ' + base + ' ' + (100 * (1 - weight)) + '%, ' + tint + ')' : base;
}

function addTitleGlow(layer, style, color, tint, blur, weight) {
  const mix = weight * presetRatio(style.options, 'tint');
  layer.shadowColor = mixTitleTint(layer.shadowColor, color, mix);
  layer.fillStyle = mixTitleTint(layer.fillStyle, tint, mix);
  layer.shadowBlur += blur * presetRatio(style.options, 'glow');
}

function applyTextGlow(layer, style, elapsed, size) {
  const t = clamp(style.progress, 0, 1);
  const opacity = presetMotionAlpha(t, style.options);
  const amount = 1 - opacity;
  const type = style.type;
  layer.globalAlpha *= opacity;
  if (type === 'Blur In' || type === 'Blur Out') {
    layer.filter = 'blur(' + size * amount * .35 * presetRatio(style.options, 'radius') + 'px)';
  } else if (type === 'Glow In') {
    addTitleGlow(layer, style, '#73eaff', '#74edff', size * amount * .75, amount);
  } else if (type === 'Evaporate') {
    layer.filter = 'blur(' + size * amount * .105 + 'px)';
  } else if (type === 'Ink Bleed') {
    addTitleGlow(layer, style, '#542899', '#6731a2', size * amount * .13, amount);
  } else if (type === 'Flash') {
    const burst = Math.exp(-((t - .28) ** 2) / .012);
    layer.globalAlpha *= clamp(.78 + .42 * burst + .22 * t, 0, 1);
    addTitleGlow(layer, style, '#fff2aa', '#fff2b9', size * burst * .82, burst);
  } else if (type === 'Neon Flicker') {
    const flicker = (.5 + .5 * Math.cos(elapsed * 15 + Math.sin(elapsed * 4))) ** 3;
    layer.globalAlpha *= 1 - .6 * flicker * amount;
    addTitleGlow(layer, style, '#fa53ff', '#f85cf8', size * amount * (.24 + .38 * (1 - flicker)), amount);
  }
}

function drawTextGlowEchoes(layer, text, style, size, maxWidth) {
  if (style.type !== 'Ink Bleed') return;
  const amount = 1 - style.progress;
  const glow = presetRatio(style.options, 'glow');
  const tint = presetRatio(style.options, 'tint');
  const color = layer.fillStyle;
  layer.save();
  layer.globalAlpha *= amount * .72;
  layer.lineJoin = 'round';
  layer.lineWidth = size * amount * .18 * glow;
  layer.strokeStyle = typeof color === 'string' ? mixTitleTint(color, '#591b87', tint) : color;
  layer.filter = 'blur(' + size * amount * .06 * glow + 'px)';
  layer.strokeText(text, 0, 0, maxWidth);
  layer.restore();
}

function drawPerspectiveText(layer, image, style, centerY, size) {
  const { width: w, height: h } = image;
  const t = clamp(style.progress, 0, 1);
  const alpha = presetMotionAlpha(t, style.options);
  const remaining = 1 - alpha;
  const { type, leaving } = style;
  layer.save();
  layer.globalAlpha *= clamp(t * 3.5, 0, 1);
  if (type === 'Flip Up' || type === 'Flip Down' || type === '3D Rotate') {
    const vertical = type !== '3D Rotate';
    const axis = vertical ? h : w;
    const pivot = vertical ? centerY : w / 2;
    const sign = type === 'Flip Up' ? -1 : 1;
    const angle = remaining * sign * (vertical ? Math.PI / 2 : 1.34) * (leaving ? -1 : 1);
    const camera = axis * 1.3;
    const project = u => {
      const delta = u * axis - pivot;
      const scale = camera / (camera + delta * Math.sin(angle));
      return { position: pivot + delta * Math.cos(angle) * scale, scale,
        offset: vertical ? 0 : size * .73 * remaining * (u - .5) };
    };
    layer.filter = 'brightness(' + (.66 + .34 * alpha) + ')';
    drawProjectedStrips(layer, image, project, vertical);
  } else {
    let x = w / 2;
    let pivotY = centerY;
    let drop = 0;
    let angle;
    let scale = 1;
    if (type === 'Tumble') {
      angle = (leaving ? 1 : -1) * remaining * Math.PI * 1.75;
      drop = (leaving ? 1 : -1) * remaining * h * .27;
      scale = .55 + .45 * alpha;
    } else if (type === 'Swing Down') {
      pivotY = centerY - size * 1.6;
      angle = remaining ** 1.22 * Math.cos(t * Math.PI * 3.4) * (leaving ? .98 : -.98);
    } else {
      x = w * .30;
      pivotY = centerY - size * .5;
      drop = (leaving ? 1 : -1) * (1 - t ** .62) * h * .27;
      angle = (leaving ? 1 : -1) * (1 - t) ** 1.5 * 1.23;
    }
    layer.translate(x, pivotY + drop);
    layer.rotate(angle);
    layer.scale(scale, scale);
    layer.drawImage(image, -x, -pivotY);
  }
  layer.restore();
}

function textGlitchStyle(type) {
  return type === 'Glitch In' || type === 'Glitch Out' || textGlitchPresets.includes(type);
}

function drawTextGlitch(target, image, style, elapsed) {
  const { width: w, height: h } = image;
  const t = clamp(style.progress, 0, 1);
  const amount = 1 - t;
  const frame = Math.floor(elapsed * 16);
  const { type } = style;
  const displacement = presetRatio(style.options, 'shift');
  target.save();
  const opacity = clamp(t * 2.5, 0, 1);
  target.globalAlpha *= opacity;

  if (type === 'RGB Split') {
    drawColorSeparation(target, image, amount, false, displacement);
  } else if (type === 'Pixelate') {
    let pixels = textPixelLayers.get(target.canvas);
    if (!pixels) {
      pixels = document.createElement('canvas').getContext('2d');
      textPixelLayers.set(target.canvas, pixels);
    }
    const scale = 1 - .945 * (1 - t ** 2.8);
    const pixelScale = 1 / (1 + (1 / scale - 1) * presetRatio(style.options, 'pixel'));
    const width = Math.max(1, Math.round(w * pixelScale));
    const height = Math.max(1, Math.round(h * pixelScale));
    if (pixels.canvas.width !== width || pixels.canvas.height !== height) {
      pixels.canvas.width = width;
      pixels.canvas.height = height;
    }
    pixels.clearRect(0, 0, width, height);
    pixels.drawImage(image, 0, 0, width, height);
    const blend = clamp(amount / .12, 0, 1);
    const weight = blend * blend * (3 - 2 * blend);
    if (weight === 1) {
      target.imageSmoothingEnabled = false;
      target.drawImage(pixels.canvas, 0, 0, w, h);
    } else {
      const mix = cutoutLayer(target.canvas);
      mix.save();
      mix.globalAlpha = 1 - weight;
      mix.drawImage(image, 0, 0);
      mix.globalCompositeOperation = 'lighter';
      mix.globalAlpha = weight;
      mix.imageSmoothingEnabled = false;
      mix.drawImage(pixels.canvas, 0, 0, w, h);
      mix.restore();
      target.drawImage(mix.canvas, 0, 0);
    }
  } else if (type === 'Static') {
    const noise = cutoutLayer(target.canvas);
    noise.drawImage(image, 0, 0);
    noise.save();
    noise.globalCompositeOperation = 'source-atop';
    noise.globalAlpha = .72 * amount;
    const block = Math.max(1, Math.round(w / 170));
    const dots = Math.round(1950 * presetRatio(style.options, 'density'));
    for (let i = 0; i < dots; i++) {
      const seed = i * 3 + frame * 1951;
      const x = Math.floor(w * stableTextRandom(seed));
      const y = Math.floor(h * stableTextRandom(seed + 1));
      noise.fillStyle = stableTextRandom(seed + 2) < .53 ? '#101520' : '#e1ffff';
      noise.fillRect(x, y, block * (1 + i % 5), block * (1 + i % 2));
    }
    noise.restore();
    target.drawImage(noise.canvas, 0, 0);
  } else {
    const scans = type === 'Scanlines';
    const rows = Math.max(1, Math.floor(h / (scans ? 120 : 42) * presetRatio(style.options, 'pitch')));
    for (let y = 0, i = 0; y < h; y += rows, i++) {
      const count = Math.min(rows, h - y);
      const dim = scans ? (i + frame) % 3 === 0 : (i + frame) % 7 === 0;
      const random = stableTextRandom(i + frame * 117);
      const direction = type === 'Glitch Out' ? -1 : 1;
      const offset = scans ? 0 : direction * w * amount * displacement * (.10 * (random - .38) + (dim ? .065 : 0));
      target.globalAlpha = opacity * (1 - (scans ? .73 : .58) * amount * Number(dim));
      target.drawImage(image, 0, y, w, count, Math.round(offset), y, w, count);
    }
  }
  target.restore();
}

function applyTextColorLoop(layer, type, elapsed, size, span) {
  const pulse = .5 + .5 * Math.sin(elapsed * 4.2);
  if (type === 'Glow Pulse') {
    layer.fillStyle = '#fff1da';
    layer.shadowColor = '#ffb65c';
    layer.shadowBlur = size * (.09 + .64 * pulse ** 2);
  } else if (type === 'Neon Pulse') {
    const beat = pulse ** 3;
    layer.fillStyle = 'hsl(300,100%,' + (67 + 26 * beat) + '%)';
    layer.shadowColor = '#ff34de';
    layer.shadowBlur = size * (.18 + .61 * beat);
  } else if (type === 'Neon Glow' || type === 'Color Cycle') {
    const neon = type === 'Neon Glow';
    const hue = elapsed * (neon ? 44 : 130) + (neon ? 166 : 32);
    layer.fillStyle = 'hsl(' + hue + ',96%,' + (neon ? 80 : 67) + '%)';
    if (neon) {
      layer.shadowColor = 'hsl(' + (hue + 36) + ',100%,54%)';
      layer.shadowBlur = size * .57;
    }
  } else if (type === 'Shimmer' || type === 'Light Sweep') {
    const shimmer = type === 'Shimmer';
    const halfBand = shimmer ? .115 : .26;
    const center = ((elapsed * (shimmer ? .65 : .47)) % 1) * 1.5 - .25;
    const gradient = layer.createLinearGradient(-span / 2, shimmer ? 0 : -size * .30, span / 2, shimmer ? 0 : size * .30);
    gradient.addColorStop(0, shimmer ? '#819ab5' : '#93acc1');
    gradient.addColorStop(clamp(center - halfBand, 0, 1), shimmer ? '#819ab5' : '#93acc1');
    gradient.addColorStop(clamp(center, 0, 1), shimmer ? '#ffffff' : '#ffe2a0');
    gradient.addColorStop(clamp(center + halfBand, 0, 1), shimmer ? '#819ab5' : '#93acc1');
    gradient.addColorStop(1, shimmer ? '#819ab5' : '#93acc1');
    layer.fillStyle = gradient;
  } else if (type === 'Rainbow Cycle') {
    const gradient = layer.createLinearGradient(-span / 2, 0, span / 2, 0);
    for (let i = 0; i <= 7; i++) gradient.addColorStop(i / 7, 'hsl(' + (elapsed * 105 + i * 52) + ',92%,68%)');
    layer.fillStyle = gradient;
  }
}

function applyTextWordColor(layer, loop, elapsed, glyph, layout, advance, fit) {
  if (loop === 'Karaoke Fill') {
    const duration = clamp(layout.characters * .14, 1.45, 5);
    const progress = (elapsed % duration) / duration * layout.characters;
    const filled = clamp(progress - glyph.index, 0, 1);
    if (!filled || filled >= 1) layer.fillStyle = filled ? '#ffe36c' : '#c1ccd9';
    else {
      const half = Math.max(.5, advance / (2 * fit));
      const gradient = layer.createLinearGradient(-half, 0, half, 0);
      gradient.addColorStop(0, '#ffe36c');
      gradient.addColorStop(filled, '#ffe36c');
      gradient.addColorStop(filled, '#c1ccd9');
      gradient.addColorStop(1, '#c1ccd9');
      layer.fillStyle = gradient;
    }
    return;
  }
  const pop = loop === 'Pop Highlight';
  const phase = elapsed / (pop ? .52 : .62);
  const current = Math.floor(phase) % Math.max(1, layout.words);
  const highlighted = glyph.word === current;
  layer.fillStyle = highlighted ? (pop ? '#a9ff9b' : '#70dcff') : '#c1ccd9';
  if (highlighted) {
    layer.shadowColor = pop ? '#51d67d' : '#408bf2';
    layer.shadowBlur = pop ? 15 : 11;
    if (pop) {
      const scale = 1 + .26 * Math.sin(Math.PI * (phase % 1)) ** .65;
      layer.scale(scale, scale);
    }
  }
}

function drawTextContent(layer, clip, elapsed, index, anchor = .78, plainRaster = false, skipGlitchLoop = false) {
  const loop = clip.textLoop;
  const loopOptions = presetOptions(clip, 'textLoop', loop);
  const loopElapsed = elapsed * presetRatio(loopOptions, 'speed');
  const loopMotion = presetRatio(loopOptions, 'movement');
  if (clip.textLoop === 'Glitch Loop' && !skipGlitchLoop) {
    const raster = animatedLayer(layer.canvas);
    drawTextContent(raster, clip, elapsed, index, anchor, plainRaster, true);
    const pulse = Math.sin(Math.PI * ((loopElapsed * 1.65) % 1)) ** 4;
    drawTextGlitch(layer, raster.canvas, { type: 'Glitch In', progress: .92 - .56 * pulse }, loopElapsed);
    return;
  }
  const { width, height } = layer.canvas;
  const layout = textLayout(clip);
  const style = textStyleAt(clip, elapsed);
  const atmosphere = style?.type === 'Smoke' || style?.type === 'Flame';
  const kinetic = style && textKineticPresets.includes(style.type);
  const reveal = style && textRevealStyle(style.type);
  const glow = style && !atmosphere && textGlowStyle(style.type);
  const perspective = style && textPerspectivePresets.includes(style.type);
  const glitch = style && textGlitchStyle(style.type);
  const animation = atmosphere || kinetic || reveal || perspective || glitch || (glow && style.type !== 'Evaporate') ? null : style;
  const wordColor = textWordColorLoops.includes(loop);
  const characterLoop = loop === 'Wave' || loop === 'Ripple' || wordColor;
  const size = clip.size;
  const centerY = height * anchor + index * size * 1.12;
  if ((atmosphere || perspective || glitch) && !plainRaster) {
    const raster = animatedLayer(layer.canvas);
    drawTextContent(raster, clip, elapsed, index, anchor, true, skipGlitchLoop);
    if (atmosphere) drawTextAtmosphere(layer, raster.canvas, clip, style, index, anchor);
    else if (glitch) drawTextGlitch(layer, raster.canvas, style, elapsed);
    else drawPerspectiveText(layer, raster.canvas, style, centerY, size);
    return;
  }
  layer.save();
  layer.font = titleCanvasFont(clip);
  layer.textAlign = 'center';
  layer.textBaseline = 'middle';
  const outline = titleAppearance(clip, 'outline');
  const shadow = titleAppearance(clip, 'shadow');
  const background = titleAppearance(clip, 'background');
  const hasBackground = background.enabled && background.opacity > 0;
  const shadowAlpha = Math.round(shadow.opacity * 2.55).toString(16).padStart(2, '0');
  layer.shadowColor = clip.textAppearance?.shadow ? (shadow.enabled ? shadow.color + shadowAlpha : 'transparent') : '#000b';
  layer.shadowBlur = shadow.enabled ? shadow.blur : 0;
  layer.shadowOffsetY = shadow.enabled && clip.textAppearance?.shadow ? size * .065 : 0;
  layer.fillStyle = clip.textColor ?? '#ffffff';
  if (kinetic) applyKineticText(layer, style, size, centerY);
  if (textSpinLoops.includes(loop)) applyTextSpinLoop(layer, loop, loopElapsed, size, centerY, loopMotion);
  if (glow) applyTextGlow(layer, style, elapsed, size);
  let revealWidth;
  if (reveal) {
    const widths = layout.lines.map(glyphs => layer.measureText(glyphs.map(glyph => glyph.text).join('')).width);
    revealWidth = Math.min(width * .88, Math.max(0, ...widths)) + size * .58;
    applyTextReveal(layer, style, revealWidth, layout.lines.length * size * 1.12 + size * .36, centerY);
  }
  for (const [row, glyphs] of layout.lines.entries()) {
    layer.save();
    layer.translate(width / 2, centerY + (row - (layout.lines.length - 1) / 2) * size * 1.12);
    if (reveal && style.type === 'Line Reveal') {
      const order = style.leaving ? layout.lines.length - 1 - row : row;
      const delay = layout.lines.length > 1 ? .52 * order / (layout.lines.length - 1) : 0;
      const extent = clamp((style.progress - delay) / (layout.lines.length > 1 ? .48 : 1), 0, 1);
      const lineHeight = size * 1.12;
      layer.beginPath();
      layer.rect(-revealWidth / 2, -lineHeight / 2, revealWidth, lineHeight * extent);
      layer.clip();
    }
    if (loop) applyTextLoop(layer, loop, loopElapsed, size, loopMotion);
    const lineText = glyphs.map(glyph => glyph.text).join('');
    if (textColorLoops.includes(loop) && !wordColor) {
      applyTextColorLoop(layer, loop, loopElapsed, size, Math.max(1, Math.min(width * .88, layer.measureText(lineText).width)));
    }
    if (!animation && !characterLoop) {
      if (hasBackground && lineText.trim()) {
        const half = Math.min(width * .88, layer.measureText(lineText).width) / 2;
        paintTitleBackground(layer, clip, background, -half, half);
      }
      if (glow) drawTextGlowEchoes(layer, lineText, style, size, width * .88);
      paintTitleText(layer, clip, outline, lineText, width * .88);
      layer.restore();
      continue;
    }

    const advances = glyphs.map(glyph => layer.measureText(glyph.text).width);
    const total = advances.reduce((sum, width) => sum + width, 0);
    const fit = Math.min(1, width * .88 / (total || 1));
    let x = -total * fit / 2;
    let caret = x;
    const states = glyphs.map(glyph => glyph.space ? null : glyphAnimation(glyph, layout, animation, elapsed, size));
    if (hasBackground) {
      let cursor = x;
      let first = Infinity;
      let last = -Infinity;
      let alpha = 0;
      for (const [i, state] of states.entries()) {
        const advance = advances[i] * fit;
        if (state?.alpha > 0) {
          first = Math.min(first, cursor);
          last = cursor + advance;
          alpha = Math.max(alpha, state.alpha);
        }
        cursor += advance;
      }
      paintTitleBackground(layer, clip, background, first, last, alpha);
    }
    if (glow) drawTextGlowEchoes(layer, lineText, style, size, width * .88);
    for (const [i, state] of states.entries()) {
      const glyph = glyphs[i];
      const advance = advances[i] * fit;
      if (state) {
        if (state.alpha > 0) {
          if (loop === 'Wave') {
            state.y += Math.sin(loopElapsed * 5 - glyph.index * .44) * size * .24 * loopMotion;
          } else if (loop === 'Ripple') {
            const distance = Math.abs(glyph.index - (layout.characters - 1) / 2);
            const wave = Math.sin(loopElapsed * 6 - distance * .63) * loopMotion;
            state.y += wave * size * .15;
            state.scale *= 1 + .10 * wave;
          }
          layer.save();
          layer.globalAlpha *= state.alpha;
          if (state.tint !== '#fff') layer.fillStyle = state.tint;
          layer.translate(x + advance / 2, state.y);
          layer.scale(state.scale * fit, state.scale);
          if (wordColor) applyTextWordColor(layer, loop, loopElapsed, glyph, layout, advance, fit);
          paintTitleText(layer, clip, outline, state.text, undefined, advances[i]);
          layer.restore();
          caret = x + advance;
        }
      }
      x += advance;
    }
    if (animation?.type === 'Typewriter Vintage' && animation.progress > 0 && Math.floor(elapsed * 5) % 2 === 0) {
      layer.globalAlpha *= clamp((1 - animation.progress) / .12, 0, 1);
      layer.fillStyle = '#fff0c2';
      layer.fillRect(caret + size * .10, -size * .33, size * .06, size * .65);
    }
    layer.restore();
  }
  layer.restore();
}
