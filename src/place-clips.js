'use strict';

// Pure helpers (no DOM): parse a Video sequence, match chosen files to its scenes, plan clip positions.

function parseVideoSequence(body, stats) {
  const scenes = [];
  let skipped = 0;
  for (const raw of String(body || '').split(/\r\n|\n|\r/)) {
    if (!raw.trim()) continue;
    const match = /^\s*\[(\d+):(\d{2}(?:\.\d+)?)\]\s*(\S.*?)\s*$/.exec(raw);
    if (!match) {
      skipped++;
      continue;
    }
    const name = match[3];
    const number = /^(\d+)_/.exec(name);
    const range = /_(\d+)-(\d+)\.[A-Za-z0-9]+$/.exec(name);
    scenes.push({
      line: scenes.length + 1,
      time: Number(match[1]) * 60 + Number(match[2]),
      name,
      scene: number ? parseInt(number[1], 10) : null,
      startSec: range ? parseInt(range[1], 10) : null,
      endSec: range ? parseInt(range[2], 10) : null
    });
  }
  if (stats) stats.skipped = skipped;
  return scenes;
}

function fileSceneNumber(name) {
  const match = /^0*(\d+)[_\s.-]/.exec(String(name));
  return match ? parseInt(match[1], 10) : null;
}

function sceneMatchesName(scene, name, exactOnly) {
  if (name === scene.name || String(name).toLowerCase() === scene.name.toLowerCase()) return 'name';
  if (!exactOnly && scene.scene != null && fileSceneNumber(name) === scene.scene) return 'number';
  return '';
}

function matchSceneFiles(scenes, files) {
  const byScene = scenes.map(() => -1);
  const how = scenes.map(() => '');
  const used = new Set();
  const take = (sceneIndex, fileIndex, kind) => {
    byScene[sceneIndex] = fileIndex;
    how[sceneIndex] = kind;
    used.add(fileIndex);
  };
  const byName = files.map((file, index) => index).sort((a, b) =>
    files[a].name < files[b].name ? -1 : files[a].name > files[b].name ? 1 : a - b);
  scenes.forEach((scene, i) => {
    const hit = files.findIndex((file, index) => !used.has(index) && file.name === scene.name);
    if (hit >= 0) take(i, hit, 'name');
  });
  scenes.forEach((scene, i) => {
    if (byScene[i] >= 0) return;
    const hit = byName.find(index => !used.has(index) && files[index].name.toLowerCase() === scene.name.toLowerCase());
    if (hit != null) take(i, hit, 'name');
  });
  scenes.forEach((scene, i) => {
    if (byScene[i] >= 0 || scene.scene == null) return;
    const hit = byName.find(index => !used.has(index) && fileSceneNumber(files[index].name) === scene.scene);
    if (hit != null) take(i, hit, 'number');
  });
  return { byScene, how, unmatched: files.map((file, index) => index).filter(index => !used.has(index)) };
}

function sceneLength(scenes, i) {
  const scene = scenes[i];
  if (scene.startSec != null && scene.endSec != null && scene.endSec - scene.startSec > 0) return scene.endSec - scene.startSec;
  const next = scenes[i + 1];
  if (next && next.time - scene.time > 0) return next.time - scene.time;
  return null;
}

function planPlacement(scenes, byScene, options = {}) {
  const { songZero = 0, keepFull = false, durations = [] } = options;
  const plan = [];
  scenes.forEach((scene, i) => {
    const file = byScene[i];
    if (file == null || file < 0) return;
    const duration = durations[file];
    if (!(duration > 0)) return;
    const length = sceneLength(scenes, i);
    plan.push({
      scene: i, file, at: songZero + scene.time, start: 0,
      end: keepFull || length == null ? duration : Math.min(duration, length),
      short: length != null && duration < length
    });
  });
  return plan;
}

// UI

let placeState = null;

