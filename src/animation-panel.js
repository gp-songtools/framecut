'use strict';

const animationTabs = {
  visual: [['Entrance', 'entrance'], ['Exit', 'exit'], ['Combo', 'combo']],
  title: [['In', 'textIn'], ['Out', 'textOut'], ['Loop', 'textLoop']]
};
const animationDragTypes = { visual: 'application/x-framecut-animation-visual', title: 'application/x-framecut-animation-title' };
const selectedAnimationTab = { visual: 'entrance', title: 'textIn' };
let animationPanelKey;
let animationSample;
let copiedAnimation;
let animationMenuTarget;

function animationCopyData(clip, property) {
  if (!clip || !animationTabs[clip.track]?.some(([, slot]) => slot === property)) return null;
  const type = currentPreset(clip, property);
  if (!type) return null;
  const data = { track: clip.track, property, type };
  const options = presetOptions(clip, property, type);
  if (Object.keys(options).length) data.options = options;
  if (property !== 'combo' && property !== 'textLoop') {
    const { key } = animationEdgeTiming(clip, property);
    data.key = key;
    data.duration = key.startsWith('text') ? clip[key + 'Duration'] ?? defaultFadeDuration : animationDuration(clip, key);
    if (type === 'Slide + Fade') data.direction = clip[key + 'Direction'] ?? (key === 'exit' ? 'Right' : 'Left');
  }
  return data;
}

function syncAnimationClipboard(clip = active()) {
  const copy = $('copyAnimation');
  const paste = $('pasteAnimation');
  copy.disabled = !animationCopyData(clip, selectedAnimationTab[clip?.track]);
  paste.disabled = !canPasteClipAnimation(clip);
  paste.title = copiedAnimation ? 'Paste ' + animationLabel(copiedAnimation.property, copiedAnimation.type) : 'Copy an animation first';
}

function copyClipAnimation(clip, property) {
  const data = animationCopyData(clip, property);
  if (!data) return false;
  copiedAnimation = data;
  syncAnimationClipboard();
  notify('Copied ' + animationLabel(property, data.type) + '.');
  return true;
}

function canPasteClipAnimation(clip) {
  return Boolean(copiedAnimation && copiedAnimation.track === clip?.track &&
    animationSupportsClip(clip, copiedAnimation.type));
}

function pasteClipAnimation(clip) {
  const data = copiedAnimation;
  if (!canPasteClipAnimation(clip)) return false;
  const { property, type, key, duration, direction } = data;
  if (JSON.stringify(animationCopyData(clip, property)) !== JSON.stringify(data)) {
    remember();
    if (property === 'textIn' || property === 'textOut') {
      const edge = property === 'textIn' ? 'entrance' : 'exit';
      delete clip[property];
      delete clip[edge];
      delete clip[edge === 'entrance' ? 'fadeIn' : 'fadeOut'];
    }
    clip[key ?? property] = type;
    if (data.options || Object.keys(presetOptions(clip, property, type)).length) {
      writePresetOptions(clip, property, type, { ...data.options });
    }
    if (key) {
      clip[key + 'Duration'] = duration;
      if (direction) clip[key + 'Direction'] = direction;
    }
  }
  openTimelineAnimation(clip, property);
  notify('Pasted ' + animationLabel(property, type) + '.');
  return true;
}

