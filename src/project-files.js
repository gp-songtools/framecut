'use strict';

const projectSignature = 'FRAMECUT';
const projectVersion = 1;
const projectHeaderBytes = projectSignature.length + 4;
const maxProjectManifestBytes = 16 * 1024 * 1024;
const projectIdPattern = /^[\w-]{1,128}$/;
const projectTracks = ['visual', 'audio', 'title', 'overlay', 'effect'];
let openingProject = false;
let savedProjectState;
let projectRevision = 0;

function currentProjectState() {
  return {
    name: $('project').value, clips, ratio: $('ratio').value, trackMix,
    view: {
      time, selected: active()?.id ?? null, zoom: zoom(), scroll: $('scroll').scrollLeft,
      snap: $('snap').getAttribute('aria-pressed') === 'true',
      magnet: $('magnet').getAttribute('aria-pressed') === 'true',
      range: timelineRange, loop: previewLoopEnabled
    }
  };
}

function projectEditState() {
  const { name, clips, ratio, trackMix } = currentProjectState();
  return JSON.stringify([name, clips, ratio, trackMix, [...assets.keys()]]);
}

function buildProjectFileBlob() {
  const state = currentProjectState();
  const media = [];
  const files = [];
  const extracted = [];
  const usedAssets = new Set(clips.map(clip => clip.asset));
  const sourceIds = new Map([...assets].map(([key, value]) => [value, key]));
  const addFile = (id, kind, file) => {
    if (!file) throw Error('A media file is missing from the project.');
    media.push({ id, kind, name: file.name, type: file.type, size: file.size });
    files.push(file);
  };
  for (const [key, asset] of assets) {
    if (key === 'demo') continue;
    if (!asset.sourceVideo) addFile(key, 'asset', asset.file);
    else if (usedAssets.has(key)) {
      extracted.push({ id: key, source: sourceIds.get(asset.sourceVideo), trackNumber: asset.trackNumber });
    }
  }
  const backgrounds = new Set(clips.map(clip => clip.background?.image).filter(Boolean));
  for (const key of backgrounds) addFile(key, 'background', backgroundImages.get(key)?.file);

  const manifest = new TextEncoder().encode(JSON.stringify({ version: projectVersion, state, media, extracted }));
  if (manifest.length > maxProjectManifestBytes) throw Error('The project has too many timeline settings to save.');
  // Keep the media as blobs so large sources do not get encoded into JSON.
  const header = new Uint8Array(projectHeaderBytes);
  header.set(new TextEncoder().encode(projectSignature));
  new DataView(header.buffer).setUint32(projectSignature.length, manifest.length, true);
  return {
    blob: new Blob([header, manifest, ...files], { type: 'application/octet-stream' }),
    name: (state.name.trim().replace(/[\\/:*?"<>|]/g, '-') || 'Framecut') + '.framecut'
  };
}

function saveProjectFile() {
  if (openingProject || exporting) return;
  try {
    const { blob, name } = buildProjectFileBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    savedProjectState = projectEditState();
    notify('Project file ready. Check your browser downloads.');
  } catch (error) {
    notify('Could not save project. ' + error.message);
  }
}

const projectObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const projectNumber = value => Number.isFinite(value) && value >= 0;
const projectId = value => typeof value === 'string' && projectIdPattern.test(value);

function checkProject(condition, message = 'The project data is incomplete or invalid.') {
  if (!condition) throw Error(message);
}

async function readProjectFile(file) {
  const header = await file.slice(0, projectHeaderBytes).arrayBuffer();
  const decoder = new TextDecoder();
  checkProject(header.byteLength === projectHeaderBytes &&
    decoder.decode(header.slice(0, projectSignature.length)) === projectSignature, 'Choose a Framecut project file.');
  const manifestBytes = new DataView(header).getUint32(projectSignature.length, true);
  let offset = projectHeaderBytes + manifestBytes;
  checkProject(manifestBytes > 0 && manifestBytes <= maxProjectManifestBytes && offset <= file.size);
  const manifest = JSON.parse(await file.slice(projectHeaderBytes, offset).text());
  checkProject(manifest?.version === projectVersion, 'This Framecut project version is unsupported.');
  checkProject(Array.isArray(manifest.media) && Array.isArray(manifest.extracted));

  const ids = new Set(['demo']);
  const media = manifest.media.map(entry => {
    checkProject(projectObject(entry) && projectId(entry.id) && !ids.has(entry.id) &&
      ['asset', 'background'].includes(entry.kind) && typeof entry.name === 'string' &&
      typeof entry.type === 'string' && Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= file.size - offset);
    ids.add(entry.id);
    const end = offset + entry.size;
    const source = new File([file.slice(offset, end)], entry.name, { type: entry.type });
    offset = end;
    return { ...entry, file: source };
  });
  checkProject(offset === file.size, 'The saved media data is incomplete or invalid.');
  return { state: manifest.state, media, extracted: manifest.extracted };
}

function validateProjectState(state, projectAssets, projectBackgrounds) {
  checkProject(projectObject(state) && typeof state.name === 'string' &&
    ['16:9', '9:16', '1:1'].includes(state.ratio) && Array.isArray(state.clips) &&
    projectObject(state.trackMix) && projectObject(state.view));
  const { view } = state;
  checkProject(projectNumber(view.time) && projectNumber(view.scroll) && projectNumber(view.zoom) &&
    (view.selected === null || projectId(view.selected)) &&
    [view.snap, view.magnet, view.loop].every(value => typeof value === 'boolean'));
  if (view.range !== null) {
    const range = view.range;
    checkProject(projectObject(range) && projectNumber(range.start) && projectNumber(range.end) &&
      range.end > range.start && (range.track === null || projectId(range.track)));
  }
  for (const [track, mix] of Object.entries(state.trackMix)) {
    checkProject((track === 'visual' || track === 'audio' || /^extracted-audio-\d+$/.test(track)) &&
      projectObject(mix) && projectNumber(mix.volume) && mix.volume <= 1 && typeof mix.muted === 'boolean');
  }
  const clipIds = new Set();
  for (const clip of state.clips) {
    checkProject(projectObject(clip) && projectId(clip.id) && !clipIds.has(clip.id) &&
      projectTracks.includes(clip.track) && [clip.at, clip.start, clip.end].every(projectNumber) &&
      clip.end > clip.start && Number.isFinite(clip.at + clip.end - clip.start));
    clipIds.add(clip.id);
    const asset = projectAssets.get(clip.asset);
    if (clip.track === 'visual') checkProject(asset?.type === 'video' || asset?.type === 'image');
    if (clip.track === 'audio') checkProject(asset?.type === 'audio' && clip.audioTrack === (asset.sourceVideo ? clip.asset : undefined));
    if (clip.track === 'overlay' && clip.asset !== undefined) checkProject(asset?.type === 'image');
    if (clip.track !== 'audio') checkProject(clip.audioTrack === undefined && clip.visualizer === undefined);
    if (clip.visualizer !== undefined) checkProject(validVisualizerSettings(clip.visualizer));
    if (clip.background?.image) checkProject(projectBackgrounds.has(clip.background.image));
  }
}

function releaseProjectMedia(projectAssets, projectBackgrounds) {
  for (const [key, asset] of projectAssets) {
    if (key !== 'demo') releaseMediaAsset(asset);
  }
  for (const image of projectBackgrounds.values()) image.bitmap.close();
}

async function loadProjectMedia(project, projectAssets, projectBackgrounds) {
  for (const media of project.media) {
    if (media.kind === 'asset') projectAssets.set(media.id, await loadMediaAsset(media.file, media.id));
    else {
      const bitmap = await createImageBitmap(media.file);
      projectBackgrounds.set(media.id, { bitmap, name: media.name, file: media.file });
    }
  }
  let trackNumber = 0;
  for (const track of project.extracted) {
    checkProject(projectObject(track) && Number.isSafeInteger(track.trackNumber) && track.trackNumber > 0 &&
      track.id === 'extracted-audio-' + track.trackNumber && !projectAssets.has(track.id));
    const source = projectAssets.get(track.source);
    checkProject(source?.type === 'video' && source.hasAudio, 'An extracted audio clip is missing its source video.');
    projectAssets.set(track.id, await loadExtractedAudioAsset(source, track.trackNumber));
    trackNumber = Math.max(trackNumber, track.trackNumber);
  }
  return trackNumber + 1;
}

function installProject(state, projectAssets, projectBackgrounds, nextTrack) {
  const { view } = state;
  clips = [];
  syncExtractedAudioTracks();
  assets.clear();
  for (const [key, asset] of projectAssets) assets.set(key, asset);
  backgroundImages.clear();
  for (const [key, image] of projectBackgrounds) backgroundImages.set(key, image);
  clips = state.clips;
  trackMix = { ...defaultTrackMix(), ...state.trackMix };
  nextAudioTrackNumber = nextTrack;
  $('project').value = state.name;
  setRatio(state.ratio);
  selected = view.selected;
  time = view.time;
  $('zoom').value = view.zoom;
  $('snap').setAttribute('aria-pressed', String(view.snap));
  $('magnet').setAttribute('aria-pressed', String(view.magnet));
  timelineRange = view.range;
  previewLoopEnabled = view.loop;
  renderBin();
  refresh();
  $('scroll').scrollLeft = view.scroll;
}

async function openProjectFile(file) {
  if (openingProject || exporting) return;
  openingProject = true;
  $('openProject').disabled = $('saveProject').disabled = true;
  notify('Opening project…');
  const projectAssets = new Map([['demo', assets.get('demo')]]);
  const projectBackgrounds = new Map();
  let installed = false;
  try {
    const project = await readProjectFile(file);
    const nextTrack = await loadProjectMedia(project, projectAssets, projectBackgrounds);
    validateProjectState(project.state, projectAssets, projectBackgrounds);
    if (exporting) throw Error('Wait until export is done before opening a project.');
    if (projectEditState() !== savedProjectState &&
        !confirm('Replace the current project? Any unsaved changes will be lost.')) {
      notify('Open project canceled.');
      return;
    }
    pause();
    const previousState = currentProjectState();
    const previousAssets = new Map(assets);
    const previousBackgrounds = new Map(backgroundImages);
    const previousTrack = nextAudioTrackNumber;
    clearTimelineRange();
    rangeToolArmed = false;
    maskPreviewClip = null;
    bodySubjectPicker = null;
    maskHistory.delete(canvas);
    maskHistory.delete(transitionLayer);
    try {
      installProject(project.state, projectAssets, projectBackgrounds, nextTrack);
    } catch (error) {
      installProject(previousState, previousAssets, previousBackgrounds, previousTrack);
      throw error;
    }
    installed = true;
    projectRevision++;
    undo.length = redo.length = 0;
    updateHistoryButtons();
    releaseProjectMedia(previousAssets, previousBackgrounds);
    savedProjectState = projectEditState();
    notify('Opened ' + (project.state.name.trim() || 'Untitled project') + '.');
  } catch (error) {
    notify('Could not open project. ' + error.message);
  } finally {
    if (!installed) releaseProjectMedia(projectAssets, projectBackgrounds);
    openingProject = false;
    $('openProject').disabled = $('saveProject').disabled = false;
  }
}

function connectProjectFiles() {
  window.addEventListener('beforeunload', event => {
    if (openingProject || projectEditState() === savedProjectState) return;
    event.preventDefault();
    event.returnValue = '';
  });
  savedProjectState = projectEditState();
  const input = $('projectFile');
  $('saveProject').onclick = saveProjectFile;
  $('openProject').onclick = () => input.click();
  input.onchange = () => {
    const file = input.files[0];
    input.value = '';
    if (file) openProjectFile(file);
  };
}
