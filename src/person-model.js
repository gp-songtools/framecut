'use strict';

let personModel;
let personModelPromise;
const personMasks = new WeakMap();
const personMaskVersions = new WeakMap();
const personInputSize = 193;
const personInput = document.createElement('canvas');
personInput.width = personInput.height = personInputSize;
const personInputContext = personInput.getContext('2d', { willReadFrequently: true });

function bundledBytes(id) {
  return Uint8Array.from(atob(document.getElementById(id).textContent.trim()), char => char.charCodeAt(0));
}

async function loadBundledScript(id) {
  const url = URL.createObjectURL(new Blob([bundledBytes(id)], { type: 'text/javascript' }));
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load the bundled TensorFlow.js runtime.'));
      document.head.append(script);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadPersonModel() {
  personModelPromise ??= (async () => {
    await loadBundledScript('personRuntime');
    await loadBundledScript('personWasmRuntime');
    const urls = Object.fromEntries(['', '-simd', '-threaded-simd'].map((variant, index) => [
      'tfjs-backend-wasm' + variant + '.wasm',
      URL.createObjectURL(new Blob([bundledBytes('personWasm' + index)], { type: 'application/wasm' }))
    ]));
    try {
      tf.wasm.setWasmPaths(urls);
      tf.wasm.setThreadsCount(1);
      if (!await tf.setBackend('wasm')) await tf.setBackend('cpu');
    } finally {
      Object.values(urls).forEach(url => URL.revokeObjectURL(url));
    }
    const { weightsManifest, ...graph } = JSON.parse(document.getElementById('personGraph').textContent);
    personModel = await tf.loadGraphModel(tf.io.fromMemory({
      ...graph,
      weightSpecs: weightsManifest.flatMap(group => group.weights),
      weightData: bundledBytes('personWeights').buffer
    }));
    return personModel;
  })();
  return personModelPromise;
}

const bodyPoseKeypoints = {
  nose: 0, leftEye: 1, rightEye: 2, leftEar: 3, rightEar: 4, leftShoulder: 5, rightShoulder: 6,
  leftElbow: 7, rightElbow: 8, leftWrist: 9, rightWrist: 10, leftHip: 11, rightHip: 12,
  leftKnee: 13, rightKnee: 14, leftAnkle: 15, rightAnkle: 16
};

const poseParents = {
  leftEye: ['nose', 0], leftEar: ['leftEye', 1], rightEye: ['nose', 2], rightEar: ['rightEye', 3],
  leftShoulder: ['nose', 4], leftElbow: ['leftShoulder', 5], leftWrist: ['leftElbow', 6],
  leftHip: ['leftShoulder', 7], leftKnee: ['leftHip', 8], leftAnkle: ['leftKnee', 9],
  rightShoulder: ['nose', 10], rightElbow: ['rightShoulder', 11], rightWrist: ['rightElbow', 12],
  rightHip: ['rightShoulder', 13], rightKnee: ['rightHip', 14], rightAnkle: ['rightKnee', 15]
};

function decodePersonPose(heatmap, offsets, left, top, width, height, mask, forward, previousNose, root, inputSize = personInputSize) {
  const [, rows, columns, channels] = heatmap.shape;
  const scores = heatmap.sigmoid().dataSync();
  const deltas = offsets.dataSync();
  const stride = (inputSize - 1) / (rows - 1);
  const pose = { ...root?.points };
  const displacements = forward?.dataSync();
  const names = displacements ? ['nose', ...Object.keys(poseParents)] : Object.keys(bodyPoseKeypoints);
  for (const name of names) {
    if (name === 'nose' && root) {
      pose.nose = { x: root.x, y: root.y, confidence: root.confidence };
      continue;
    }
    if (pose[name]) continue;
    const joint = bodyPoseKeypoints[name];
    let predicted;
    if (displacements && name !== 'nose') {
      const [parentName, edge] = poseParents[name];
      const parent = pose[parentName];
      if (!parent) continue;
      const sx = parent.x * width + left, sy = parent.y * height + top;
      const cell = Math.min(rows - 1, Math.max(0, Math.round(sy / stride))) * columns +
        Math.min(columns - 1, Math.max(0, Math.round(sx / stride)));
      predicted = [sx + displacements[cell * 32 + 16 + edge], sy + displacements[cell * 32 + edge]];
    }
    let best = 0;
    for (let i = joint; i < scores.length; i += channels) {
      if (scores[i] < .31) continue;
      const cell = Math.floor(i / channels);
      const px = (cell % columns) * stride + deltas[cell * channels * 2 + channels + joint];
      const py = Math.floor(cell / columns) * stride + deltas[cell * channels * 2 + joint];
      const x = (px - left) / width;
      const y = (py - top) / height;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      const support = mask?.[Math.round(py) * inputSize + Math.round(px)] ?? 1;
      const distance = predicted ? Math.hypot(px - predicted[0], py - predicted[1]) : 0;
      const tolerance = ['leftEye', 'rightEye', 'leftEar', 'rightEar'].includes(name) ? stride * 1.22 : stride * 1.85;
      if (predicted && distance > tolerance * 1.55) continue;
      const continuity = name === 'nose' && previousNose
        ? .62 + .38 * Math.exp(-((x - previousNose.x) ** 2 + (y - previousNose.y) ** 2) / .016) : 1;
      const score = scores[i] * (.44 + .56 * support) * Math.exp(-.5 * (distance / tolerance) ** 2) * continuity;
      if (score <= best) continue;
      best = score;
      pose[name] = { x, y, confidence: scores[i] };
    }
  }
  return pose;
}

function rejectSplitEyePair(pose, width, height) {
  const { leftEye, rightEye, nose } = pose;
  if (!leftEye || !rightEye || !nose) return;
  const separation = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const left = separation(leftEye, nose), right = separation(rightEye, nose);
  const vertical = Math.max(10, Math.min(Math.abs(leftEye.y - nose.y), Math.abs(rightEye.y - nose.y)) * height);
  if (separation(leftEye, rightEye) > Math.max(Math.min(width, height) * .075, vertical * 3.2) &&
      Math.max(left, right) > Math.min(left, right) * 1.28) {
    delete pose[left > right ? 'leftEye' : 'rightEye'];
  }
}

function refinePersonFace(media, pose, width, height) {
  const center = pose.nose ?? pose.leftEye ?? pose.rightEye;
  if (!center) return;
  const separation = (a, b) => a && b ? Math.hypot((a.x - b.x) * width, (a.y - b.y) * height) : 0;
  const eyeGap = separation(pose.leftEye, pose.rightEye);
  const shoulders = separation(pose.leftShoulder, pose.rightShoulder);
  const singleEye = separation(center, pose.leftEye ?? pose.rightEye);
  const extent = eyeGap ? Math.max(28, eyeGap * 6.4, shoulders * 1.7)
    : Math.max(72, singleEye * 5, Math.min(shoulders * 1.45, 140));
  const size = Math.min(width, height, extent);
  if (size >= Math.max(width, height) * .9) return;
  const x = Math.max(0, Math.min(width - size, center.x * width - size / 2));
  const y = Math.max(0, Math.min(height - size, center.y * height - size * .36));
  if (personInput.width !== personInputSize) personInput.width = personInput.height = personInputSize;
  personInputContext.fillStyle = '#000';
  personInputContext.fillRect(0, 0, personInputSize, personInputSize);
  personInputContext.drawImage(media, x, y, size, size, 0, 0, personInputSize, personInputSize);
  const face = tf.tidy(() => {
    const input = tf.browser.fromPixels(personInput).toFloat().div(127.5).sub(1).expandDims(0);
    const [heatmap, offsets] = personModel.execute(input, ['float_heatmaps', 'float_short_offsets']);
    return decodePersonPose(heatmap, offsets, 0, 0, personInputSize, personInputSize);
  });
  for (const name of ['leftEye', 'rightEye', 'nose', 'leftEar', 'rightEar']) {
    const point = face[name];
    if (!point || point.confidence < .45) continue;
    const px = x + point.x * size;
    const py = y + point.y * size;
    const prior = pose[name] ?? center;
    if (Math.hypot(px - prior.x * width, py - prior.y * height) > size * (pose[name] ? .16 : .22)) continue;
    pose[name] = { x: px / width, y: py / height, confidence: point.confidence };
  }
}

function stabilizePersonPose(pose, previous, delta) {
  if (!previous || !(delta > 0 && delta <= .12)) return;
  for (const [name, point] of Object.entries(pose)) {
    const prior = previous[name];
    if (!prior) continue;
    const movement = Math.hypot(point.x - prior.x, point.y - prior.y);
    const follow = Math.min(1, .58 + movement * 11);
    point.x = prior.x + (point.x - prior.x) * follow;
    point.y = prior.y + (point.y - prior.y) * follow;
  }
}

const eyeSample = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

function refineEyeOrigins(media, pose, width, height) {
  const a = pose.leftEye;
  const b = pose.rightEye;
  const visible = a ?? b;
  const gap = a && b ? Math.hypot((a.x - b.x) * width, (a.y - b.y) * height)
    : visible && pose.nose ? 1.6 * Math.hypot((visible.x - pose.nose.x) * width, (visible.y - pose.nose.y) * height) : 0;
  if (gap < 12) return;
  const dx = Math.max(2, Math.round(gap * .12));
  const dy = Math.max(2, Math.round(gap * .075));
  const pad = Math.max(3, Math.round(gap * .09));
  const w = (dx + pad) * 2 + 1;
  const h = (dy + pad) * 2 + 1;
  eyeSample.canvas.width = w;
  eyeSample.canvas.height = h;
  for (const eye of [a, b].filter(Boolean)) {
    const left = Math.round(eye.x * width) - dx - pad;
    const top = Math.round(eye.y * height) - dy - pad;
    if (left < 0 || top < 0 || left + w > width || top + h > height) continue;
    eyeSample.clearRect(0, 0, w, h);
    eyeSample.drawImage(media, left, top, w, h, 0, 0, w, h);
    const { data } = eyeSample.getImageData(0, 0, w, h);
    const luma = (x, y) => {
      const i = (y * w + x) * 4;
      return data[i] * .21 + data[i + 1] * .72 + data[i + 2] * .07;
    };
    const radius = Math.max(1, Math.round(pad * .35));
    let best = 4;
    for (let y = -dy; y <= dy; y++) {
      for (let x = -dx; x <= dx; x++) {
        const px = dx + pad + x, py = dy + pad + y;
        const value = (luma(px, py) * 2 + luma(px - radius, py) + luma(px + radius, py) +
          luma(px, py - radius) + luma(px, py + radius)) / 6;
        const sides = (luma(px - pad, py) + luma(px + pad, py)) / 2;
        const score = sides - value - 5 * ((x / dx) ** 2 + (y / dy) ** 2);
        if (score <= best) continue;
        best = score;
        eye.pupil = { x: (left + px + .5) / width, y: (top + py + .5) / height };
      }
    }
  }
}

function personMaskFor(media, withPose = false, withInstances = false) {
  if (!personModel) return null;
  const width = media.videoWidth || media.naturalWidth || media.width;
  const height = media.videoHeight || media.naturalHeight || media.height;
  if (!width || !height) return null;
  let cached = personMasks.get(media);
  if (!cached) {
    const canvas = document.createElement('canvas');
    cached = { context: canvas.getContext('2d'), frame: undefined, found: false };
    personMasks.set(media, cached);
  }
  const frame = typeof media.currentTime === 'number' ? Math.floor(media.currentTime * 30) : 'still';
  if ((cached.frame === frame && (!withPose || cached.pose) && (!withInstances || cached.instances)) || media.seeking) {
    return cached.found ? cached.context.canvas : null;
  }

  const inputSize = withInstances ? 321 : personInputSize;
  if (personInput.width !== inputSize) personInput.width = personInput.height = inputSize;
  const scale = inputSize / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const left = Math.floor((inputSize - w) / 2);
  const top = Math.floor((inputSize - h) / 2);
  personInputContext.fillStyle = '#000';
  personInputContext.fillRect(0, 0, inputSize, inputSize);
  personInputContext.drawImage(media, left, top, w, h);

  // Request pose outputs only for effects that use landmarks.
  const { values, pose, instances } = tf.tidy(() => {
    const input = tf.browser.fromPixels(personInput).toFloat().div(127.5).sub(1).expandDims(0);
    const names = ['float_segments'];
    if (withPose || withInstances) names.push('float_heatmaps', 'float_short_offsets', 'MobilenetV1/displacement_fwd_2/BiasAdd');
    if (withInstances) names.push('float_long_offsets', 'MobilenetV1/displacement_bwd_2/BiasAdd');
    const [segments, heatmap, offsets, forward, longOffsets, backward] = names.length === 1
      ? [personModel.execute(input, names[0])] : personModel.execute(input, names);
    const values = tf.image.resizeBilinear(segments.squeeze([0]), [inputSize, inputSize], true).sigmoid().dataSync();
    const contiguous = typeof frame === 'number' && frame > cached.frame && frame - cached.frame <= 4;
    return {
      values,
      pose: withPose ? decodePersonPose(heatmap, offsets, left, top, w, h, values, forward,
        contiguous ? cached.pose?.nose : null, null, inputSize) : null,
      instances: withInstances ? decodeSubjectInstances(heatmap, offsets, forward, backward, longOffsets,
        values, left, top, w, h, inputSize) : null
    };
  });
  if (pose) {
    rejectSplitEyePair(pose, width, height);
    refinePersonFace(media, pose, width, height);
    rejectSplitEyePair(pose, width, height);
    stabilizePersonPose(pose, cached.pose, (frame - cached.frame) / 30);
    refineEyeOrigins(media, pose, width, height);
  }
  const output = cached.context;
  if (output.canvas.width !== w || output.canvas.height !== h) {
    output.canvas.width = w;
    output.canvas.height = h;
  }
  const image = output.createImageData(w, h);
  let coverage = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const probability = values[(y + top) * inputSize + x + left];
      const alpha = Math.max(0, Math.min(1, (probability - .41) / .22));
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
      coverage += alpha;
    }
  }
  const sameFrame = cached.frame === frame;
  cached.pose = pose ?? (sameFrame ? cached.pose : null);
  cached.instances = instances ?? (sameFrame ? cached.instances : null);
  cached.frame = frame;
  cached.found = coverage >= Math.max(8, w * h * .002);
  output.putImageData(image, 0, 0);
  personMaskVersions.set(output.canvas, (personMaskVersions.get(output.canvas) ?? 0) + 1);
  return cached.found ? output.canvas : null;
}