function showAnimationMenu(event, clip, property) {
  const extractable = !property && canExtractAudio(clip);
  const lyricsImportable = !property && clip.track === 'audio';
  const copyable = Boolean(animationCopyData(clip, property));
  const pasteable = canPasteClipAnimation(clip);
  const removable = (animationTabs[clip.track] ?? []).filter(([, slot]) =>
    (!property || slot === property) && currentPreset(clip, slot));
  if (!copyable && !pasteable && !removable.length && !extractable && !lyricsImportable) return;
  event.preventDefault();
  event.stopPropagation();
  animationMenuTarget = { id: clip.id, property };
  const menu = $('animationMenu');
  $('menuCopyAnimation').hidden = !copyable;
  $('menuPasteAnimation').hidden = !pasteable && !copyable && !removable.length;
  $('menuPasteAnimation').disabled = !pasteable;
  const extract = $('menuExtractAudio');
  extract.hidden = !extractable;
  extract.onclick = () => {
    menu.hidePopover();
    const target = clips.find(item => item.id === clip.id);
    if (target) extractAudio(target);
  };
  const lyrics = $('menuImportLyrics');
  lyrics.hidden = !lyricsImportable;
  lyrics.onclick = () => {
    menu.hidePopover();
    openLyricsDialog(clips.find(item => item.id === clip.id));
  };
  const deleteActions = $('menuDeleteAnimations');
  deleteActions.replaceChildren();
  for (const [label, slot] of removable) {
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = removable.length === 1 ? 'Delete animation' : 'Delete ' + label + ' animation';
    action.title = 'Delete ' + animationLabel(slot, currentPreset(clip, slot));
    action.onclick = () => {
      menu.hidePopover();
      const target = clips.find(item => item.id === clip.id);
      const type = target && currentPreset(target, slot);
      if (!type) return;
      selected = target.id;
      selectedAnimationTab[target.track] = slot;
      setAnimationPreset(target, slot, '');
      document.querySelector('.clip[data-id="' + CSS.escape(target.id) + '"]')?.focus({ preventScroll: true });
      notify('Deleted ' + animationLabel(slot, type) + '.');
    };
    deleteActions.append(action);
  }
  if (!menu.matches(':popover-open')) menu.showPopover();
  menu.style.left = clamp(event.clientX, 8, Math.max(8, innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = clamp(event.clientY, 8, Math.max(8, innerHeight - menu.offsetHeight - 8)) + 'px';
  menu.querySelector('button:not([hidden]):not(:disabled)')?.focus({ preventScroll: true });
}

function animationClipboardKey(event) {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey ||
      event.target.closest('input, textarea, select, [contenteditable=true]') || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  const control = event.target.closest('[data-animation-clip], .clip[data-id]');
  const clip = control ? clips.find(item => item.id === (control.dataset.animationClip ?? control.dataset.id)) : active();
  if (key === 'v' && pasteClipAnimation(clip)) {
    event.preventDefault();
  } else if (key === 'c' && !window.getSelection()?.toString()) {
    const property = event.target.closest('[data-animation-edge]')?.dataset.animationEdge ??
      event.target.closest('[data-animation-badge]')?.dataset.animationBadge ??
      (event.target.closest('#animationPresets [aria-pressed=true]') ? selectedAnimationTab[clip?.track] : null);
    if (copyClipAnimation(clip, property)) event.preventDefault();
  }
}


function isImageAnimationClip(clip) {
  return clip?.track === 'visual' && assets.get(clip.asset)?.type === 'image';
}

function animationSupportsClip(clip, type) {
  return (type !== 'Lens Open' && type !== 'Lens Close') || isImageAnimationClip(clip);
}

function animationGroups(property, clip) {
  if (property === 'textLoop') return [
    ['Waves & Floats', textLoopPresets], ['Jitters and Shakes', textJitterLoops], ['Spins and Swings', textSpinLoops],
    ['Color and Highlight Loops', textColorLoops]
  ];
  if (property === 'textIn' || property === 'textOut') {
    const wipe = property === 'textIn' ? 'Wipe In' : 'Wipe Out';
    return [
      ['Typography & Character By Character', textTypingPresets],
      ['Kinetic and Bouncy', textKineticPresets],
      ['Slides and Reveals', [...textRevealPresets.slice(0, 4), wipe, ...textRevealPresets.slice(4)]],
      ['Blurs and Glows', [...(property === 'textIn' ? ['Blur In', 'Glow In'] : ['Blur Out']), ...textGlowPresets]],
      ['3D and Perspective', textPerspectivePresets],
      ['Glitch & Distortion', [property === 'textIn' ? 'Glitch In' : 'Glitch Out', ...textGlitchPresets]]
    ];
  }
  if (property === 'combo') return Object.entries(comboGroups);
  const fades = property === 'exit'
    ? ['Fades & Blurs', ['Opacity Fade', 'Blur', 'Focus', 'Black', 'White', 'Dissolve', 'Mini-Zoom + Fade']]
    : ['Fades and Dissolves', [...fadeAnimations, 'Black', 'White']];
  const groups = [fades];
  const image = isImageAnimationClip(clip);
  if (property === 'entrance') groups.push(['Motion', motionAnimations]);
  if (property === 'exit') groups.push(['Zooms & Shrinks', zoomExitAnimations],
    ['Slides & Wipes', [...slideExitAnimations, 'Slide + Fade', ...(image ? ['Lens Close'] : [])]],
    ['Spins & Drops', rotationExitAnimations],
    ['Glitch & Distortion', glitchExitAnimations]);
  if (property === 'entrance') groups.push(
    ['Zooms & Scales', zoomAnimations], ['Slides & Swipes', image ? [...slideAnimations, 'Lens Open'] : slideAnimations],
    ['Rotations & Spins', rotationAnimations], ['Glitch & Distortion', glitchAnimations],
    ['3D and Perspective', perspectiveAnimations]
  );
  return groups;
}

function animationLabel(property, type) {
  const leaving = property === 'exit' || property === 'textOut';
  if (type === 'Black' || type === 'White') return 'Fade through ' + type.toLowerCase();
  if (type === 'Opacity Fade') return leaving ? 'Fade Out (opacity)' : 'Fade in (opacity)';
  if (type === 'Dissolve' && property === 'exit') return 'Dissolve Out';
  if (type === 'Blur' || type === 'Focus') return type + (leaving ? ' Out' : ' In');
  if (leaving && (type === 'Wave In' || type === 'Drop In')) return type.replace(/ In$/, ' Out');
  return type;
}

function currentPreset(clip, property) {
  if (property === 'entrance' || property === 'exit') return animationType(clip, property);
  if (property === 'textIn') return clip.textIn ?? animationType(clip, 'entrance');
  if (property === 'textOut') return clip.textOut ?? animationType(clip, 'exit');
  return clip[property] ?? '';
}

function previewSelectedAnimation(clip, property) {
  pause();
  if (property === 'combo' || property === 'textLoop') {
    seek(clip.at + length(clip) / 4);
    return;
  }
  const text = clip.track === 'title';
  const span = (text ? textEdgeDurations(clip) : animationLengths(clip))[property];
  const leaving = property === 'exit' || property === 'textOut';
  if (span) seek(leaving ? clip.at + length(clip) - span / 2 : clip.at + span / 2);
}

function setAnimationPreset(clip, property, type) {
  if (!animationSupportsClip(clip, type)) return;
  if (currentPreset(clip, property) !== type) {
    remember();
    if (property === 'entrance' || property === 'exit') {
      clip[property + 'Duration'] = animationDuration(clip, property);
    } else if (property === 'textIn' || property === 'textOut') {
      const edge = property === 'textIn' ? 'entrance' : 'exit';
      clip[property + 'Duration'] ??= animationDuration(clip, edge);
      delete clip[edge];
      delete clip[edge === 'entrance' ? 'fadeIn' : 'fadeOut'];
    }
    clip[property] = type;
  }
  if (type) previewSelectedAnimation(clip, property);
  refresh();
}

function applyDroppedAnimation(clip, payload) {
  let preset;
  try {
    preset = JSON.parse(payload);
  } catch {
    return;
  }
  if (!preset || !animationTabs[clip.track]?.some(([, property]) => property === preset.property) ||
      !animationGroups(preset.property, clip).some(([, types]) => types.includes(preset.type))) return;
  selected = clip.id;
  selectedAnimationTab[clip.track] = preset.property;
  setAnimationPreset(clip, preset.property, preset.type);
}

function sampleAnimationImage() {
  if (animationSample) return animationSample;
  animationSample = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
  const sample = animationSample.getContext('2d');
  const sky = sample.createLinearGradient(0, 0, 0, 90);
  sky.addColorStop(0, '#5fa6c7');
  sky.addColorStop(1, '#e9a36b');
  sample.fillStyle = sky;
  sample.fillRect(0, 0, 160, 90);
  sample.fillStyle = '#fff1b6';
  sample.beginPath();
  sample.arc(108, 29, 12, 0, Math.PI * 2);
  sample.fill();
  for (const [color, points] of [
    ['#4e587e', [0, 72, 41, 27, 76, 68, 118, 45, 160, 73]],
    ['#172d48', [0, 83, 48, 60, 79, 76, 132, 65, 160, 80]]
  ]) {
    sample.fillStyle = color;
    sample.beginPath();
    sample.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) sample.lineTo(points[i], points[i + 1]);
    sample.lineTo(160, 90);
    sample.lineTo(0, 90);
    sample.fill();
  }
  return animationSample;
}

function animationPreview(tile, kind, property, type) {
  const frame = Object.assign(document.createElement('canvas'), { width: 160, height: 90 });
  frame.setAttribute('aria-hidden', 'true');
  tile.append(frame);
  const output = frame.getContext('2d');
  const sample = { track: kind, start: 0, end: 2, text: 'Motion Lab', size: 22, [property]: type, [property + 'Duration']: 1 };
  const paint = phase => {
    const clip = active();
    const applied = clip?.track === kind && currentPreset(clip, property) === type;
    const options = applied ? presetOptions(clip, property, type) : undefined;
    sample.presetOptions = options ? { [property]: { [type]: options } } : undefined;
    sample[property + 'Direction'] = applied ? clip[property + 'Direction'] : undefined;
    output.fillStyle = '#101923';
    output.fillRect(0, 0, 160, 90);
    const seconds = property === 'exit' || property === 'textOut' ? 1 + Math.min(.999, phase)
      : property === 'combo' || property === 'textLoop' ? phase * 2 : phase;
    if (kind === 'title') {
      drawTextContent(output, sample, seconds, 0, .57);
      return;
    }
    const image = sampleAnimationImage();
    const animation = clipAnimationAt(sample, seconds);
    if (property === 'combo') {
      drawComboAnimation(output, image, type, phase, options);
    } else if (animation && !fades[type]) {
      const layer = animatedLayer(frame);
      layer.drawImage(image, 0, 0);
      drawAnimationLayer(output, layer, animation);
    } else {
      output.drawImage(image, 0, 0);
      if (animation) {
        output.save();
        output.globalAlpha = 1 - animation.progress;
        output.fillStyle = fades[type];
        output.fillRect(0, 0, 160, 90);
        output.restore();
      }
    }
  };
  paint(.56);
  let frameRequest = 0;
  const start = () => {
    if (frameRequest || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const origin = performance.now();
    const tick = now => {
      if (!tile.isConnected) {
        frameRequest = 0;
        return;
      }
      paint(clamp(((now - origin) % 1850 - 150) / 1450, 0, 1));
      frameRequest = requestAnimationFrame(tick);
    };
    frameRequest = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    paint(.56);
  };
  tile.onpointerenter = tile.onfocus = start;
  tile.onpointerleave = tile.onblur = stop;
}

function renderAnimationPanel(clip) {
  syncAnimationClipboard(clip);
  const kind = clip?.track;
  const tabs = animationTabs[kind];
  const property = selectedAnimationTab[kind];
  const key = tabs ? kind + ':' + property + ':' + isImageAnimationClip(clip) : 'empty';
  const panel = $('animationPresets');
  if (animationPanelKey !== key) {
    animationPanelKey = key;
    $('animationTabs').replaceChildren();
    panel.replaceChildren();
    $('animationHelp').hidden = Boolean(tabs);
    if (!tabs) return;
    for (const [label, item] of tabs) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = label;
      tab.dataset.animationTab = item;
      tab.setAttribute('aria-pressed', String(item === property));
      tab.onclick = () => {
        selectedAnimationTab[kind] = item;
        renderAnimationPanel(active());
        $('animationTabs').querySelector('[aria-pressed=true]')?.focus();
      };
      $('animationTabs').append(tab);
    }
    const makeTile = type => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'preset-tile animation-tile';
      tile.dataset.animationType = type;
      if (type) {
        animationPreview(tile, kind, property, type);
        tile.draggable = true;
        tile.ondragstart = event => {
          event.dataTransfer.setData(animationDragTypes[kind], JSON.stringify({ property, type }));
          event.dataTransfer.effectAllowed = 'copy';
        };
        tile.ondragend = clearPresetDrop;
      }
      const label = document.createElement('span');
      label.textContent = type ? animationLabel(property, type) : 'None';
      tile.append(label);
      tile.onclick = () => {
        const selectedClip = active();
        if (selectedClip?.track === kind) setAnimationPreset(selectedClip, property, type);
      };
      return tile;
    };
    panel.append(makeTile(''));
    const selectedType = currentPreset(clip, property);
    for (const [index, [name, types]] of animationGroups(property, clip).entries()) {
      const category = document.createElement('details');
      category.className = 'motion-presets';
      category.open = !index || types.includes(selectedType);
      const summary = document.createElement('summary');
      summary.textContent = name;
      const grid = document.createElement('div');
      grid.className = 'transition-presets';
      for (const type of types) grid.append(makeTile(type));
      category.append(summary, grid);
      panel.append(category);
    }
  }
  if (!tabs) return;
  const selectedType = currentPreset(clip, property);
  for (const tile of panel.querySelectorAll('[data-animation-type]')) {
    tile.setAttribute('aria-pressed', String(tile.dataset.animationType === selectedType));
  }
}

