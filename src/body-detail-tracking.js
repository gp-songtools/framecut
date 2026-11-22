'use strict';

const faceDetailEffects = new Set(['Laser Eyes', 'Red Eyes', 'Ice Breath', 'Angel Halo', 'Big Head', 'Bobblehead',
  'Big Eyes', 'Anime Eyes', 'Pixel Face', 'Emoji Face', 'Glitch Head', '3D Sunglasses', 'Neon Mask']);
const handDetailEffects = new Set(['Lightning Hands', 'Electric Shock']);
const bodyDetailModels = {};
const bodyDetailLoads = {};
const bodyDetailFrames = new WeakMap();
const bodyDetailCrop = document.createElement('canvas');
bodyDetailCrop.width = bodyDetailCrop.height = 256;
const bodyDetailCropContext = bodyDetailCrop.getContext('2d');
let bodyDetailRuntime;

function bodyDetailKind(effect) {
  if (faceDetailEffects.has(effect)) return 'face';
  if (handDetailEffects.has(effect)) return 'hand';
  return null;
}

function loadBodyDetailRuntime() {
  bodyDetailRuntime ??= (async () => {
    const makeUrl = (id, type) => URL.createObjectURL(new Blob([bundledBytes(id)], { type }));
    const moduleUrl = makeUrl('bodyVisionRuntime', 'text/javascript');
    try {
      const vision = await import(moduleUrl);
      return {
        vision,
        files: {
          wasmLoaderPath: makeUrl('bodyVisionWasmLoader', 'text/javascript'),
          wasmBinaryPath: makeUrl('bodyVisionWasmBinary', 'application/wasm')
        }
      };
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  })();
  return bodyDetailRuntime;
}

function loadBodyDetailModel(kind) {
  if (!kind) return Promise.resolve(null);
  bodyDetailLoads[kind] ??= (async () => {
    const { vision, files } = await loadBodyDetailRuntime();
    const face = kind === 'face';
    const model = face ? vision.FaceLandmarker : vision.HandLandmarker;
    const options = face ? { numFaces: 4, minFaceDetectionConfidence: .45, minFacePresenceConfidence: .47 }
      : { numHands: 4, minHandDetectionConfidence: .4, minHandPresenceConfidence: .48 };
    bodyDetailModels[kind] = await model.createFromOptions(files, {
      ...options, runningMode: 'IMAGE', baseOptions: {
        modelAssetBuffer: bundledBytes(face ? 'bodyVisionFace' : 'bodyVisionHand'), delegate: 'CPU'
      }
    });
    if (!exporting) draw(Boolean(playback));
    return bodyDetailModels[kind];
  })().catch(error => {
    notify('Could not start detailed ' + kind + ' tracking. Using the built-in pose tracker.');
    console.warn('Body Effects ' + kind + ' tracking initialization:', error);
    return null;
  });
  return bodyDetailLoads[kind];
}

function bodyDetailDetections(media, kind, region) {
  const model = bodyDetailModels[kind];
  if (!model) return null;
  if (!media || media.seeking || (media.readyState ?? 2) < 2) return [];
  const frame = typeof media.currentTime === 'number' ? Math.floor(media.currentTime * 30) : 'still';
  let cache = bodyDetailFrames.get(media);
  if (cache?.frame !== frame) {
    cache = { frame };
    bodyDetailFrames.set(media, cache);
  }
  const key = region ? kind + ':' + region.join(',') : kind;
  if (cache[key]) return cache[key];
  try {
    if (region) {
      bodyDetailCropContext.clearRect(0, 0, 256, 256);
      bodyDetailCropContext.drawImage(media, ...region, 0, 0, 256, 256);
    }
    const result = model.detect(region ? bodyDetailCrop : media);
    const detected = kind === 'face' ? result.faceLandmarks : result.landmarks;
    if (region) {
      const [x, y, w, h] = region;
      const width = media.videoWidth || media.naturalWidth || media.width;
      const height = media.videoHeight || media.naturalHeight || media.height;
      cache[key] = detected.map(points => points.map(point => ({
        ...point, x: (x + point.x * w) / width, y: (y + point.y * h) / height, z: point.z * w / width
      })));
    } else {
      cache[key] = detected;
    }
  } catch (error) {
    console.warn('Body Effects ' + kind + ' detection:', error);
    cache[key] = [];
  }
  return cache[key];
}

function bodyDetectionRegion(media, center, extent, verticalAnchor = .5) {
  const w = media.videoWidth || media.naturalWidth || media.width;
  const h = media.videoHeight || media.naturalHeight || media.height;
  const side = Math.max(1, Math.round(Math.min(w, h, extent * h)));
  return [Math.round(clamp(center.x * w - side / 2, 0, w - side)),
    Math.round(clamp(center.y * h - side * verticalAnchor, 0, h - side)), side, side];
}

function bodyPointMean(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function faceDetailsFor(body, joints) {
  if (!bodyDetailModels.face) return null;
  const hint = body.identityNose ?? joints.nose;
  if (!hint) return {};
  const aspect = body.width / body.height;
  const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const separation = (a, b) => a && b ? distance(a, b) : 0;
  const eyeGap = separation(joints.leftEye, joints.rightEye);
  const ears = separation(joints.leftEar, joints.rightEar);
  const noseEye = separation(hint, joints.leftEye ?? joints.rightEye);
  const extent = Math.min(.72, Math.max(.28, eyeGap * 4.45, ears * 1.7, noseEye * 4.7));
  const region = bodyDetectionRegion(body.media, hint, extent, .57);
  const neighbors = personMasks.get(body.media)?.instances?.candidates?.filter(candidate =>
    distance(candidate, body.identityNose ?? hint) > .04) ?? [];
  const poseEyes = [joints.leftEye, joints.rightEye].filter(Boolean);
  const choose = faces => {
    const ranked = faces.filter(mesh => mesh.length >= 478).flatMap(mesh => {
      const error = distance(mesh[1], hint);
      if (body.subjectKey && neighbors.some(person => distance(mesh[1], person) + .015 < error)) return [];
      const width = distance(mesh[234], mesh[454]);
      const eyeError = Math.min(...poseEyes.flatMap(eye => [distance(eye, mesh[468]), distance(eye, mesh[473])]));
      const agrees = error <= Math.max(.043, width * .51) ||
        (error <= .105 && eyeError < .043);
      return agrees ? [{ mesh, distance: error }] : [];
    }).sort((a, b) => a.distance - b.distance);
    const best = ranked[0];
    if (!best) return null;
    if (body.subjectKey && ranked[1] && ranked[1].distance - best.distance < .018) return null;
    return best;
  };
  let best = choose(bodyDetailDetections(body.media, 'face', region));
  if (!best && poseEyes.length) {
    const eyeMid = bodyPointMean(poseEyes);
    const ear = [joints.leftEar, joints.rightEar].filter(Boolean).sort((a, b) => b.confidence - a.confidence)[0];
    if (ear?.confidence >= .7) {
      const front = { x: eyeMid.x + (eyeMid.x - ear.x) * .4, y: hint.y };
      const profile = bodyDetectionRegion(body.media, front, Math.max(.32, extent), .58);
      best = choose(bodyDetailDetections(body.media, 'face', profile));
    }
  }
  best ??= choose(bodyDetailDetections(body.media, 'face'));
  if (!best) return {};
  const mesh = best.mesh;
  const windows = [[468, 33, 133, 159, 145], [473, 362, 263, 386, 374]];
  const opening = windows.map(([, a, b, upper, lower]) => ({
    width: distance(mesh[a], mesh[b]),
    height: distance(mesh[upper], mesh[lower])
  }));
  const widest = Math.max(...opening.map(item => item.width));
  const depth = (mesh[468].z - mesh[473].z) * aspect;
  const rearEye = Math.abs(depth) > widest * 1.72 ? (depth > 0 ? 0 : 1) : -1;
  const eyes = windows.flatMap(([iris, a, b, upper, lower], index) => {
    const eye = opening[index];
    if (eye.width < Math.max(.008, widest * .47) || eye.height < eye.width * .085) return [];
    if (index === rearEye && eye.width < widest * .62) return [];
    const center = bodyPointMean([mesh[a], mesh[b], mesh[upper], mesh[lower]]);
    if (distance(center, mesh[iris]) > eye.width * .62) return [];
    return [{ center, pupil: mesh[iris] }];
  });
  return { eyes, nose: mesh[1], mouth: bodyPointMean([mesh[13], mesh[14]]),
    crown: mesh[10], head: bodyPointMean([mesh[10], mesh[152]]) };
}

function handDetailsFor(body, joints) {
  const hands = bodyDetailDetections(body.media, 'hand');
  if (!hands) return null;
  const aspect = body.width / body.height;
  const distance = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  const wrists = ['left', 'right'].flatMap(side => {
    const wrist = joints[side + 'Wrist'];
    return wrist ? [{ wrist, elbow: joints[side + 'Elbow'] }] : [];
  });
  const candidates = personMasks.get(body.media)?.instances?.candidates;
  const neighbors = body.identityNose && candidates ? candidates.filter(item => distance(item, body.identityNose) > .042) : [];
  const others = neighbors.flatMap(item => [item.pose.leftWrist, item.pose.rightWrist].filter(Boolean));
  const insideMask = point => {
    const mask = body.mask;
    const x = Math.round(clamp(point.x * mask.width, 0, mask.width - 1));
    const y = Math.round(clamp(point.y * mask.height, 0, mask.height - 1));
    return mask.getContext('2d').getImageData(x, y, 1, 1).data[3] >= 90;
  };
  const matches = [];
  const trackHand = (points, index, allowedSide) => {
    if (points.length < 21) return;
    const wrist = points[0];
    const palm = bodyPointMean([wrist, points[5], points[9], points[13], points[17]]);
    if (neighbors.length && !insideMask(wrist) && !insideMask(palm)) return;
    for (const [side, anchor] of wrists.entries()) {
      if (allowedSide !== undefined && allowedSide !== side) continue;
      const error = distance(wrist, anchor.wrist);
      const forearm = anchor.elbow ? distance(anchor.elbow, anchor.wrist) : 0;
      let limit = Math.max(.045, Math.min(.125, forearm * .49 + distance(wrist, palm) * .55));
      if (anchor.elbow && !neighbors.length && hands.length <= wrists.length) {
        const ax = (anchor.wrist.x - anchor.elbow.x) * aspect, ay = anchor.wrist.y - anchor.elbow.y;
        const bx = (wrist.x - anchor.elbow.x) * aspect, by = wrist.y - anchor.elbow.y;
        const alignment = (ax * bx + ay * by) / Math.max(.0001, forearm * Math.hypot(bx, by));
        if (alignment > .74) limit = Math.max(limit, Math.min(.167, forearm * 1.02 + .035));
      }
      if (error > limit || others.some(other => distance(wrist, other) + .023 < error)) continue;
      matches.push({ index, side, error, wrist, palm, elbow: anchor.elbow });
    }
  };
  for (const [index, points] of hands.entries()) trackHand(points, index);
  for (const [side, anchor] of wrists.entries()) {
    if (matches.some(match => match.side === side)) continue;
    const extent = Math.max(.16, Math.min(.42, anchor.elbow ? distance(anchor.elbow, anchor.wrist) * 1.5 : .24));
    const region = bodyDetectionRegion(body.media, anchor.wrist, extent);
    for (const [index, points] of bodyDetailDetections(body.media, 'hand', region).entries()) {
      if (matches.some(match => distance(match.wrist, points[0]) < .028)) continue;
      trackHand(points, hands.length + side * 4 + index, side);
    }
  }
  const used = new Set();
  const assigned = new Set();
  return matches.sort((a, b) => a.error - b.error).filter(match => {
    if (used.has(match.index) || assigned.has(match.side)) return false;
    used.add(match.index);
    assigned.add(match.side);
    return true;
  });
}
