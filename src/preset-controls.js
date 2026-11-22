'use strict';

const percentControl = (label, min = 0, max = 250, initial = 100) => ({ label, min, max, initial, step: '.1' });
const presetControls = {
  speed: percentControl('Speed (%)', 0, 300),
  pulse: percentControl('Flash decay (%)', 25, 250),
  movement: percentControl('Motion amount (%)', 10, 175),
  shift: percentControl('Displacement (%)'),
  radius: percentControl('Blur radius (%)'),
  focus: percentControl('Focus area (%)', 25, 180),
  glow: percentControl('Glow size (%)', 10, 220),
  smokeDensity: percentControl('Smoke density (%)', 0, 200),
  flameIntensity: percentControl('Flame intensity (%)', 0, 200),
  hue: { label: 'Hue shift (°)', min: -180, max: 180, initial: 0, step: '1' },
  saturation: percentControl('Saturation (%)'),
  sepia: percentControl('Sepia tone (%)', 0, 100),
  grade: percentControl('Film grade (%)', 0, 100),
  grain: percentControl('Grain size (%)', 25, 300),
  pixel: percentControl('Block size (%)', 30, 300),
  pitch: percentControl('Line spacing (%)', 25, 400),
  density: percentControl('Density (%)', 0, 250),
  particle: percentControl('Particle size (%)', 10, 300),
  gap: percentControl('Divider width (%)', 0, 500),
  axis: percentControl('Mirror seam (%)', 15, 85, 50),
  border: percentControl('Border width (%)', 0, 225),
  corner: percentControl('Corner radius (%)', 0, 190),
  edge: percentControl('Edge threshold (%)', 10, 250),
  levels: percentControl('Color band size (%)', 25, 250),
  dot: percentControl('Dot size (%)', 10, 200),
  pace: percentControl('Pacing (%)', -100, 100, 0),
  stagger: percentControl('Character stagger (%)', 20, 100, 100),
  travel: percentControl('Travel distance (%)', 10, 175),
  zoom: percentControl('Zoom amount (%)', 10, 175),
  turn: percentControl('Rotation amount (%)', 0, 200),
  split: percentControl('Separation (%)', 0, 230),
  fold: percentControl('Fold depth (%)', 15, 200),
  curl: percentControl('Curl depth (%)', 35, 175),
  tint: percentControl('Tint mix (%)', 0, 100),
  blades: { label: 'Iris blades', min: 3, max: 16, initial: 8, step: '1' },
  monochrome: percentControl('Monochrome (%)', 0, 100), contrast: percentControl('Contrast (%)'),
  softBlur: { label: 'Blur radius (px)', min: 0, max: 40, initial: 4, step: '.1' }
};

function presetOptions(clip, slot, type) {
  return clip.presetOptions?.[slot]?.[type] ?? {};
}

function writePresetOptions(clip, slot, type, options) {
  const slots = clip.presetOptions;
  clip.presetOptions = { ...slots, [slot]: { ...slots?.[slot], [type]: options } };
}

function presetValue(options, name) {
  const { min, max, initial } = presetControls[name];
  const value = options?.[name];
  return Number.isFinite(value) ? clamp(value, min, max) : initial;
}

function presetRatio(options, name) {
  return presetValue(options, name) / 100;
}

function presetSliders(clip, slot, type, names, group, labelPrefix = '', onAdjust) {
  for (const name of names) {
    const { label, min, max, step } = presetControls[name];
    const caption = name === 'glow' ? ({ Smoke: 'Wisp size (%)', Flame: 'Flame height (%)' }[type] ?? label) : label;
    inspectorSliderField(labelPrefix + caption, presetValue(presetOptions(clip, slot, type), name), min, max, value => {
      writePresetOptions(clip, slot, type, { ...presetOptions(clip, slot, type), [name]: value });
      onAdjust?.();
    }, step, group);
  }
}

