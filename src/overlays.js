'use strict';

const stickerPresets = {
  Star: '⭐', Heart: '❤️', Fire: '🔥', 'Thumbs Up': '👍', 'Speech Bubble': '💬', Rainbow: '🌈'
};
const overlayAnimationPresets = ['Sparkles', 'Confetti', 'Floating Hearts'];
const overlayMotions = ['Float', 'Pulse', 'Spin'];
const overlayDragType = 'application/x-framecut-overlay';
const overlayFields = [
  ['Horizontal position (%)', 'overlayX', 0, 100], ['Vertical position (%)', 'overlayY', 0, 100],
  ['Size (%)', 'overlaySize', 1, 250], ['Rotation (°)', 'overlayRotation', -360, 360],
  ['Opacity (%)', 'overlayOpacity', 0, 100]
];
const overlayKeyTolerance = .0011;

function hasLayerTransform(clip) {
  return clip?.track === 'overlay' || clip?.track === 'title' || clip?.track === 'visual';
}

function titleTransformDefaults(clip, at) {
  const position = clip.at + at - clip.start;
  const titles = clips.filter(item => item.track === 'title' && layerOnScreen(item, position));
  const index = Math.max(0, titles.indexOf(clip));
  return {
    overlayX: 50, overlayY: 78 + index * clip.size * 112 / canvas.height,
    overlaySize: 100, overlayRotation: 0, overlayOpacity: 100
  };
}

function overlayKeyAt(clip, at) {
  let nearest;
  let distance = overlayKeyTolerance;
  for (const key of clip.overlayKeys ?? []) {
    const offset = Math.abs(key.at - at);
    if (offset <= distance) {
      nearest = key;
      distance = offset;
    }
  }
  return nearest;
}

function overlayTransformAt(clip, at) {
  const keys = clip.overlayKeys;
  if (!keys?.length) {
    const defaults = clip.track === 'title' && clip.overlayY === undefined ? titleTransformDefaults(clip, at)
      : { overlayX: 50, overlayY: 50, overlaySize: 100, overlayRotation: 0, overlayOpacity: 100 };
    return Object.fromEntries(overlayFields.map(([, key]) => [key, clip[key] ?? defaults?.[key]]));
  }
  const exact = overlayKeyAt(clip, at);
  if (exact) return exact.transform;
  const next = keys.findIndex(key => key.at > at);
  if (next === -1) return keys.at(-1).transform;
  if (next === 0) return keys[0].transform;
  const before = keys[next - 1];
  const after = keys[next];
  const progress = (at - before.at) / (after.at - before.at);
  const fraction = easingProgress(before, progress);
  return Object.fromEntries(overlayFields.map(([, key]) => [
    key, before.transform[key] + fraction * (after.transform[key] - before.transform[key])
  ]));
}

function writeOverlayTransform(clip, at, transform, keyframed) {
  if (!keyframed) {
    Object.assign(clip, transform);
    return;
  }
  const key = overlayKeyAt(clip, at);
  clip.overlayKeys = [
    ...(clip.overlayKeys ?? []).filter(item => item !== key), { ...key, at: key?.at ?? at, transform }
  ].sort((a, b) => a.at - b.at);
}

function drawOverlayParticles(target, preset, elapsed, options) {
  const confetti = preset === 'Confetti';
  const count = Math.round(18 * presetRatio(options, 'density'));
  const size = presetRatio(options, 'particle');
  elapsed *= presetRatio(options, 'speed');
  for (let index = 0; index < count; index++) {
    const phase = (elapsed * (confetti ? .72 : .48) + index * .618) % 1;
    const x = Math.sin(index * 26.37) * .43 + Math.sin(phase * 5 + index) * .055;
    const y = confetti ? phase - .5 : .5 - phase;
    const envelope = Math.sin(Math.PI * phase);
    target.save();
    target.translate(x, y);
    target.scale(size, size);
    target.globalAlpha *= envelope;
    if (confetti) {
      target.rotate(index + phase * Math.PI * 2);
      target.fillStyle = ['#ffd05a', '#72e3dd', '#ff77a8', '#9f95ff'][index % 4];
      target.fillRect(-.024, -.046, .048, .092);
    } else if (preset === 'Floating Hearts') {
      target.font = '.16px "Segoe UI Emoji", sans-serif';
      target.fillText('💗', 0, 0);
    } else {
      const radius = (.036 + (index % 4) * .016) * envelope;
      target.fillStyle = index % 2 ? '#fff4ae' : '#fff';
      target.beginPath();
      for (let tip = 0; tip < 8; tip++) {
        const angle = tip * Math.PI / 4;
        const reach = radius * (tip % 2 ? .28 : 1);
        target.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
      }
      target.closePath();
      target.fill();
    }
    target.restore();
  }
}