function personPoseFor(media) {
  return personMasks.get(media)?.pose;
}

function decodeSubjectInstances(heatmap, offsets, forward, backward, longOffsets, values, left, top, width, height, inputSize) {
  const [, rows, columns, channels] = heatmap.shape;
  const stride = (inputSize - 1) / (rows - 1);
  const scores = heatmap.sigmoid().dataSync();
  const deltas = offsets.dataSync();
  const reverse = backward.dataSync();
  const peaks = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const cell = y * columns + x;
      for (const joint of [0, 1, 2]) {
        const i = cell * channels + joint;
        if (scores[i] < (joint ? .68 : .36)) continue;
        let peak = true;
        for (let row = Math.max(0, y - 1); row <= Math.min(rows - 1, y + 1); row++) {
          for (let col = Math.max(0, x - 1); col <= Math.min(columns - 1, x + 1); col++) {
            if (scores[(row * columns + col) * channels + joint] > scores[i]) peak = false;
          }
        }
        if (!peak) continue;
        const ex = x * stride + deltas[i * 2 - joint + channels];
        const ey = y * stride + deltas[i * 2 - joint];
        const edge = joint === 2 ? 2 : 0;
        const px = ex + (joint ? reverse[cell * 32 + 16 + edge] : 0);
        const py = ey + (joint ? reverse[cell * 32 + edge] : 0);
        const u = (px - left) / width;
        const v = (py - top) / height;
        if (u < 0 || u > 1 || v < 0 || v > 1 ||
            (values[Math.round(py) * inputSize + Math.round(px)] ?? 0) < .35) continue;
        const eye = joint ? {
          [joint === 1 ? 'leftEye' : 'rightEye']: { x: (ex - left) / width, y: (ey - top) / height, confidence: scores[i] }
        } : undefined;
        peaks.push({ x: u, y: v, confidence: scores[i] * (joint ? .88 : 1), points: eye });
      }
    }
  }
  peaks.sort((a, b) => b.confidence - a.confidence);
  const poses = [];
  for (const nose of peaks) {
    if (poses.some(pose => Math.hypot((pose.nose.x - nose.x) * width, (pose.nose.y - nose.y) * height) < inputSize * .045)) continue;
    const pose = decodePersonPose(heatmap, offsets, left, top, width, height, values, forward, null, nose, inputSize);
    rejectSplitEyePair(pose, width, height);
    if (Object.keys(pose).length < 4 || (!pose.leftEye && !pose.rightEye)) continue;
    if (poses.some(other => ['leftEye', 'rightEye'].some(name => {
      const a = pose[name], b = other[name];
      return a && b && Math.hypot((a.x - b.x) * width, (a.y - b.y) * height) < inputSize * .025;
    }))) continue;
    poses.push(pose);
    if (poses.length === 5) break;
  }
  return { poses, offsets: longOffsets.dataSync(), stride, rows, columns, width, height, left, top, values, inputSize };
}