function clipAnimationEdges(clip) {
  if (clip.track === 'title') return [['In', 'textIn'], ['Out', 'textOut']];
  return clip.track === 'visual' ? animationTabs.visual.slice(0, 2) : [];
}

function animationEdgeTiming(clip, property) {
  const text = clip.track === 'title' && Boolean(clip[property]);
  const key = text ? property : property === 'textIn' ? 'entrance' : property === 'textOut' ? 'exit' : property;
  const leaving = key === 'exit' || key === 'textOut';
  const other = text ? (leaving ? 'textIn' : 'textOut') : (leaving ? 'entrance' : 'exit');
  const total = length(clip);
  const current = (text ? textEdgeDurations(clip) : animationLengths(clip))[key];
  const otherType = text ? clip[other] : animationType(clip, other);
  const otherDuration = text ? clip[other + 'Duration'] ?? defaultFadeDuration : animationDuration(clip, other);
  const reserved = otherType ? Math.min(total, otherDuration) : 0;
  const effective = requested => requested + reserved > total ? total * requested / (requested + reserved) : requested;
  const limit = Math.min(10, total);
  return { key, leaving, current, total, reserved, min: effective(Math.min(.05, limit)), max: effective(limit) };
}

function writeAnimationEdgeDuration(clip, timing, value) {
  const seconds = clamp(value, timing.min, timing.max);
  clip[timing.key + 'Duration'] = seconds + timing.reserved > timing.total
    ? seconds * timing.reserved / (timing.total - seconds)
    : seconds;
}