function overlayPose(clip, elapsed, { width, height }) {
  const transform = overlayTransformAt(clip, elapsed);
  const title = clip.track === 'title';
  const scale = transform.overlaySize / 100 * (clip.track === 'overlay' || !clip.track ? Math.min(width, height) : 1);
  const motionSize = title ? scale * clip.size * 2 : clip.track === 'visual' ? scale * Math.min(width, height) : scale;
  const wave = Math.sin(elapsed * Math.PI * 2 / 1.6);
  const offsetY = clip.overlayMotion === 'Float' ? wave * motionSize * .14 : 0;
  return {
    x: width * transform.overlayX / 100,
    y: height * transform.overlayY / 100 + offsetY,
    offsetY,
    angle: (transform.overlayRotation + (clip.overlayMotion === 'Spin' ? elapsed * 135 : 0)) * Math.PI / 180,
    opacity: transform.overlayOpacity / 100,
    scale: scale * (clip.overlayMotion === 'Pulse' ? 1 + wave * .13 : 1)
  };
}

function drawTitleLayer(target, clip, position, index) {
  const elapsed = position - clip.at;
  const legacy = clipAnimationAt(clip, elapsed);
  const transformed = clip.overlayY !== undefined || clip.overlayKeys?.length || clip.overlayMotion;
  const output = transformed ? animatedLayer(target.canvas) : target;
  const layer = legacy ? animatedLayer(output.canvas) : output;
  drawTextContent(layer, clip, elapsed, transformed ? 0 : index, transformed ? .5 : .78);
  if (legacy) drawAnimationLayer(output, layer, legacy);
  if (!transformed) return;
  drawTransformedLayer(target, output.canvas, clip, clip.start + elapsed);
}

function drawTransformedLayer(target, source, clip, at) {
  const { x, y, angle, scale, opacity } = overlayPose(clip, at, target.canvas);
  target.save();
  target.globalAlpha *= opacity;
  target.translate(x, y);
  target.rotate(angle);
  target.scale(scale, scale);
  target.drawImage(source, -source.width / 2, -source.height / 2);
  target.restore();
}

function overlayDimensions(image) {
  const fit = Math.max(image.naturalWidth, image.naturalHeight);
  return [image.naturalWidth / fit, image.naturalHeight / fit];
}

function drawOverlay(target, clip, elapsed) {
  const image = assets.get(clip.asset)?.media;
  const sticker = stickerPresets[clip.preset];
  const { x, y, angle, scale, opacity } = overlayPose(clip, elapsed, target.canvas);
  target.save();
  target.globalAlpha *= opacity;
  target.translate(x, y);
  target.rotate(angle);
  target.scale(scale, scale);
  target.textAlign = 'center';
  target.textBaseline = 'middle';
  if (image?.naturalWidth) {
    const [w, h] = overlayDimensions(image);
    target.drawImage(image, -w / 2, -h / 2, w, h);
  } else if (sticker) {
    target.font = '.85px "Segoe UI Emoji", sans-serif';
    target.fillText(sticker, 0, 0);
  } else if (overlayAnimationPresets.includes(clip.preset)) {
    drawOverlayParticles(target, clip.preset, elapsed, presetOptions(clip, 'overlay', clip.preset));
  }
  target.restore();
}

function overlayDefaults(preset) {
  return {
    overlayX: 50, overlayY: 50, overlaySize: overlayAnimationPresets.includes(preset) ? 82 : 32,
    overlayRotation: 0, overlayOpacity: 100, overlayMotion: ''
  };
}

