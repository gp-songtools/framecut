'use strict';

let bodySubjectPicker;

function bodyEffectFootage(clip, position) {
  if (!clip || !subjectEffects.includes(clip.effect)) return null;
  if (clip.track === 'visual') return clip;
  return clips.findLast(item => item.track === 'visual' && layerOnScreen(item, position)) ?? null;
}

function bodySubjectInspector(effectClip) {
  const section = document.createElement('div');
  section.className = 'body-subject-controls';
  const title = document.createElement('h3');
  title.textContent = 'Subject tracking';
  const actions = document.createElement('div');
  actions.className = 'row';
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.textContent = 'Pick subject';
  pick.onclick = () => {
    const visual = bodyEffectFootage(effectClip, previewFramePosition());
    if (!visual) return;
    pause();
    if (bodySubjectPicker?.visual === visual) {
      bodySubjectPicker = null;
      draw();
      return;
    }
    if (!layerOnScreen(visual, previewFramePosition())) seek(visual.at);
    bodySubjectPicker = { visual };
    requestPersonModel();
    draw();
  };
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Use automatic';
  clear.onclick = () => {
    const visual = bodyEffectFootage(effectClip, previewFramePosition());
    if (!visual?.bodySubjectKeys?.length) return;
    remember();
    delete visual.bodySubjectKeys;
    bodySubjectPicker = null;
    refresh();
  };
  const status = document.createElement('p');
  status.className = 'preset-help secondary';
  status.setAttribute('role', 'status');
  actions.append(pick, clear);
  section.append(title, actions, status);
  section.sync = (visual, position, tracking) => {
    const target = bodyEffectFootage(effectClip, position);
    const locked = Boolean(target?.bodySubjectKeys?.length);
    const picking = Boolean(target && bodySubjectPicker?.visual === target);
    pick.disabled = !target;
    clear.disabled = !locked;
    pick.textContent = picking ? 'Cancel' : locked ? 'Correct subject' : 'Pick subject';
    const message = picking ? 'Click the person to follow in the preview.' : !target ? 'Move the playhead over a video or image clip.'
      : !locked ? 'Automatic subject selection.'
      : target !== visual ? 'Subject locked on this clip.'
      : tracking ? 'Following the selected subject.' : 'Subject lost. Correct the track in the preview.';
    if (status.textContent !== message) status.textContent = message;
  };
  return section;
}

function bodySubjectPreviewGeometry(visual, media, position) {
  const fitted = fittedVisualSize(media, canvas);
  if (!fitted) return null;
  const [width, height] = fitted;
  const pose = hasVisualTransform(visual) ? overlayPose(visual, visual.start + position - visual.at, canvas) : null;
  return {
    point(u, v) {
      const x = (u - .5) * width;
      const y = (v - .5) * height;
      if (!pose) return [canvas.width / 2 + x, canvas.height / 2 + y];
      const [dx, dy] = rotateOverlayPoint(x * pose.scale, y * pose.scale, pose.angle);
      return [pose.x + dx, pose.y + dy];
    },
    source(x, y) {
      if (!pose) return [.5 + (x - canvas.width / 2) / width, .5 + (y - canvas.height / 2) / height];
      const [u, v] = rotateOverlayPoint(x - pose.x, y - pose.y, -pose.angle);
      return [.5 + u / (width * pose.scale), .5 + v / (height * pose.scale)];
    }
  };
}

function lockBodySubject(visual, candidate, position) {
  remember();
  const key = { at: Number((visual.start + position - visual.at).toFixed(3)), x: candidate.x, y: candidate.y,
    appearance: candidate.appearance };
  visual.bodySubjectKeys = [...(visual.bodySubjectKeys ?? []).filter(item => Math.abs(item.at - key.at) > .045), key]
    .sort((a, b) => a.at - b.at);
  lockedSubjectTracks.delete(visual);
  bodySubjectPicker = null;
  refresh();
}

function syncBodySubjectPreview(position) {
  const stage = canvas.parentElement;
  const controls = $('bodySubjectTargets');
  const status = $('inspect').querySelector('.body-subject-controls');
  const visual = clips.findLast(clip => clip.track === 'visual' && layerOnScreen(clip, position));
  const media = visual && assets.get(visual.asset)?.media;
  if (bodySubjectPicker && (bodySubjectPicker.visual !== visual || !status || playback || exporting ||
      bodyEffectFootage(active(), position) !== visual)) bodySubjectPicker = null;
  stage.classList.toggle('picking-body-subject', Boolean(bodySubjectPicker));
  const tracking = status && visual?.bodySubjectKeys?.length && media
    ? lockedPersonFor(media, visual, visual.start + position - visual.at) : null;
  status?.sync(visual, position, tracking);
  controls.hidden = !bodySubjectPicker;
  if (!bodySubjectPicker) {
    if (controls.childElementCount) controls.replaceChildren();
    return;
  }
  const instances = personCandidatesFor(media);
  const geo = instances && bodySubjectPreviewGeometry(visual, media, position);
  const candidates = geo ? instances.candidates : [];
  const { left, top, scale } = overlayPreviewMetrics();
  const rect = controls.getBoundingClientRect();
  if (controls.childElementCount !== candidates.length) {
    controls.replaceChildren(...candidates.map((_, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = index + 1;
      button.setAttribute('aria-label', 'Follow person ' + (index + 1));
      return button;
    }));
  }
  candidates.forEach((candidate, index) => {
    const button = controls.children[index];
    const [x, y] = geo.point(candidate.x, candidate.y);
    button.style.left = left - rect.left + x * scale + 'px';
    button.style.top = top - rect.top + y * scale + 'px';
    button.onclick = () => lockBodySubject(visual, candidate, position);
  });
}

function connectBodySubjectPreview() {
  new ResizeObserver(() => {
    if (bodySubjectPicker) syncBodySubjectPreview(previewFramePosition());
  }).observe(canvas.parentElement);
  canvas.parentElement.addEventListener('click', event => {
    const visual = bodySubjectPicker?.visual;
    if (!visual || event.target.closest('#bodySubjectTargets button')) return;
    const media = assets.get(visual.asset)?.media;
    const instances = personCandidatesFor(media);
    const position = previewFramePosition();
    const geo = instances && bodySubjectPreviewGeometry(visual, media, position);
    if (!geo) return;
    const { left, top, scale } = overlayPreviewMetrics();
    if (!scale) return;
    const [u, v] = geo.source((event.clientX - left) / scale, (event.clientY - top) / scale);
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return;
    const ranked = instances.candidates.map(candidate => ({ candidate, distance: Math.hypot(u - candidate.x, v - candidate.y) }))
      .sort((a, b) => a.distance - b.distance);
    const head = ranked[0]?.distance < .065 ? ranked[0].candidate : null;
    const candidate = head ?? ranked.find(({ candidate }) => {
      const mask = subjectInstanceMask(instances, candidate);
      return mask.getContext('2d').getImageData(Math.floor(u * mask.width), Math.floor(v * mask.height), 1, 1).data[3] > 96;
    })?.candidate;
    if (candidate) lockBodySubject(visual, candidate, position);
    else notify('No subject at that point. Try clicking a numbered marker.');
  });
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !bodySubjectPicker) return;
    bodySubjectPicker = null;
    draw();
  });
}