function previewAnimationEdge(clip, property) {
  const edge = animationEdgeTiming(clip, property);
  seek(clip.at + (edge.leaving ? edge.total - edge.current / 2 : edge.current / 2));
}

function playAnimationPreview(clip, property, timing) {
  const end = clip.at + length(clip);
  const start = timing?.leaving ? Math.max(clip.at, end - timing.current - .18) : clip.at;
  const stop = timing && !timing.leaving ? Math.min(end, start + timing.current + .18)
    : property === 'textLoop' ? Math.min(end, start + 5) : end;
  pause();
  return startPreviewPlayback({ start, end: stop });
}

function animationSettings(clip, field) {
  const text = clip.track === 'title';
  const activeSlots = animationTabs[clip.track].filter(([, property]) => Boolean(currentPreset(clip, property)));
  if (!activeSlots.length) return null;
  const section = document.createElement('div');
  section.className = 'section';
  const heading = document.createElement('h3');
  heading.textContent = 'Animation settings';
  section.append(heading);
  for (const [label, property] of activeSlots) {
    const type = currentPreset(clip, property);
    const edge = property !== 'combo' && property !== 'textLoop';
    const timing = edge ? animationEdgeTiming(clip, property) : null;
    const name = document.createElement('div');
    name.className = 'row between animation-setting-name';
    const caption = document.createElement('span');
    caption.textContent = label + ' · ' + animationLabel(property, type);
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.textContent = 'Preview';
    preview.setAttribute('aria-label', 'Preview ' + label.toLowerCase() + ' animation');
    preview.onclick = () => playAnimationPreview(clip, property, edge ? animationEdgeTiming(clip, property) : null);
    name.append(caption, preview);
    section.append(name);
    if (edge) {
      field(label + ' duration (s)', timing.current, timing.min, timing.max, value => {
        writeAnimationEdgeDuration(clip, timing, value);
        pause();
        previewAnimationEdge(clip, property);
      }, '.01', section).id = property + 'Duration';
    }
    const cueIfOutside = () => {
      const elapsed = previewFramePosition() - clip.at;
      const timing = edge ? animationEdgeTiming(clip, property) : null;
      const inSpan = edge ? elapsed >= 0 && elapsed < timing.total &&
        (timing.leaving ? timing.total - elapsed < timing.current : elapsed < timing.current) : layerOnScreen(clip, previewFramePosition());
      if (!inSpan) {
        pause();
        if (edge) previewAnimationEdge(clip, property);
        else previewSelectedAnimation(clip, property);
      }
    };
    if (property !== 'textLoop') {
      const row = document.createElement('label');
      row.className = 'field visual-choice';
      row.textContent = label + ' easing';
      const select = document.createElement('select');
      for (const easing of ['Preset', ...Object.keys(keyframeEasings)]) select.add(new Option(easing));
      select.value = presetOptions(clip, property, type).easing ?? 'Preset';
      select.onchange = () => {
        remember();
        const options = { ...presetOptions(clip, property, type) };
        if (select.value === 'Preset') delete options.easing;
        else options.easing = select.value;
        writePresetOptions(clip, property, type, options);
        updateHistoryButtons();
        cueIfOutside();
        draw(Boolean(playback));
      };
      row.append(select);
      section.append(row);
    }
    presetSliders(clip, property, type, animationControlNames(property, type), section, label + ' ', cueIfOutside);
    if (text || type !== 'Slide + Fade') continue;
    const row = document.createElement('label');
    row.className = 'field visual-choice';
    row.textContent = property === 'entrance' ? 'Slide from' : 'Slide toward';
    const direction = document.createElement('select');
    direction.id = property + 'Direction';
    for (const value of Object.keys(motionDirections)) direction.add(new Option(value));
    direction.value = clip[direction.id] ?? (property === 'entrance' ? 'Left' : 'Right');
    direction.onchange = () => {
      remember();
      clip[direction.id] = direction.value;
      previewSelectedAnimation(clip, property);
      refresh();
    };
    row.append(direction);
    section.append(row);
  }
  return section;
}