function addOverlay({ preset, asset, at = time }) {
  const clip = {
    id: id(), track: 'overlay', preset, asset, at, start: 0, end: 3, ...overlayDefaults(preset)
  };
  remember();
  clips.push(clip);
  selected = clip.id;
  seek(at);
  refresh();
}

function overlayInspector(clip, section, sliderField) {
  const heading = document.createElement('h3');
  heading.className = 'section';
  heading.textContent = 'Transform';
  section.append(heading);
  const transform = overlayTransformAt(clip, overlaySourceTime(clip));
  for (const [label, key, min, max] of overlayFields) {
    const input = sliderField(label, transform[key], min, max, value => {
      const at = overlaySourceTime(clip);
      writeOverlayTransform(clip, at, { ...overlayTransformAt(clip, at), [key]: value }, Boolean(clip.overlayKeys?.length));
    }, '.01');
    input.dataset.overlayField = key;
    input.onfocus = () => { if (playback) pause(); };
  }
  const controls = document.createElement('div');
  controls.className = 'row overlay-key-controls';
  const makeButton = (id, label, action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.textContent = label;
    button.onclick = action;
    controls.append(button);
    return button;
  };
  makeButton('previousOverlayKey', '‹', () => jumpToOverlayKey(clip, adjacentOverlayKeys(clip)[0])).ariaLabel = 'Previous transform keyframe';
  makeButton('toggleOverlayKey', 'Add keyframe', () => {
    if (!overlayPlayheadInClip(clip)) return;
    if (playback) pause();
    const at = overlaySourceTime(clip);
    const key = overlayKeyAt(clip, at);
    if (key) return removeOverlayKey(clip, key);
    remember();
    writeOverlayTransform(clip, at, overlayTransformAt(clip, at), true);
    refresh();
  });
  makeButton('nextOverlayKey', '›', () => jumpToOverlayKey(clip, adjacentOverlayKeys(clip)[1])).ariaLabel = 'Next transform keyframe';
  section.append(controls);
  section.append(overlayKeyList(clip));
  const row = document.createElement('label');
  row.className = 'field visual-choice';
  row.textContent = 'Motion';
  const choice = document.createElement('select');
  choice.add(new Option('None', ''));
  for (const motion of overlayMotions) choice.add(new Option(motion));
  choice.value = clip.overlayMotion;
  choice.onchange = () => {
    remember();
    clip.overlayMotion = choice.value;
    refresh();
  };
  row.append(choice);
  section.append(row);
  if (clip.track === 'overlay' && overlayAnimationPresets.includes(clip.preset)) {
    const group = document.createElement('section');
    const title = document.createElement('h3');
    title.className = 'section';
    title.textContent = 'Overlay animation';
    group.append(title);
    presetSliders(clip, 'overlay', clip.preset, ['speed', 'density', 'particle'], group, '', () => {
      if (!playback && !layerOnScreen(clip, previewFramePosition())) seek(clip.at);
    });
    section.append(group);
  }
}

function removeOverlayKey(clip, key) {
  remember();
  clip.overlayKeys = clip.overlayKeys.filter(item => item.at !== key.at);
  if (!clip.overlayKeys.length) Object.assign(clip, key.transform);
  refresh();
}