const lockedSubjectTracks = new WeakMap();
const subjectColors = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
subjectColors.canvas.width = subjectColors.canvas.height = 30;

function subjectAppearance(media, pose, width, height) {
  const eyeGap = pose.leftEye && pose.rightEye
    ? Math.hypot((pose.leftEye.x - pose.rightEye.x) * width, (pose.leftEye.y - pose.rightEye.y) * height) : 0;
  const earGap = pose.leftEar && pose.rightEar ? Math.abs(pose.leftEar.x - pose.rightEar.x) * width : 0;
  const eye = pose.leftEye ?? pose.rightEye;
  const noseEye = eye ? Math.hypot((eye.x - pose.nose.x) * width, (eye.y - pose.nose.y) * height) : 0;
  const extent = Math.max(12, Math.min(Math.min(width, height) * .2, Math.max(eyeGap * 1.7, earGap * .85, noseEye * 2.2)));
  subjectColors.clearRect(0, 0, 30, 30);
  subjectColors.drawImage(media, pose.nose.x * width - extent * .7, pose.nose.y * height - extent,
    extent * 1.4, extent * 1.32, 0, 0, 30, 30);
  const data = subjectColors.getImageData(0, 0, 30, 30).data;
  const bins = Array(32).fill(0);
  let count = 0;
  for (let y = 2; y < 29; y++) {
    for (let x = 2; x < 28; x++) {
      if (((x - 15) / 13) ** 2 + ((y - 16) / 14) ** 2 > 1) continue;
      const i = (y * 30 + x) * 4;
      const light = .22 * data[i] + .70 * data[i + 1] + .08 * data[i + 2];
      const warm = Math.max(0, Math.min(3, Math.floor((data[i] - data[i + 2] + 35) / 28)));
      bins[Math.min(7, Math.floor(light / 32)) * 4 + warm]++;
      count++;
    }
  }
  return bins.map(bin => bin / count);
}