function placeText(node, text, className) {
  const element = document.createElement(node);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function placeSongZero() {
  const audio = active();
  if (audio?.track === 'audio') {
    const name = assets.get(audio.asset)?.name || 'the audio clip';
    return {
      zero: audio.at - audio.start,
      text: 'Song time 0 is the start of ' + name + ' on the timeline (' + formatTime(Math.max(0, audio.at - audio.start)) + ').'
    };
  }
  return {
    zero: 0,
    text: 'No audio clip is selected, so song time 0 is the start of the timeline. ' +
      'To line clips up with the song, select the full-song audio clip first.'
  };
}

function openPlaceFilePicker() {
  $('placeFiles').click();
}

function startPlaceClips(fileList) {
  const spec = activeFramecutSongSpec();
  const stats = {};
  const scenes = parseVideoSequence(spec?.video, stats);
  const files = [...fileList].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (!files.length) return;
  placeState = { scenes, files, stats, match: matchSceneFiles(scenes, files), zero: placeSongZero(), busy: false, done: false };
  renderPlaceDialog();
  const dialog = $('placeDialog');
  if (!dialog.open) dialog.showModal();
}

function renderPlaceDialog() {
  const state = placeState;
  const { scenes, files, match } = state;
  $('placeZero').textContent = state.zero.text;
  const list = $('placeScenes');
  list.replaceChildren();
  scenes.forEach((scene, i) => {
    const item = placeText('li');
    const file = match.byScene[i];
    item.append(placeText('span', formatTime(scene.time) + ' ' + scene.name, 'place-scene'));
    if (file < 0) item.append(placeText('span', 'Missing', 'spec-stale'));
    else item.append(placeText('span', files[file].name + (match.how[i] === 'number' ? ' (matched by scene number)' : '')));
    list.append(item);
  });
  $('placeSkippedLines').hidden = !state.stats.skipped;
  $('placeSkippedLines').textContent = state.stats.skipped
    ? state.stats.skipped + (state.stats.skipped === 1 ? ' line' : ' lines') + ' in the Video sequence could not be read and were skipped.' : '';
  $('placeUnmatched').hidden = !match.unmatched.length;
  const unmatched = $('placeUnmatchedList');
  unmatched.replaceChildren(...match.unmatched.map(index => placeText('li', files[index].name)));
  $('placeMagnetNote').hidden = $('magnet').getAttribute('aria-pressed') !== 'true';
  const matched = match.byScene.some(index => index >= 0);
  $('placeOptions').hidden = state.busy || state.done;
  $('placeScenesBox').hidden = state.done;
  $('placeResult').hidden = !state.done;
  $('placeGo').hidden = state.done;
  $('placeGo').disabled = !matched || state.busy;
  $('placeCancel').textContent = state.done ? 'Close' : 'Cancel';
  $('placeCancel').disabled = state.busy;
}

function placeClipForScene(scene) {
  return clips.filter(clip => clip.track === 'visual' && (clip.specScene
    ? clip.specScene === scene.name
    : sceneMatchesName(scene, assets.get(clip.asset)?.name || '', false)));
}

async function runPlaceClips() {
  const state = placeState;
  if (!state || state.busy) return;
  pause();
  state.busy = true;
  renderPlaceDialog();
  const keepFull = $('placeKeepFull').checked;
  const replace = $('placeReplace').checked;
  const mute = $('placeMute').checked;
  const { scenes, files, match } = state;
  const revision = projectRevision;
  const notPlaced = [];
  const loaded = new Map();
  const durations = [];
  const wanted = [...new Set(match.byScene.filter(index => index >= 0))];
  for (const [n, index] of wanted.entries()) {
    notify('Loading clips… ' + (n + 1) + ' of ' + wanted.length);
    try {
      if (!files[index].type.startsWith('video/')) throw Error('not a video file');
      const assetId = id();
      const asset = await loadMediaAsset(files[index], assetId);
      if (revision !== projectRevision) {
        releaseMediaAsset(asset);
        state.busy = false;
        $('placeDialog').close();
        return;
      }
      assets.set(assetId, asset);
      loaded.set(index, assetId);
      durations[index] = asset.duration;
    } catch (error) {
      if (revision !== projectRevision) {
        $('placeDialog').close();
        return;
      }
      notPlaced.push(files[index].name + ': failed to load (' + String(error.message).replace(files[index].name, '').trim() + ')');
    }
  }
  const plan = planPlacement(scenes, match.byScene, { songZero: state.zero.zero, keepFull, durations });
  const magnet = $('magnet').getAttribute('aria-pressed') === 'true';
  const remove = new Set();
  const accepted = [];
  const short = [];
  for (const entry of plan) {
    const scene = scenes[entry.scene];
    const existing = placeClipForScene(scene);
    if (existing.length && !replace) {
      notPlaced.push(scene.name + ': already on the timeline');
      continue;
    }
    if (entry.at < -1e-9) {
      notPlaced.push(scene.name + ': would start before the timeline');
      continue;
    }
    const end = entry.at + (entry.end - entry.start);
    if (!magnet) {
      const others = clips.filter(clip => clip.track === 'visual' && !existing.includes(clip) && !remove.has(clip))
        .map(clip => ({ at: clip.at, end: clip.at + length(clip), name: assets.get(clip.asset)?.name || clip.specScene || 'a clip' }))
        .concat(accepted.map(item => ({ at: item.clip.at, end: item.clip.at + length(item.clip), name: item.scene.name })));
      const clash = others.find(other => entry.at < other.end - 1e-6 && other.at < end - 1e-6);
      if (clash) {
        notPlaced.push(scene.name + ': overlaps ' + clash.name + ' at ' + formatTime(clash.at));
        continue;
      }
    }
    existing.forEach(clip => remove.add(clip));
    accepted.push({
      scene, entry,
      clip: { id: id(), track: 'visual', asset: loaded.get(entry.file), at: Math.max(0, entry.at), start: entry.start, end: entry.end, volume: mute ? 0 : 1, specScene: scene.name }
    });
    if (entry.short) short.push(scene.name + ': clip is ' + entry.end.toFixed(1) + ' s, scene is ' + sceneLength(scenes, entry.scene).toFixed(1) + ' s');
  }
  const usedAssets = new Set(accepted.map(item => item.clip.asset));
  for (const assetId of loaded.values()) {
    if (usedAssets.has(assetId)) continue;
    releaseMediaAsset(assets.get(assetId));
    assets.delete(assetId);
  }
  if (accepted.length) {
    remember();
    clips = clips.filter(clip => !remove.has(clip));
    const added = accepted.map(item => item.clip);
    if (magnet) {
      const rank = new Map(added.map((clip, index) => [clip, index + 1]));
      const order = [...clips.filter(clip => clip.track === 'visual'), ...added]
        .sort((a, b) => a.at - b.at || (rank.get(a) || 0) - (rank.get(b) || 0));
      clips.push(...added);
      packVideoTrack(order);
    } else clips.push(...added);
    selected = added[0].id;
    seek(added[0].at);
    refresh();
  }
  renderBin();
  state.busy = false;
  state.done = true;
  notify(accepted.length ? 'Placed ' + accepted.length + (accepted.length === 1 ? ' clip.' : ' clips.') : 'No clips were placed.');
  renderPlaceResult(accepted.length, scenes.filter((scene, i) => match.byScene[i] < 0).map(scene => scene.name),
    notPlaced, short);
  renderPlaceDialog();
}

function renderPlaceResult(count, missing, notPlaced, short) {
  const box = $('placeResult');
  box.replaceChildren(placeText('p', count === 0 ? 'No clips were placed.' : 'Placed ' + count + (count === 1 ? ' clip.' : ' clips.')));
  const group = (title, items) => {
    if (!items.length) return;
    box.append(placeText('p', title, 'spec-stale'));
    const list = placeText('ul');
    list.append(...items.map(text => placeText('li', text)));
    box.append(list);
  };
  group('Missing scenes:', missing);
  group('Not placed:', notPlaced);
  group('Shorter than their scene:', short);
}

function connectPlaceClips() {
  $('placeFiles').onchange = () => {
    const files = [...$('placeFiles').files];
    $('placeFiles').value = '';
    if (files.length) startPlaceClips(files);
  };
  $('placeGo').onclick = runPlaceClips;
  $('placeCancel').onclick = () => $('placeDialog').close();
  $('placeDialog').addEventListener('cancel', event => {
    if (placeState?.busy) event.preventDefault();
  });
  $('placeDialog').addEventListener('close', () => {
    placeState = null;
    $('placeKeepFull').checked = false;
    $('placeReplace').checked = false;
    $('placeMute').checked = true;
  });
}