function overlayKeyList(clip) {
  const wrapper = document.createElement('div');
  wrapper.id = 'overlayKeyList';
  wrapper.className = 'intensity-keyframes overlay-key-list';
  const list = document.createElement('ul');
  list.setAttribute('aria-label', 'Transform keyframes');
  wrapper.append(list);
  let shownKeys;
  const curves = [];
  wrapper.sync = current => {
    if (shownKeys !== clip.overlayKeys) {
      shownKeys = clip.overlayKeys;
      list.replaceChildren();
      curves.length = 0;
      for (const [index, key] of (shownKeys ?? []).entries()) {
        if (key.at < clip.start || key.at > clip.end) continue;
        const item = document.createElement('li');
        item.dataset.time = key.at;
        const seconds = Number((key.at - clip.start).toFixed(3)) + ' s';
        const number = value => Number(value.toFixed(2));
        const { overlayX, overlayY, overlaySize, overlayRotation, overlayOpacity } = key.transform;
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.textContent = seconds;
        const summary = document.createElement('span');
        summary.textContent = 'X ' + number(overlayX) + '% · Y ' + number(overlayY) + '% · Size ' +
          number(overlaySize) + '% · Rotation ' + number(overlayRotation) + '° · Opacity ' + number(overlayOpacity) + '%';
        jump.append(summary);
        jump.onclick = () => {
          pause();
          seekOverlayKeyTime(clip, key.at);
        };
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', 'Remove transform keyframe at ' + seconds);
        remove.onclick = () => removeOverlayKey(clip, key);
        item.append(jump, remove);
        const next = shownKeys[index + 1];
        if (next && key.at < clip.end) {
          const { row, select } = overlayKeyEasing(clip, key, next);
          const curve = keyframeCurveEditor(clip, key, next, select, {
            field: 'overlayKeys', seekKey: seekOverlayKeyTime,
            onWrite: () => { shownKeys = clip.overlayKeys; }
          });
          item.append(row, curve.details);
          curves.push(curve);
        }
        list.append(item);
      }
    }
    wrapper.hidden = !list.children.length;
    for (const item of list.children) {
      const active = Number(item.dataset.time) === current?.at;
      item.classList.toggle('at-playhead', active);
      if (active) item.firstElementChild.setAttribute('aria-current', 'true');
      else item.firstElementChild.removeAttribute('aria-current');
    }
    for (const curve of curves) curve.sync();
  };
  return wrapper;
}

function overlayKeyEasing(clip, key, next) {
  const row = document.createElement('label');
  row.className = 'intensity-easing';
  row.textContent = 'Easing to next';
  const select = document.createElement('select');
  for (const name of Object.keys(keyframeEasings)) select.add(new Option(name));
  const custom = new Option('Custom');
  custom.disabled = true;
  select.add(custom);
  select.value = key.curve ? 'Custom' : key.easing ?? 'Linear';
  select.onchange = () => {
    const current = clip.overlayKeys.find(item => item.at === key.at);
    if (!current || !Object.hasOwn(keyframeEasings, select.value) ||
        (!current.curve && select.value === (current.easing ?? 'Linear'))) return;
    pause();
    remember();
    const preset = { ...current, easing: select.value };
    delete preset.curve;
    clip.overlayKeys = clip.overlayKeys.map(item => item === current ? preset : item);
    const end = Math.min(next.at, clip.end);
    const at = overlaySourceTime(clip);
    const sample = at <= key.at + overlayKeyTolerance || at >= end - overlayKeyTolerance
      ? key.at + (end - key.at) / 4 : at;
    seekOverlayKeyTime(clip, sample);
    updateHistoryButtons();
    $('overlayKeyList').querySelector('li[data-time="' + key.at + '"] select')?.focus({ preventScroll: true });
  };
  row.append(select);
  return { row, select };
}

function overlaySourceTime(clip, position = previewFramePosition()) {
  return clamp(clip.start + position - clip.at, clip.start, clip.end);
}

function overlayPlayheadInClip(clip) {
  return time >= clip.at && time <= clip.at + length(clip);
}

function adjacentOverlayKeys(clip) {
  const keys = (clip.overlayKeys ?? []).filter(key => key.at >= clip.start && key.at <= clip.end);
  const at = clip.start + time - clip.at;
  return [keys.findLast(key => key.at < at - overlayKeyTolerance),
    keys.find(key => key.at > at + overlayKeyTolerance)];
}

function jumpToOverlayKey(clip, key) {
  if (!key) return;
  pause();
  selected = clip.id;
  seekOverlayKeyTime(clip, key.at);
  refresh();
}

function seekOverlayKeyTime(clip, at) {
  seek(Math.min(clip.at + at - clip.start, clip.at + length(clip) - .001));
  syncOverlayInspector(previewFramePosition(), true);
}

