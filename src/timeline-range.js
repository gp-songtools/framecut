'use strict';

const minimumTimelineRange = .05;
let timelineRange = null;
let previewLoopEnabled = false;
let rangeToolArmed = false;
let rangeDrag = null;
let rangeClickPointer = null;

function fittedTimelineRange(range) {
  if (!range) return null;
  const end = Math.min(range.end, duration());
  if (end - range.start < minimumTimelineRange - 1e-9) return null;
  return end === range.end ? range : { ...range, end };
}

function activePreviewLoop() {
  return previewLoopEnabled && !exporting ? fittedTimelineRange(timelineRange) : null;
}

function rangeContains(range, position) {
  return position >= range.start && position < range.end;
}

function syncTimelineRange() {
  const selected = fittedTimelineRange(timelineRange);
  const range = rangeDrag?.draft ?? selected;
  const band = $('timelineRange');
  const rangeTool = $('rangeTool');
  const loop = $('loopRange');
  const summary = $('rangeBounds');
  $('lanes').classList.toggle('range-tool', rangeToolArmed || Boolean(rangeDrag));
  rangeTool.disabled = !duration();
  rangeTool.setAttribute('aria-pressed', rangeToolArmed);
  loop.disabled = !selected;
  loop.setAttribute('aria-pressed', Boolean(selected && previewLoopEnabled));
  $('clearRange').hidden = !selected;
  summary.hidden = !selected;
  const bounds = selected ? formatTime(selected.start) + ' – ' + formatTime(selected.end) : '';
  if (summary.textContent !== bounds) summary.textContent = bounds;
  band.hidden = !range;
  if (!range) return;
  const lane = range.track && $('lanes').querySelector('[data-track="' + range.track + '"]');
  band.style.left = range.start * zoom() + 'px';
  band.style.width = (range.end - range.start) * zoom() + 'px';
  band.style.setProperty('--range-lane-top', (lane?.offsetTop ?? 0) + 'px');
  band.style.setProperty('--range-lane-height', (lane?.offsetHeight ?? 0) + 'px');
  band.classList.toggle('looping', Boolean(rangeDrag || previewLoopEnabled));
}

function reconcileTimelineRange() {
  timelineRange = fittedTimelineRange(timelineRange);
  if (!timelineRange) previewLoopEnabled = false;
  if (!duration()) rangeToolArmed = false;
}

function setTimelineRange(range, cue) {
  const selection = fittedTimelineRange(range);
  if (!selection) return false;
  timelineRange = selection;
  previewLoopEnabled = true;
  rangeToolArmed = false;
  if (cue) seek(selection.start);
  else if (playback && !rangeContains(selection, time)) seek(selection.start);
  syncTimelineRange();
  return true;
}

function clearTimelineRange() {
  if (rangeDrag) finishRangeDrag(false);
  timelineRange = null;
  previewLoopEnabled = false;
  rangeToolArmed = false;
  syncTimelineRange();
}

function markTimelineRange(boundary) {
  const previous = fittedTimelineRange(timelineRange);
  const end = duration();
  const range = boundary === 'start'
    ? { start: time, end: previous?.end > time ? previous.end : end }
    : { start: previous?.start < time ? previous.start : 0, end: time };
  const clip = active();
  setTimelineRange({ ...range, track: previous?.track ?? (clip ? timelineTrack(clip) : null) }, false);
}

function timelineRangeTime(clientX, targets) {
  const scale = zoom();
  const raw = clamp((clientX - $('lanes').getBoundingClientRect().left) / scale, 0, duration());
  let distance = 8 / scale;
  let point = clamp(Math.round(raw * 100) / 100, 0, duration());
  if ($('snap').getAttribute('aria-pressed') === 'true') {
    for (const target of targets) {
      const gap = Math.abs(raw - target);
      if (gap > distance) continue;
      point = target;
      distance = gap;
    }
  }
  return point;
}