const weatherParticleEffects = ['Rain', 'Snow', 'Sparks', 'Embers', 'Cherry Blossoms'];
const screenGridEffects = ['2-Screen', '3-Screen', '4-Screen', '9-Grid'];
const animatedEffectFields = {
  'Camera Shake': ['movement'], 'Playful Pendulum': ['movement'], 'Rebound Swing': ['movement'],
  'Flash Vibration': ['movement'], 'Vibration Flash': ['movement'], 'Beat Zoom': ['movement'],
  'RGB Split': ['shift'], VHS: ['shift', 'pitch', 'density'], Pixelate: ['pixel'], Scanlines: ['pitch'],
  'TV Static': ['pixel'], 'Signal Loss': ['shift'], 'Chromatic Screen Tear': ['shift'],
  'Wave Distortion': ['shift'], Ripple: ['shift'], Liquid: ['shift'], 'Digital Artifacts': ['shift', 'density'],
  'Data Moshing': ['shift', 'density'], 'Cyberpunk Glitch': ['shift', 'density'],
  'Lens Flare': ['glow'], Bloom: ['radius'], 'Soft Glow': ['radius'], 'Chromatic Glow': ['radius', 'shift'],
  Bokeh: ['glow', 'density'], 'Neon Edge': ['edge', 'hue'],
  Vignette: ['focus'], 'Tilt Shift': ['radius'], 'Focus Pull': ['radius'], 'Smart Sharpen': ['edge'], 'Edge Glow': ['edge'],
  Fisheye: ['shift'], 'Wide Angle': ['shift'],
  'Film Grain': ['grain'], '1998': ['grain'], 'Super 8': ['grain', 'density'], 'Old Film': ['density'],
  'Kodak/Fuji Film Emulations': ['grain', 'grade'], 'Film Scratches': ['density'], 'Film Scratch': ['density'],
  Dust: ['density'], DV: ['shift'], 'Fault Cassette': ['shift'], 'Vintage TV': ['pitch'], Sepia: ['sepia'],
  'Color Negative': ['saturation'], 'Paper Texture': ['density'], 'CRT Grid': ['pitch'], Fog: ['density'], Smoke: ['density'],
  Cartoon: ['levels', 'edge'], 'Comic Book': ['levels', 'edge'], 'Pencil Sketch': ['edge'], 'Ink Outline': ['edge'],
  Watercolor: ['levels'], 'Oil Painting': ['levels'], Halftone: ['dot'], 'Pop Art': ['levels'], Posterize: ['levels'],
  [videoNeonOutline]: ['edge', 'hue'], Mirror: ['axis'], 'Echo/Ghosting': ['shift'],
  Letterbox: ['border'], 'Film Frame': ['border'], 'Polaroid Frame': ['border'], 'Neon Frame': ['border', 'hue'],
  'Rounded Corners': ['corner'], Cinematic: ['saturation'], Stylize: ['levels'], Nightclub: ['glow']
};
const staticVideoEffects = ['Color Negative', 'Sepia', 'Smart Sharpen', 'Vignette', 'Fisheye', 'Wide Angle', 'Lens Blur',
  'Gaussian Blur', 'Chrome Blur', 'Radial Blur', 'Zoom Blur', 'Oblique Blur', 'Pixelate', 'Bloom', 'Soft Glow',
  'Paper Texture', 'Cartoon', 'Comic Book', 'Pencil Sketch',
  'Ink Outline', 'Watercolor', 'Oil Painting', 'Posterize', 'Mirror', 'Letterbox', 'Polaroid Frame', 'Rounded Corners', 'Edge Glow',
  ...screenGridEffects];

function videoEffectControlNames(effect) {
  if (!animatedEffects.includes(effect) || subjectEffects.includes(effect)) return [];
  const names = [...(animatedEffectFields[effect] ?? [])];
  if (screenGridEffects.includes(effect)) names.push('gap');
  if (weatherParticleEffects.includes(effect)) names.push('density', 'particle');
  if (['Oblique Blur', 'Gaussian Blur', 'Motion Blur', 'Chrome Blur', 'Radial Blur', 'Zoom Blur', 'Lens Blur'].includes(effect)) names.push('radius');
  if (beatFlashEffects.includes(effect)) names.push('pulse');
  else if (!staticVideoEffects.includes(effect)) names.push('speed');
  return names;
}

const simpleVideoFields = { 'Black and white': ['monochrome'], 'High contrast': ['contrast'], 'Soft blur': ['softBlur'] };

function videoEffectSettings(clip, names = videoEffectControlNames(clip.effect)) {
  if (!names.length) return null;
  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.className = 'section';
  title.textContent = 'Effect adjustments';
  section.append(title);
  presetSliders(clip, 'effect', clip.effect, names, section, '', () => {
    if (!playback && !layerOnScreen(clip, previewFramePosition())) seek(clip.at);
  });
  return section;
}