function syncOverlayInspector(position, force = false) {
  const clip = active();
  const button = $('toggleOverlayKey');
  if (!hasLayerTransform(clip) || !button) return;
  const at = overlaySourceTime(clip, position);
  const transform = overlayTransformAt(clip, at);
  const inRange = overlayPlayheadInClip(clip);
  for (const input of $('inspect').querySelectorAll('[data-overlay-field]')) {
    input.disabled = Boolean(clip.overlayKeys?.length) && !inRange;
    input.syncValue(transform[input.dataset.overlayField], force);
  }
  const key = inRange ? overlayKeyAt(clip, at) : undefined;
  button.disabled = !inRange;
  button.textContent = key ? 'Remove keyframe' : 'Add keyframe';
  $('overlayKeyList').sync(key);
  const [previous, next] = adjacentOverlayKeys(clip);
  $('previousOverlayKey').disabled = !previous;
  $('nextOverlayKey').disabled = !next;
}

function overlayKeyDiamond(clip, key, scale) {
  const diamond = document.createElement('button');
  diamond.type = 'button';
  diamond.className = 'overlay-key-diamond';
  diamond.dataset.transformClip = clip.id;
  const position = at => {
    diamond.dataset.transformTime = at;
    diamond.style.left = (clip.at + at - clip.start) * scale + 'px';
    diamond.title = 'Transform keyframe, ' + (at - clip.start).toFixed(3) + ' s';
    diamond.setAttribute('aria-label', diamond.title);
  };
  const limit = (at, keys) => {
    const index = keys.indexOf(key);
    const before = keys[index - 1];
    const after = keys[index + 1];
    const gap = .003;
    const min = Math.max(clip.start, before ? Math.min(key.at, before.at + gap) : clip.start);
    const max = Math.min(clip.end, after ? Math.max(key.at, after.at - gap) : clip.end);
    return clamp(Number(at.toFixed(3)), min, max);
  };
  const moveKey = (at, keys) => {
    clip.overlayKeys = at === key.at ? keys : keys.map(item => item === key ? { ...item, at } : item);
  };
  const moveOpenCurve = at => { openKeyframeCurves.overlayKeys = { clip: clip.id, at }; };
  const finish = at => {
    refresh();
    document.querySelector('[data-transform-clip="' + CSS.escape(clip.id) +
      '"][data-transform-time="' + at + '"]')?.focus({ preventScroll: true });
  };
  position(key.at);
  diamond.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const state = snapshot();
    const keys = clip.overlayKeys;
    const previousTime = time;
    const previousSelection = selected;
    const curveWasOpen = isKeyframeCurveOpen('overlayKeys', clip, key.at);
    let at = key.at;
    let dragging = false;
    pause();
    selected = clip.id;
    if (previousSelection !== selected) inspector();
    seekOverlayKeyTime(clip, at);
    const move = next => {
      if (next.pointerId !== event.pointerId) return;
      const delta = next.clientX - event.clientX;
      if (!dragging && Math.abs(delta) < 3) return;
      dragging = true;
      diamond.classList.add('dragging');
      const target = limit(key.at + delta / scale, keys);
      if (target === at) return;
      at = target;
      moveKey(at, keys);
      if (curveWasOpen) moveOpenCurve(at);
      position(at);
      seekOverlayKeyTime(clip, at);
    };
    const end = next => {
      if (next.pointerId !== event.pointerId) return;
      window.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel']) window.removeEventListener(type, end);
      if (next.type !== 'pointerup') {
        moveKey(key.at, keys);
        if (curveWasOpen) moveOpenCurve(key.at);
        selected = previousSelection;
        seek(previousTime);
        refresh();
      } else {
        if (at !== key.at) remember(state);
        finish(at);
      }
    };
    window.addEventListener('pointermove', move);
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, end);
  };
  diamond.onclick = event => {
    if (event.detail !== 0) return;
    pause();
    selected = clip.id;
    seekOverlayKeyTime(clip, key.at);
    finish(key.at);
  };
  diamond.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? .1 : .01;
    const keys = clip.overlayKeys;
    const at = limit(key.at + (event.key === 'ArrowLeft' ? -step : step), keys);
    if (at === key.at) return;
    remember();
    pause();
    moveKey(at, keys);
    if (isKeyframeCurveOpen('overlayKeys', clip, key.at)) moveOpenCurve(at);
    selected = clip.id;
    seekOverlayKeyTime(clip, at);
    finish(at);
  };
  return diamond;
}

const overlayCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
let previewOverlayDrag;

function overlayPreviewMetrics() {
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
  return {
    left: rect.left + (rect.width - canvas.width * scale) / 2,
    top: rect.top + (rect.height - canvas.height * scale) / 2,
    scale
  };
}

function previewFramePosition() {
  return Math.min(time, Math.max(0, duration() - .001));
}

function layerOnScreen(clip, position) {
  return position >= clip.at && position < clip.at + length(clip);
}

function canManipulateLayer(clip, position) {
  if (clip?.track === 'audio') return Boolean(clip.visualizer) && layerOnScreen(clip, position);
  return hasLayerTransform(clip) && layerOnScreen(clip, position) &&
    (clip.track !== 'visual' || clips.findLast(item => item.track === 'visual' && layerOnScreen(item, position)) === clip);
}

function textTransformBounds(clip) {
  context.save();
  context.font = titleCanvasFont(clip);
  const lines = clip.text.split('\n');
  const width = Math.max(clip.size * .5, ...lines.map(line => context.measureText(line).width));
  context.restore();
  const outline = titleAppearance(clip, 'outline');
  const background = titleAppearance(clip, 'background');
  const stroke = outline.enabled && outline.opacity ? outline.thickness : 0;
  const pad = background.enabled && background.opacity ? clip.size * .32 : 0;
  return [Math.min(canvas.width * .88, width) + Math.max(stroke, pad), lines.length * clip.size * 1.12 + stroke];
}

function previewOverlayBounds(clip, position) {
  if (clip.track === 'audio') return visualizerBounds(clip);
  const pose = overlayPose(clip, clip.start + position - clip.at, canvas);
  const image = assets.get(clip.asset)?.media;
  const [width, height] = clip.track === 'visual' ? visualTransformBounds(clip, image)
    : clip.track === 'title' ? textTransformBounds(clip)
    : image?.naturalWidth ? overlayDimensions(image) : [1, 1];
  return { ...pose, halfW: width * pose.scale / 2, halfH: height * pose.scale / 2 };
}

function visualTransformBounds(clip, media) {
  const mode = activeBackground(clip)?.mode;
  if (personModel && (mode === 'color' || mode === 'image')) return [canvas.width, canvas.height];
  return fittedVisualSize(media, canvas) ?? [canvas.width, canvas.height];
}