function paintRangeDrag(drag) {
  const viewport = $('scroll').getBoundingClientRect();
  const end = timelineRangeTime(clamp(drag.x, viewport.left, viewport.right), drag.targets);
  drag.draft = { start: Math.min(drag.start, end), end: Math.max(drag.start, end), track: drag.track };
  syncTimelineRange();
}

function scrollRangeDrag() {
  if (!rangeDrag) return;
  const scroll = $('scroll');
  const { left, right } = scroll.getBoundingClientRect();
  const dx = rangeDrag.x < left + 22 ? rangeDrag.x - left - 22
    : rangeDrag.x > right - 22 ? rangeDrag.x - right + 22 : 0;
  const before = scroll.scrollLeft;
  scroll.scrollLeft += clamp(dx * .5, -26, 26);
  rangeDrag.frame = 0;
  if (scroll.scrollLeft === before) return;
  paintRangeDrag(rangeDrag);
  rangeDrag.frame = requestAnimationFrame(scrollRangeDrag);
}

function finishRangeDrag(commit) {
  const drag = rangeDrag;
  if (!drag) return;
  rangeDrag = null;
  cancelAnimationFrame(drag.frame);
  if (commit && setTimelineRange(drag.draft, true)) {
    if (document.activeElement === $('rangeTool')) $('play').focus({ preventScroll: true });
  } else syncTimelineRange();
}

function connectTimelineRange() {
  const lanes = $('lanes');
  $('rangeTool').onclick = () => {
    rangeToolArmed = !rangeToolArmed;
    syncTimelineRange();
  };
  $('loopRange').onclick = () => {
    const range = fittedTimelineRange(timelineRange);
    if (!range) return;
    previewLoopEnabled = !previewLoopEnabled;
    if (previewLoopEnabled && playback && !rangeContains(range, time)) seek(range.start);
    syncTimelineRange();
  };
  $('clearRange').onclick = () => {
    clearTimelineRange();
    $('rangeTool').focus({ preventScroll: true });
  };
  lanes.addEventListener('pointerdown', event => {
    if ((!rangeToolArmed && !event.shiftKey) || event.button !== 0 || rangeDrag || !duration()) return;
    const lane = event.target.closest('.lane, #ruler');
    if (!lane) return;
    event.preventDefault();
    event.stopPropagation();
    rangeClickPointer = event.pointerId;
    pause();
    const track = lane.dataset.track ?? null;
    const targets = [0, time, duration()];
    for (const clip of clips) {
      if (!track || timelineTrack(clip) === track) targets.push(clip.at, clip.at + length(clip));
    }
    const x = event.clientX;
    const start = timelineRangeTime(x, targets);
    rangeDrag = { pointer: event.pointerId, start, x, track, targets, frame: 0 };
    paintRangeDrag(rangeDrag);
  }, true);
  window.addEventListener('pointermove', event => {
    if (event.pointerId !== rangeDrag?.pointer) return;
    rangeDrag.x = event.clientX;
    paintRangeDrag(rangeDrag);
    if (!rangeDrag.frame) rangeDrag.frame = requestAnimationFrame(scrollRangeDrag);
  });
  window.addEventListener('pointerup', event => {
    if (event.pointerId !== rangeDrag?.pointer) return;
    rangeDrag.x = event.clientX;
    paintRangeDrag(rangeDrag);
    finishRangeDrag(true);
  });
  window.addEventListener('pointercancel', event => {
    if (event.pointerId === rangeDrag?.pointer) finishRangeDrag(false);
  });
  window.addEventListener('blur', () => finishRangeDrag(false));
  window.addEventListener('pointerdown', event => {
    if (event.pointerId === rangeClickPointer) rangeClickPointer = null;
  }, true);
  window.addEventListener('click', event => {
    if (rangeClickPointer === null || !event.detail || (event.pointerId != null && event.pointerId !== rangeClickPointer)) return;
    rangeClickPointer = null;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || (!rangeDrag && !rangeToolArmed)) return;
    rangeToolArmed = false;
    if (rangeDrag) finishRangeDrag(false);
    else syncTimelineRange();
  });
}