function personCandidatesFor(media) {
  if (!media || media.seeking || (media.readyState ?? 2) < 2 || !personMaskFor(media, false, true)) return null;
  const cache = personMasks.get(media);
  const instances = cache.instances;
  if (!instances.candidates) {
    const w = media.videoWidth || media.naturalWidth || media.width;
    const h = media.videoHeight || media.naturalHeight || media.height;
    instances.candidates = instances.poses.map(pose => ({
      x: pose.nose.x, y: pose.nose.y, pose, appearance: subjectAppearance(media, pose, w, h)
    }));
  }
  return instances;
}

function partitionSubjectPixels(instances) {
  const { candidates, offsets, stride, columns, rows, width, height, left, top, values, inputSize } = instances;
  const jointNames = ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar'];
  const joints = jointNames.filter(name => candidates.every(candidate => candidate.pose[name]));
  const keys = joints.length ? joints : ['nose'];
  const targets = candidates.map(candidate => keys.map(name => {
    const point = candidate.pose[name];
    return [point.x * width + left, point.y * height + top];
  }));
  const cell = (x, y) => (Math.max(0, Math.min(rows - 1, Math.round(y / stride))) * columns +
    Math.max(0, Math.min(columns - 1, Math.round(x / stride)))) * 34;
  const trunks = candidates.map(({ pose, x }) => {
    const shoulders = [pose.leftShoulder, pose.rightShoulder].filter(Boolean);
    const mean = shoulders.reduce((value, point) => value + point.x, 0) / (shoulders.length || 1);
    return shoulders.length ? clampSubjectOffset((mean - x) * width, inputSize * .055) : 0;
  });
  let labels = new Int8Array(width * height).fill(-1);
  const distances = new Float32Array(targets.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + left, py = y + top;
      const probability = values[py * inputSize + px];
      if (probability <= .41) continue;
      const origin = cell(px, py);
      distances.fill(0);
      for (const [index, name] of keys.entries()) {
        const joint = bodyPoseKeypoints[name];
        let kx = px + offsets[origin + 17 + joint], ky = py + offsets[origin + joint];
        for (let step = 0; step < 3; step++) {
          const next = cell(kx, ky);
          kx += offsets[next + 17 + joint];
          ky += offsets[next + joint];
        }
        for (let p = 0; p < targets.length; p++) {
          distances[p] += Math.hypot(kx - targets[p][index][0], ky - targets[p][index][1]);
        }
      }
      let winner = -1;
      let best = Infinity;
      for (let p = 0; p < targets.length; p++) {
        const [nx, ny] = targets[p][0];
        const torso = Math.max(0, Math.min(.7, (py - ny) / (height * .39)));
        const dx = Math.abs(px - nx - trunks[p] * torso);
        const dy = Math.max(0, ny - py - height * .1);
        const geometry = dx + dy * .36;
        const embedding = distances[p] / keys.length;
        if (targets.length === 1 && geometry > inputSize * .24 && embedding > inputSize * .18) continue;
        const head = Math.abs(py - ny) < height * .16;
        const score = geometry + Math.min(embedding, inputSize * .13) * (head ? .12 : .47);
        if (score < best) {
          best = score;
          winner = p;
        }
      }
      labels[y * width + x] = winner;
    }
  }
  // Stabilize block boundaries from the coarse offset grid without expanding the foreground.
  const votes = new Uint8Array(candidates.length);
  for (let pass = 0; pass < 2; pass++) {
    const smoothed = labels.slice();
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const pixel = y * width + x;
        if (values[(y + top) * inputSize + x + left] <= .41) continue;
        votes.fill(0);
        let total = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const near = labels[pixel + dy * width + dx];
            if (near >= 0) { votes[near]++; total++; }
          }
        }
        const winner = votes.indexOf(Math.max(...votes));
        if (total >= 8 && votes[winner] > total * .63) smoothed[pixel] = winner;
      }
    }
    labels = smoothed;
  }
  return labels;
}