function rotateOverlayPoint(x, y, angle) {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

function updateOverlaySelection(position = previewFramePosition()) {
  const outline = $('overlaySelection');
  const clip = active();
  if (exporting || playback || !canManipulateLayer(clip, position) ||
      (clip.id === maskPreviewClip && activeBackground(clip))) {
    outline.hidden = true;
    return;
  }
  const { left, top, scale } = overlayPreviewMetrics();
  outline.hidden = !scale;
  if (outline.hidden) return;
  const stage = outline.parentElement.getBoundingClientRect();
  const bounds = previewOverlayBounds(clip, position);
  Object.assign(outline.style, {
    left: left - stage.left + bounds.x * scale + 'px',
    top: top - stage.top + bounds.y * scale + 'px',
    width: bounds.halfW * 2 * scale + 'px',
    height: bounds.halfH * 2 * scale + 'px',
    transform: 'translate(-50%, -50%) rotate(' + bounds.angle + 'rad)'
  });
}

function previewOverlayHit(event) {
  if (bodySubjectPicker) return null;
  if (exporting || (selected && selected === maskPreviewClip)) return null;
  const { left, top, scale } = overlayPreviewMetrics();
  if (!scale) return null;
  const x = (event.clientX - left) / scale;
  const y = (event.clientY - top) / scale;
  const position = previewFramePosition();
  const clip = active();
  if (!playback && canManipulateLayer(clip, position)) {
    const bounds = previewOverlayBounds(clip, position);
    const [u, v] = rotateOverlayPoint(x - bounds.x, y - bounds.y, -bounds.angle);
    // Take the nearest handle so the corners of a small layer stay distinct.
    const distance = ([sx, sy]) => Math.hypot(u - sx * bounds.halfW, v - sy * bounds.halfH) * scale;
    const corner = overlayCorners.filter(handle => distance(handle) <= 10)
      .sort((left, right) => distance(left) - distance(right))[0];
    if (corner) return { clip, bounds, corner };
  }
  if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return null;
  const inside = candidate => {
    const bounds = previewOverlayBounds(candidate, position);
    const [u, v] = rotateOverlayPoint(x - bounds.x, y - bounds.y, -bounds.angle);
    return Math.abs(u) <= bounds.halfW && Math.abs(v) <= bounds.halfH && { clip: candidate, bounds };
  };
  // Visualizers draw above overlays. A selected one takes the pointer; an unselected one does
  // only where no video or image is under it, so a full-frame visualizer never hides the video.
  const visualizers = clips.filter(candidate => candidate.track === 'audio' && candidate.visualizer &&
    layerOnScreen(candidate, position)).reverse();
  for (const track of ['title', 'overlay', 'audio', 'visual']) {
    if (track === 'audio') {
      const hit = visualizers.filter(candidate => candidate.id === selected).map(inside).find(Boolean);
      if (hit) return hit;
      continue;
    }
    for (let i = clips.length - 1; i >= 0; i--) {
      const candidate = clips[i];
      if (candidate.track !== track || !layerOnScreen(candidate, position)) continue;
      const hit = inside(candidate);
      if (hit) return hit;
      if (track === 'visual') break;
    }
  }
  return visualizers.map(inside).find(Boolean) ?? null;
}

function connectOverlayPreview() {
  const stage = canvas.parentElement;
  const observer = new ResizeObserver(() => updateOverlaySelection());
  observer.observe(stage);
  observer.observe(canvas);
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || previewOverlayDrag) return;
    const hit = previewOverlayHit(event);
    if (!hit) return;
    event.preventDefault();
    pause();
    const { clip, bounds, corner } = hit;
    selected = clip.id;
    refresh();
    if (clip.track === 'audio') {
      previewOverlayDrag = {
        clip, corner, visualizer: true, state: snapshot(), id: event.pointerId, x: event.clientX, y: event.clientY,
        scale: overlayPreviewMetrics().scale, original: { ...clip.visualizer }, changed: false
      };
      stage.setPointerCapture(event.pointerId);
      return;
    }
    const [x, y] = corner ?? [0, 0];
    const diagonal = rotateOverlayPoint(x * bounds.halfW, y * bounds.halfH, bounds.angle);
    const at = overlaySourceTime(clip);
    previewOverlayDrag = {
      clip, bounds, corner, diagonal, at, state: snapshot(), id: event.pointerId,
      x: event.clientX, y: event.clientY, scale: overlayPreviewMetrics().scale,
      original: overlayTransformAt(clip, at), originalKeys: clip.overlayKeys,
      originalFields: overlayFields.map(([, key]) => [key, clip[key]]), changed: false
    };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    const drag = previewOverlayDrag;
    if (!drag) {
      const hit = previewOverlayHit(event);
      if (hit?.corner) {
        const [x, y] = rotateOverlayPoint(...hit.corner, hit.bounds.angle);
        const direction = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 4) % 4;
        stage.style.cursor = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][direction];
      } else {
        stage.style.cursor = hit ? 'move' : '';
      }
      return;
    }
    if (event.pointerId !== drag.id) return;
    if (drag.visualizer) {
      if (!drag.changed && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 2) return;
      const dx = (event.clientX - drag.x) / drag.scale / canvas.width;
      const dy = (event.clientY - drag.y) / drag.scale / canvas.height;
      dragVisualizerBox(drag.clip.visualizer, drag.original, drag.corner, dx, dy);
      drag.changed = true;
      draw();
      return;
    }
    const { clip, bounds, corner, diagonal: [cx, cy], original } = drag;
    const dx = (event.clientX - drag.x) / drag.scale;
    const dy = (event.clientY - drag.y) / drag.scale;
    if (!drag.changed && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 2) return;
    const transform = { ...original };
    if (corner) {
      const ratio = 1 + (dx * cx + dy * cy) / (2 * (cx * cx + cy * cy));
      transform.overlaySize = clamp(original.overlaySize * ratio, 1, 250);
      const change = transform.overlaySize / original.overlaySize - 1;
      transform.overlayX = clamp(original.overlayX + cx * change / canvas.width * 100, 0, 100);
      transform.overlayY = clamp(original.overlayY + (cy - bounds.offsetY) * change / canvas.height * 100, 0, 100);
    } else {
      transform.overlayX = clamp(original.overlayX + dx / canvas.width * 100, 0, 100);
      transform.overlayY = clamp(original.overlayY + dy / canvas.height * 100, 0, 100);
    }
    drag.changed = Object.keys(original).some(key => transform[key] !== original[key]);
    if (drag.changed) writeOverlayTransform(clip, drag.at, transform, Boolean(drag.originalKeys?.length));
    else restoreOverlayDrag(drag);
    draw();
  });
  const finish = event => {
    const drag = previewOverlayDrag;
    if (!drag || event.pointerId !== drag.id) return;
    previewOverlayDrag = null;
    if (event.type !== 'pointerup') restoreOverlayDrag(drag);
    else if (drag.changed) remember(drag.state);
    refresh();
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(event, finish);
}

