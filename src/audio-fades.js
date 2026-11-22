'use strict';

const audioFadeEdges = [
  { field: 'audioFadeIn', opposite: 'audioFadeOut', label: 'Fade in', direction: 1 },
  { field: 'audioFadeOut', opposite: 'audioFadeIn', label: 'Fade out', direction: -1 }
];

const roundAudioFade = seconds => Math.round(seconds * 100) / 100;
const audioFadeLimit = clip => Math.floor((length(clip) + 1e-8) * 100) / 100;

function canFadeAudio(clip) {
  if (clip.audioExtracted) return false;
  const asset = assets.get(clip.asset);
  return asset?.type === 'audio' || (asset?.type === 'video' && asset.hasAudio);
}

function audioFadeDurations(clip) {
  let audioFadeIn = clip.audioFadeIn ?? 0;
  let audioFadeOut = clip.audioFadeOut ?? 0;
  const total = audioFadeIn + audioFadeOut;
  const limit = audioFadeLimit(clip);
  if (total > limit) {
    audioFadeIn = roundAudioFade(audioFadeIn * limit / total);
    audioFadeOut = roundAudioFade(limit - audioFadeIn);
  }
  return { audioFadeIn, audioFadeOut };
}

function audioFadeGain(clip, sourceTime) {
  const { audioFadeIn, audioFadeOut } = audioFadeDurations(clip);
  return clamp(Math.min(
    audioFadeIn ? (sourceTime - clip.start) / audioFadeIn : 1,
    audioFadeOut ? (clip.end - sourceTime) / audioFadeOut : 1
  ), 0, 1);
}

function maxAudioFade(clip, edge, durations) {
  return roundAudioFade(audioFadeLimit(clip) - durations[edge.opposite]);
}

function setAudioFadeDuration(clip, edge, seconds, durations) {
  clip[edge.field] = clamp(roundAudioFade(seconds), 0, maxAudioFade(clip, edge, durations));
  clip[edge.opposite] = durations[edge.opposite];
}

function audioFadeOverlay(clip) {
  return document.querySelector('[data-audio-fades="' + CSS.escape(clip.id) + '"]');
}

function syncAudioFadeControls(clip) {
  const durations = audioFadeDurations(clip);
  audioFadeOverlay(clip)?.updateFades(durations);
  if (active() !== clip) return;
  for (const edge of audioFadeEdges) {
    const input = $(edge.field);
    if (!input) continue;
    input.max = maxAudioFade(clip, edge, durations);
    input.syncValue(durations[edge.field]);
  }
}

function appendAudioFadeInspector(clip, panel) {
  const section = document.createElement('div');
  section.className = 'section';
  const title = document.createElement('h3');
  title.textContent = 'Audio fades';
  section.append(title);
  const durations = audioFadeDurations(clip);
  for (const edge of audioFadeEdges) {
    const input = inspectorSliderField(edge.label + ' (s)', durations[edge.field], 0,
      maxAudioFade(clip, edge, durations), seconds => {
        setAudioFadeDuration(clip, edge, seconds, audioFadeDurations(clip));
        syncAudioFadeControls(clip);
      }, '.01', section);
    input.id = edge.field;
  }
  panel.append(section);
}

function audioFadeHandles(clip, scale) {
  const overlay = document.createElement('div');
  overlay.className = 'audio-fades';
  overlay.dataset.audioFades = clip.id;
  const width = length(clip) * scale;
  const displayWidth = Math.max(4, width);
  const inset = Math.min(7, displayWidth / 2);
  overlay.style.left = clip.at * scale + 'px';
  overlay.style.width = displayWidth + 'px';
  const handles = audioFadeEdges.map(edge => {
    const { field, label, direction } = edge;
    const region = document.createElement('div');
    region.className = 'audio-fade-region';
    region.dataset.edge = direction === 1 ? 'in' : 'out';
    region.setAttribute('aria-hidden', 'true');
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'audio-fade-handle';
    handle.dataset.fade = field;
    const focusHandle = () => audioFadeOverlay(clip)?.querySelector('[data-fade="' + field + '"]')?.focus({ preventScroll: true });
    handle.onpointerdown = event => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      event.stopPropagation();
      handle.focus({ preventScroll: true });
      const before = snapshot();
      const durations = audioFadeDurations(clip);
      const original = { audioFadeIn: clip.audioFadeIn, audioFadeOut: clip.audioFadeOut };
      let value = durations[field];
      if (selected !== clip.id) {
        selected = clip.id;
        inspector();
      }
      const move = next => {
        if (next.pointerId !== event.pointerId) return;
        const delta = (next.clientX - event.clientX) / scale * direction;
        const seconds = clamp(roundAudioFade(durations[field] + delta), 0, maxAudioFade(clip, edge, durations));
        if (seconds === value) return;
        value = seconds;
        if (value === durations[field]) Object.assign(clip, original);
        else setAudioFadeDuration(clip, edge, value, durations);
        syncAudioFadeControls(clip);
        draw(Boolean(playback));
      };
      const end = next => {
        if (next.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        if (clips.includes(clip)) {
          if (next.type === 'pointercancel') Object.assign(clip, original);
          else if (value !== durations[field]) remember(before);
        }
        refresh();
        focusHandle();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    };
    handle.onclick = event => {
      event.stopPropagation();
      if (event.detail !== 0) return;
      selected = clip.id;
      refresh();
      focusHandle();
    };
    handle.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const durations = audioFadeDurations(clip);
      const delta = (event.key === 'ArrowRight' ? direction : -direction) * (event.shiftKey ? .1 : .01);
      const seconds = clamp(roundAudioFade(durations[field] + delta), 0, maxAudioFade(clip, edge, durations));
      if (seconds === durations[field]) return;
      remember();
      selected = clip.id;
      setAudioFadeDuration(clip, edge, seconds, durations);
      refresh();
      focusHandle();
    };
    overlay.append(region, handle);
    return { edge, handle, region };
  });
  overlay.updateFades = durations => {
    const positions = handles.map(({ edge, handle, region }) => {
      const seconds = durations[edge.field];
      const size = seconds * scale;
      const boundary = edge.direction === 1 ? size : width - size;
      const position = clamp(boundary, inset, displayWidth - inset);
      region.style.width = size + 'px';
      handle.style.left = position + 'px';
      const description = edge.label + ' · ' + seconds.toFixed(2) + ' s';
      handle.setAttribute('aria-label', description);
      handle.title = 'Drag to adjust ' + description.toLowerCase();
      return position;
    });
    overlay.classList.toggle('close-handles', positions[1] - positions[0] < 14);
  };
  overlay.updateFades(audioFadeDurations(clip));
  return overlay;
}