function visualClipFilter(clip) {
  const options = presetOptions(clip, 'effect', clip.effect);
  if (clip.effect === 'Black and white') return 'grayscale(' + presetRatio(options, 'monochrome') + ')';
  if (clip.effect === 'High contrast') {
    const amount = presetRatio(options, 'contrast');
    return 'contrast(' + (1 + .35 * amount) + ') saturate(' + (1 + .18 * amount) + ')';
  }
  if (clip.effect === 'Soft blur') return 'blur(' + presetValue(options, 'softBlur') + 'px)';
  return effects[clip.effect] ?? 'none';
}

function animationControlNames(slot, type) {
  if (slot === 'textLoop') {
    if (textSpinLoops.includes(type)) return type === 'Spin' ? ['speed'] : ['speed', 'movement'];
    return textColorLoops.includes(type) || ['Flicker', 'Strobe', 'Glitch Loop'].includes(type) ? ['speed'] : ['speed', 'movement'];
  }
  if (slot === 'combo') {
    if (['Bisect', 'Split Horizontal', 'Split Vertical'].includes(type)) return ['pace', 'split'];
    if (type === 'Unfold') return ['pace', 'fold'];
    if (['Pan Left', 'Pan Right', 'Train'].includes(type)) return ['pace', 'travel'];
    if (['Zoom', 'Enlarge', '3D Zoom', '3D Zoom Pro'].includes(type)) return ['pace', 'zoom'];
    if (['Bounce', 'Pendulum', 'Wobble', 'Rock Vertically', 'Rock Horizontally'].includes(type)) return ['pace', 'movement'];
    if (rotationCombos.includes(type) && type !== 'Flip') return ['pace', 'turn'];
    return ['pace'];
  }
  if (slot === 'textIn' || slot === 'textOut') {
    if (textTypingPresets.includes(type)) return ['pace', 'stagger'];
    if (textKineticPresets.includes(type)) return ['pace', 'movement'];
    if (['Blur In', 'Blur Out'].includes(type)) return ['pace', 'radius'];
    if (type === 'Smoke') return ['pace', 'glow', 'smokeDensity', 'tint'];
    if (type === 'Flame') return ['pace', 'glow', 'flameIntensity', 'tint'];
    if (['Glow In', 'Ink Bleed', 'Flash', 'Neon Flicker'].includes(type)) return ['pace', 'glow', 'tint'];
    if (['Glitch In', 'Glitch Out', 'RGB Split'].includes(type)) return ['pace', 'shift'];
    if (type === 'Pixelate') return ['pace', 'pixel'];
    if (type === 'Scanlines') return ['pace', 'pitch'];
    if (type === 'Static') return ['pace', 'density'];
    if (['Slide Up', 'Slide Down', 'Slide Left', 'Slide Right'].includes(type)) return ['pace', 'travel'];
    return ['pace'];
  }
  if (type === 'Lens Open' || type === 'Lens Close') return ['pace', 'blades'];
  if (type === 'Fold In' || type === 'Fold Out') return ['pace', 'fold'];
  if (type === 'Page Curl' || type === 'Peel Off') return ['pace', 'curl'];
  if (type === 'Blur' || type === 'Focus') return ['pace', 'radius'];
  if (type === 'Pixelate Out') return ['pace', 'pixel'];
  if (['Glitch In', 'Glitch Out', 'RGB Split', 'Chromatic Aberration', 'Warp In', 'Warp Out', 'Shatter', 'Vertical Shake', 'Horizontal Shake'].includes(type)) return ['pace', 'shift'];
  if (type === 'Strobe' || type === 'Flicker') return ['pace', 'speed'];
  if (type === 'Mini-Zoom + Fade' || [...zoomAnimations, ...zoomExitAnimations].includes(type)) return ['pace', 'zoom'];
  if (type.startsWith('Slide ') || type.startsWith('Push ') || ['Drop Out', 'Fly Out'].includes(type)) return ['pace', 'travel'];
  if (['Rotate', 'Spin In', 'Spin Up', 'Swing In', 'Pendulum', 'Rotate Out', 'Spin Out', 'Spin Down', 'Swing Out', 'Fall Down'].includes(type)) {
    return ['pace', 'turn'];
  }
  return ['pace'];
}

function presetProgress(t, options, leaving = false) {
  const bias = presetValue(options, 'pace');
  const exponent = 2 ** (bias / 50);
  const easing = keyframeEasings[options?.easing];
  const elapsed = leaving ? 1 - t : t;
  const paced = bias ? elapsed ** exponent : elapsed;
  const progress = easing ? easing(paced) : paced;
  return leaving ? 1 - progress : progress;
}

function presetMotionAlpha(progress, options) {
  return keyframeEasings[options?.easing] ? progress : progress * progress * (3 - 2 * progress);
}