function restoreOverlayDrag({ clip, originalFields, originalKeys, visualizer, original }) {
  if (visualizer) {
    clip.visualizer = original;
    return;
  }
  if (originalKeys?.length) clip.overlayKeys = originalKeys;
  else for (const [key, value] of originalFields) {
    if (value === undefined) delete clip[key];
    else clip[key] = value;
  }
}

function renderOverlayPresets() {
  for (const [container, presets] of [['stickers', Object.keys(stickerPresets)], ['overlayAnimations', overlayAnimationPresets]]) {
    for (const preset of presets) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'preset-tile';
      tile.draggable = true;
      tile.dataset.overlayPreset = preset;
      const preview = document.createElement('canvas');
      preview.width = 120;
      preview.height = 68;
      preview.setAttribute('aria-hidden', 'true');
      const output = preview.getContext('2d');
      const clip = { preset, ...overlayDefaults(preset), overlaySize: 90 };
      const paint = elapsed => {
        output.clearRect(0, 0, preview.width, preview.height);
        drawOverlay(output, clip, elapsed);
      };
      paint(.65);
      if (overlayAnimationPresets.includes(preset)) {
        let frame = 0;
        const start = () => {
          if (frame || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          const began = performance.now();
          const animate = now => {
            paint((now - began) / 1000);
            frame = requestAnimationFrame(animate);
          };
          frame = requestAnimationFrame(animate);
        };
        const stop = () => {
          cancelAnimationFrame(frame);
          frame = 0;
          paint(.65);
        };
        tile.onpointerenter = tile.onfocus = start;
        tile.onpointerleave = tile.onblur = stop;
      }
      tile.ondragstart = event => {
        event.dataTransfer.setData(overlayDragType, preset);
        event.dataTransfer.effectAllowed = 'copy';
      };
      tile.onclick = () => addOverlay({ preset });
      const label = document.createElement('span');
      label.textContent = preset;
      tile.append(preview, label);
      $(container).append(tile);
    }
  }
  const lane = document.querySelector('[data-track=overlay]');
  lane.ondragover = event => {
    if (!event.dataTransfer.types.includes(overlayDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    lane.classList.add('drop');
  };
  lane.ondragleave = event => {
    if (!lane.contains(event.relatedTarget)) lane.classList.remove('drop');
  };
  lane.ondrop = event => {
    const preset = event.dataTransfer.getData(overlayDragType);
    lane.classList.remove('drop');
    if (!Object.hasOwn(stickerPresets, preset) && !overlayAnimationPresets.includes(preset)) return;
    event.preventDefault();
    const at = Math.max(0, (event.clientX - lane.getBoundingClientRect().left) / zoom());
    addOverlay({ preset, at });
  };
}