function clampSubjectOffset(value, max) {
  return Math.max(-max, Math.min(max, value));
}

function subjectInstanceMask(instances, picked) {
  if (picked.mask) return picked.mask;
  const { candidates, width, height, left, top, values, inputSize } = instances;
  const labels = instances.labels ??= partitionSubjectPixels(instances);
  const selected = candidates.indexOf(picked);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const output = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      if (labels[pixel] !== selected) continue;
      const probability = values[(y + top) * inputSize + x + left];
      const i = pixel * 4;
      output.data[i] = output.data[i + 1] = output.data[i + 2] = 255;
      output.data[i + 3] = Math.round(Math.min(1, (probability - .41) / .22) * 255);
    }
  }
  ctx.putImageData(output, 0, 0);
  picked.mask = canvas;
  return canvas;
}

function subjectKeyAt(clip, at) {
  const keys = clip.bodySubjectKeys;
  return keys?.findLast(key => key.at <= at + .001) ?? keys?.[0];
}

function lockedPersonFor(media, clip, at, refine = true) {
  const key = subjectKeyAt(clip, at);
  if (!key) return null;
  const instances = personCandidatesFor(media);
  if (!instances?.candidates.length) return null;
  const frame = personMasks.get(media).frame;
  const previous = lockedSubjectTracks.get(clip);
  if (previous?.key === key && previous.frame === frame && previous.instances === instances) return previous.result;
  const lastMatch = previous?.key === key ? previous.lastMatch : null;
  const delta = typeof frame === 'number' && lastMatch ? (frame - lastMatch.frame) / 30 : Infinity;
  const prior = delta > 0 && delta <= .4 ? lastMatch.candidate : null;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / 2;
  const anchored = Math.abs(at - key.at) <= .022;
  const ranked = instances.candidates.map(candidate => {
    const reference = difference(candidate.appearance, key.appearance);
    const appearance = prior ? Math.min(reference, difference(candidate.appearance, prior.appearance) + .055) : reference;
    const motion = prior ? distance(candidate, prior) : distance(candidate, key);
    return { candidate, appearance, motion, score: anchored ? distance(candidate, key) :
      appearance + motion * (prior ? 2.8 : .15) };
  }).sort((a, b) => a.score - b.score);
  const best = ranked[0];
  const matched = anchored ? distance(best.candidate, key) < .058 :
    (best.appearance < (prior ? .37 : ranked.length > 1 ? .31 : .235) &&
      (!prior || best.motion < Math.min(.14, .035 + delta * .33)) &&
      (ranked.length === 1 || ranked[1].score - best.score > .045));
  let result = null;
  if (matched) {
    const { candidate } = best;
    if (refine && !candidate.refinedPose) {
      const pose = structuredClone(candidate.pose);
      const w = media.videoWidth || media.naturalWidth || media.width;
      const h = media.videoHeight || media.naturalHeight || media.height;
      refinePersonFace(media, pose, w, h);
      rejectSplitEyePair(pose, w, h);
      refineEyeOrigins(media, pose, w, h);
      candidate.refinedPose = pose;
    }
    result = { candidate, mask: subjectInstanceMask(instances, candidate), joints: candidate.refinedPose, key };
  }
  lockedSubjectTracks.set(clip, { key, instances, frame, result,
    lastMatch: result ? { candidate: result.candidate, frame } : lastMatch });
  return result;
}
