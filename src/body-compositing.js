'use strict';

const bodyCompositeLayers = new WeakMap();
let bodyOutlineTracks = new WeakMap();

function bodyCompositeLayer(frame, name) {
  if (!bodyCompositeLayers.has(frame)) bodyCompositeLayers.set(frame, {});
  const layers = bodyCompositeLayers.get(frame);
  const layer = layers[name] ??= document.createElement('canvas').getContext('2d');
  if (layer.canvas.width !== frame.width || layer.canvas.height !== frame.height) {
    layer.canvas.width = frame.width;
    layer.canvas.height = frame.height;
  }
  layer.clearRect(0, 0, frame.width, frame.height);
  return layer;
}

function projectBodyPoint({ x, y, width, height, pose }, u, v) {
  if (!pose) return [x + u * width, y + v * height];
  const [dx, dy] = rotateOverlayPoint((u - .5) * width * pose.scale, (v - .5) * height * pose.scale, pose.angle);
  return [pose.x + dx, pose.y + dy];
}

function paintBehindBody(target, subject, paint) {
  const layer = bodyCompositeLayer(target.canvas, 'behindBody');
  layer.save();
  paint(layer);
  layer.restore();
  layer.save();
  layer.globalCompositeOperation = 'destination-out';
  const { mask, x, y, width, height } = subject.bodySource ?? subject;
  const pose = subject.bodySource?.pose;
  if (pose) {
    layer.translate(pose.x, pose.y);
    layer.rotate(pose.angle);
    layer.scale(pose.scale, pose.scale);
    layer.drawImage(mask, -width / 2, -height / 2, width, height);
  } else {
    layer.drawImage(mask, x, y, width, height);
  }
  layer.restore();
  target.save();
  target.globalAlpha = 1;
  target.drawImage(layer.canvas, 0, 0);
  target.restore();
}

function handOcclusionPath(body) {
  const hands = bodyDetailDetections(body.media, 'hand');
  if (!hands?.length) return null;
  const path = new Path2D();
  const fingers = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
  for (const hand of hands) {
    const points = hand.map(({ x, y }) => projectBodyPoint(body, x, y));
    const palm = [0, 1, 5, 9, 13, 17];
    // Keep each subpath wound clockwise so overlapping fingers and palms stay opaque.
    const polygon = vertices => {
      const area = vertices.reduce((sum, [x, y], index) => {
        const [nextX, nextY] = vertices[(index + 1) % vertices.length];
        return sum + x * nextY - y * nextX;
      }, 0);
      if (area < 0) vertices.reverse();
      path.moveTo(...vertices[0]);
      for (const point of vertices.slice(1)) path.lineTo(...point);
      path.closePath();
    };
    polygon(palm.map(index => points[index]));
    const width = Math.hypot(points[5][0] - points[17][0], points[5][1] - points[17][1]);
    const capsule = (start, end, radius) => {
      const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
      path.moveTo(start[0] + Math.sin(angle) * radius, start[1] - Math.cos(angle) * radius);
      path.arc(...end, radius, angle - Math.PI / 2, angle + Math.PI / 2);
      path.arc(...start, radius, angle + Math.PI / 2, angle + 3 * Math.PI / 2);
      path.closePath();
    };
    for (const [i, index] of palm.entries()) {
      capsule(points[index], points[palm[(i + 1) % palm.length]], Math.max(1, width * .085));
    }
    for (const finger of fingers) {
      for (let i = 1; i < finger.length; i++) {
        capsule(points[finger[i - 1]], points[finger[i]], Math.max(1, width * (.18 - i * .024)));
      }
    }
  }
  return path;
}

function stableBodyOutlineMask(body) {
  const { visual, media, mask, subjectKey } = body;
  if (!visual || typeof media.currentTime !== 'number' || media.seeking) return mask;
  const at = media.currentTime;
  const frame = Math.round(at * 30);
  const ratio = 176 / Math.max(mask.width, mask.height);
  const w = Math.max(4, Math.round(mask.width * ratio));
  const h = Math.max(4, Math.round(mask.height * ratio));
  let track = bodyOutlineTracks.get(visual);
  const valid = track?.media === media && track.subjectKey === subjectKey && track.w === w && track.h === h;
  const version = personMaskVersions.get(mask);
  if (valid && version !== undefined && track.frame === frame && track.mask === mask && track.version === version) {
    return track.layer.canvas;
  }
  if (!valid) {
    const layer = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    layer.canvas.width = w;
    layer.canvas.height = h;
    track = { layer, media, subjectKey, w, h };
    bodyOutlineTracks.set(visual, track);
  }
  const { layer } = track;
  layer.clearRect(0, 0, w, h);
  layer.filter = 'blur(1.15px)';
  layer.drawImage(mask, 0, 0, w, h);
  layer.filter = 'none';
  const pixels = layer.getImageData(0, 0, w, h);
  const delta = at - track.at;
  if (delta > 0 && delta <= .16) {
    const current = pixels.data;
    const previous = track.pixels.data;
    for (let i = 3; i < current.length; i += 4) {
      // Small edge changes are usually mask noise. Large changes should follow the new silhouette.
      const weight = .55 * Math.max(0, 1 - Math.abs(current[i] - previous[i]) / 192);
      current[i] += (previous[i] - current[i]) * weight;
    }
    layer.putImageData(pixels, 0, 0);
  }
  Object.assign(track, { at, frame, mask, version, pixels });
  personMaskVersions.set(layer.canvas, (personMaskVersions.get(layer.canvas) ?? 0) + 1);
  return layer.canvas;
}