function openTimelineAnimation(clip, property) {
  selected = clip.id;
  selectedAnimationTab[clip.track] = property;
  if (property === 'combo' || property === 'textLoop') {
    previewSelectedAnimation(clip, property);
  } else {
    pause();
    previewAnimationEdge(clip, property);
  }
  refresh();
  const tile = $('animationPresets').querySelector('[aria-pressed="true"]');
  if (tile) {
    const group = tile.closest('details');
    if (group) group.open = true;
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tile.focus({ preventScroll: true });
  }
}

function animationClipBadge(clip, scale) {
  const property = clip.track === 'visual' ? 'combo' : clip.track === 'title' ? 'textLoop' : '';
  if (!property || !clip[property]) return null;
  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'clip-animation-badge';
  badge.dataset.animationClip = clip.id;
  badge.dataset.animationBadge = property;
  badge.textContent = (property === 'combo' ? 'Combo: ' : 'Loop: ') + clip[property];
  badge.title = 'Edit ' + badge.textContent;
  badge.style.left = (clip.at * scale + 4) + 'px';
  badge.style.maxWidth = Math.max(0, length(clip) * scale - 8) + 'px';
  badge.oncontextmenu = event => showAnimationMenu(event, clip, property);
  badge.onclick = event => {
    event.stopPropagation();
    openTimelineAnimation(clip, property);
  };
  return badge;
}

function animationClipSpans(clip, scale) {
  const edges = clipAnimationEdges(clip).filter(([, property]) => Boolean(currentPreset(clip, property)));
  if (!edges.length) return null;
  const container = document.createElement('div');
  container.className = 'clip-animation-spans';
  container.dataset.animationClip = clip.id;
  container.style.left = clip.at * scale + 'px';
  container.style.width = length(clip) * scale + 'px';
  const positions = [];
  const update = () => positions.forEach(position => position());

  for (const [label, property] of edges) {
    const type = animationLabel(property, currentPreset(clip, property));
    const span = document.createElement('div');
    span.className = 'clip-animation-span';
    span.dataset.animationEdge = property;
    span.oncontextmenu = event => showAnimationMenu(event, clip, property);
    const caption = document.createElement('button');
    caption.type = 'button';
    caption.className = 'clip-animation-label';
    caption.onclick = event => {
      event.stopPropagation();
      openTimelineAnimation(clip, property);
    };
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'clip-animation-resize';
    const position = () => {
      const timing = animationEdgeTiming(clip, property);
      const name = label + ': ' + type + ' (' + timing.current.toFixed(2) + ' s)';
      span.classList.toggle('outgoing', timing.leaving);
      span.style.left = (timing.leaving ? (timing.total - timing.current) * scale : 0) + 'px';
      span.style.width = timing.current * scale + 'px';
      caption.textContent = (timing.leaving ? 'Out' : 'In') + ' ' + timing.current.toFixed(2) + ' s \u00b7 ' + type;
      span.title = handle.title = caption.title = name;
      caption.setAttribute('aria-label', 'Edit ' + name);
      handle.setAttribute('aria-label', 'Resize ' + name);
    };
    positions.push(position);
    handle.onpointerdown = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      const state = snapshot();
      const timing = animationEdgeTiming(clip, property);
      const key = timing.key + 'Duration';
      const original = clip[key];
      const initialTime = time;
      let dragged = false;
      pause();
      selected = clip.id;
      inspector();
      const restore = () => {
        if (original === undefined) delete clip[key];
        else clip[key] = original;
      };
      const move = next => {
        if (next.pointerId !== event.pointerId) return;
        const pixels = next.clientX - event.clientX;
        if (!dragged && Math.abs(pixels) < 3) return;
        dragged = true;
        const direction = timing.leaving ? -1 : 1;
        const delta = Math.round(pixels / scale * 100) / 100;
        const value = clamp(timing.current + direction * delta, timing.min, timing.max);
        if (Math.abs(value - timing.current) < 1e-8) restore();
        else writeAnimationEdgeDuration(clip, timing, value);
        update();
        previewAnimationEdge(clip, property);
        inspector();
      };
      const end = next => {
        if (next.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (next.type === 'pointercancel') {
          restore();
          seek(initialTime);
        } else if (!dragged) {
          openTimelineAnimation(clip, property);
          return;
        } else if (clip[key] !== original) {
          remember(state);
        }
        refresh();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };
    handle.onclick = event => {
      event.stopPropagation();
      if (event.detail === 0) openTimelineAnimation(clip, property);
    };
    handle.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const timing = animationEdgeTiming(clip, property);
      const step = (event.shiftKey ? .1 : .01) * (timing.leaving ? -1 : 1);
      const value = clamp(timing.current + (event.key === 'ArrowRight' ? step : -step), timing.min, timing.max);
      if (Math.abs(value - timing.current) < 1e-8) return;
      remember();
      selected = clip.id;
      writeAnimationEdgeDuration(clip, timing, value);
      pause();
      previewAnimationEdge(clip, property);
      refresh();
      document.querySelector('[data-animation-clip="' + CSS.escape(clip.id) + '"] [data-animation-edge="' + property + '"] button')?.focus({ preventScroll: true });
    };
    span.append(caption, handle);
    container.append(span);
  }
  update();
  return container;
}


function connectAnimationClipboard() {
  $('copyAnimation').onclick = () => {
    const clip = active();
    copyClipAnimation(clip, selectedAnimationTab[clip?.track]);
  };
  $('pasteAnimation').onclick = () => pasteClipAnimation(active());
  $('menuCopyAnimation').onclick = () => {
    $('animationMenu').hidePopover();
    copyClipAnimation(clips.find(clip => clip.id === animationMenuTarget?.id), animationMenuTarget?.property);
  };
  $('menuPasteAnimation').onclick = () => {
    $('animationMenu').hidePopover();
    pasteClipAnimation(clips.find(clip => clip.id === animationMenuTarget?.id));
  };
  window.addEventListener('keydown', animationClipboardKey);
}