const bodyTrailFrames = new WeakMap();
const bodyTrailRate = 10;

function trailFrameBank(visual) {
  const asset = assets.get(visual.asset);
  if (asset?.type !== 'video') return null;
  const keys = visual.bodySubjectKeys;
  let bank = bodyTrailFrames.get(visual);
  if (bank?.asset !== asset || bank.keys !== keys) {
    bank = { asset, keys, frames: new Map(), tail: Promise.resolve() };
    bodyTrailFrames.set(visual, bank);
  }
  return bank;
}

function trailFrameIndex(visual, at) {
  return Math.max(Math.ceil(visual.start * bodyTrailRate - 1e-6), Math.floor((at + 1e-6) * bodyTrailRate));
}

function trailMediaEvent(media, event, update) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(failed, 8000);
    function finish() {
      clearTimeout(timer);
      media.removeEventListener(event, ready);
      media.removeEventListener('error', failed);
    }
    function ready() {
      finish();
      resolve();
    }
    function failed() {
      finish();
      reject(Error('Could not decode a source frame for motion trails.'));
    }
    media.addEventListener(event, ready);
    media.addEventListener('error', failed);
    update();
  });
}

async function indexTrailFrames(bank, entries, canceled) {
  const media = document.createElement('video');
  media.muted = true;
  media.preload = 'auto';
  try {
    await loadPersonModel();
    if (canceled()) return;
    await trailMediaEvent(media, 'loadeddata', () => { media.src = bank.asset.url; });
    for (const [index, entry] of entries) {
      if (canceled()) break;
      const at = index / bodyTrailRate;
      if (at >= media.duration) { entry.image = null; continue; }
      if (Math.abs(media.currentTime - at) > .0001) {
        await trailMediaEvent(media, 'seeked', () => { media.currentTime = at; });
      }
      // Match against the selected subject reference without advancing the live track.
      const mask = bank.keys?.length ? lockedPersonFor(media, { bodySubjectKeys: bank.keys }, at, false)?.mask
        : personMaskFor(media);
      entry.image = null;
      if (!mask) continue;
      const image = document.createElement('canvas');
      const scale = Math.min(1, 240 / Math.max(media.videoWidth, media.videoHeight));
      image.width = Math.max(1, Math.round(media.videoWidth * scale));
      image.height = Math.max(1, Math.round(media.videoHeight * scale));
      const layer = image.getContext('2d');
      layer.drawImage(media, 0, 0, image.width, image.height);
      layer.globalCompositeOperation = 'destination-in';
      layer.drawImage(mask, 0, 0, image.width, image.height);
      entry.image = image;
    }
  } finally {
    for (const [index, entry] of entries) {
      if (entry.image === undefined) bank.frames.delete(index);
    }
    media.removeAttribute('src');
    media.load();
  }
}

function queueTrailFrames(bank, indices, canceled) {
  const entries = [];
  const pending = new Set();
  for (const index of [...indices].sort((a, b) => a - b)) {
    const frame = bank.frames.get(index);
    if (!frame) {
      const entry = {};
      bank.frames.set(index, entry);
      entries.push([index, entry]);
    } else if (frame.image === undefined) {
      pending.add(frame.job);
    }
  }
  if (entries.length) {
    const job = bank.tail.then(() => indexTrailFrames(bank, entries, canceled));
    bank.tail = job.catch(() => {});
    for (const [, entry] of entries) entry.job = job;
    pending.add(job);
  }
  return pending;
}

function prepareBodyTrails(start, end = start, canceled = () => false) {
  const jobs = new Set();
  const effects = clips.filter(clip => clip.track === 'effect' && isMotionTrail(clip.effect));
  for (const visual of clips) {
    if (visual.track !== 'visual' || visual.at > end || visual.at + length(visual) <= start) continue;
    if (!effects.length && !isMotionTrail(visual.effect)) continue;
    const bank = trailFrameBank(visual);
    if (!bank) continue;
    const first = Math.max(start, visual.at);
    const last = Math.min(end, visual.at + length(visual));
    const indices = new Set();
    for (const effect of [visual, ...effects]) {
      const delays = bodyTrailDelays(effect);
      if (!delays?.[0]) continue;
      const low = Math.max(first, effect.at);
      const high = Math.min(last, effect.at + length(effect));
      if (high < low || (low === high && high >= effect.at + length(effect))) continue;
      for (const delay of delays) {
        const from = visual.start + low - visual.at - delay;
        const to = visual.start + high - visual.at - delay;
        if (to < visual.start) continue;
        const minimum = trailFrameIndex(visual, Math.max(from, visual.start));
        const maximum = trailFrameIndex(visual, to);
        for (let index = minimum; index <= maximum; index++) indices.add(index);
      }
    }
    for (const job of queueTrailFrames(bank, indices, canceled)) jobs.add(job);
  }
  return jobs.size ? Promise.all(jobs) : null;
}

function bodyTrailFrame(body, delay) {
  const { visual } = body;
  const at = visual.start + body.position - visual.at - delay;
  if (at < visual.start - 1e-6) return null;
  const bank = trailFrameBank(visual);
  const index = bank ? trailFrameIndex(visual, at) : null;
  const sourceTime = bank ? index / bodyTrailRate : at;
  if (sourceTime > at + 1e-6 || subjectKeyAt(visual, sourceTime) !== body.subjectKey) return null;
  const image = bank ? bank.frames.get(index)?.image : body.media;
  return image ? { image, at: sourceTime, mask: bank ? null : body.mask } : null;
}
