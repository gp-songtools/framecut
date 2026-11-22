'use strict';

const extractedAudioRows = new Map();
const pendingAudioExtractions = new WeakSet();
const videoAudioAvailability = new WeakMap();
let nextAudioTrackNumber = 1;

function canExtractAudio(clip) {
  return clip.track === 'visual' && !clip.audioExtracted && assets.get(clip.asset)?.type === 'video';
}

function hasEmbeddedAudio(asset) {
  let check = videoAudioAvailability.get(asset);
  if (!check) {
    check = withVideoAudioTrack(asset, track => Boolean(track))
      .catch(() => decodeSourceAudio(asset).then(() => true, () => false));
    videoAudioAvailability.set(asset, check);
  }
  return check;
}

async function loadExtractedAudioAsset(source, trackNumber) {
  // Separate media elements let the two clips seek and play independently.
  const media = document.createElement('audio');
  media.preload = 'metadata';
  const asset = { type: 'audio', name: source.name + ' (audio)', media, url: source.url,
    duration: source.duration, sourceVideo: source, trackNumber };
  try {
    await new Promise((resolve, reject) => {
      media.addEventListener('loadedmetadata', resolve, { once: true });
      media.addEventListener('error', () => reject(Error('This video’s audio could not be opened.')), { once: true });
      media.src = source.url;
    });
    return asset;
  } catch (error) {
    releaseMediaAsset(asset);
    throw error;
  }
}

async function extractAudio(clip) {
  if (!canExtractAudio(clip) || exporting || pendingAudioExtractions.has(clip)) return;
  pendingAudioExtractions.add(clip);
  const source = assets.get(clip.asset);
  notify('Checking video audio…');
  let asset;
  let added = false;
  try {
    if (!await hasEmbeddedAudio(source)) {
      notify('This video has no readable audio track.');
      return;
    }
    asset = await loadExtractedAudioAsset(source);
    if (!clips.includes(clip) || !canExtractAudio(clip) || exporting) return;
    pause();
    remember();
    const trackNumber = nextAudioTrackNumber++;
    const track = 'extracted-audio-' + trackNumber;
    const audio = { id: id(), track: 'audio', audioTrack: track, asset: track,
      at: clip.at, start: clip.start, end: clip.end, volume: clip.volume ?? 1 };
    if (clip.volumeKeys) audio.volumeKeys = structuredClone(clip.volumeKeys);
    if (clip.audioFadeIn || clip.audioFadeOut) Object.assign(audio, audioFadeDurations(clip));
    asset.trackNumber = trackNumber;
    assets.set(track, asset);
    updateTrackMix(track, trackMixFor('visual'));
    clip.audioExtracted = true;
    clips.push(audio);
    added = true;
    selected = audio.id;
    refresh();
    extractedAudioRows.get(track).label.scrollIntoView({ block: 'nearest' });
    notify('Extracted audio to its own track.');
  } catch (error) {
    notify(error.message);
  } finally {
    pendingAudioExtractions.delete(clip);
    if (asset && !added) releaseMediaAsset(asset);
  }
}

function syncExtractedAudioTracks() {
  const tracks = new Set(clips.map(clip => clip.audioTrack).filter(Boolean));
  for (const [track, { lane, label }] of extractedAudioRows) {
    if (tracks.has(track)) continue;
    trackMixerControls.delete(track);
    lane.remove();
    label.remove();
    extractedAudioRows.delete(track);
  }
  const ordered = [...tracks].sort((a, b) => assets.get(a).trackNumber - assets.get(b).trackNumber);
  for (const [index, track] of ordered.entries()) {
    if (extractedAudioRows.has(track)) continue;
    const asset = assets.get(track);
    const name = 'Extracted ' + asset.trackNumber;
    const label = $('extractedAudioLabel').content.firstElementChild.cloneNode(true);
    label.dataset.mixTrack = track;
    label.title = asset.name;
    label.querySelector('.track-name').textContent = name;
    label.querySelector('.track-mute').setAttribute('aria-label', 'Mute ' + name + ' audio track');
    const lane = document.createElement('div');
    lane.className = 'lane extracted-audio-lane';
    lane.dataset.track = track;
    const next = extractedAudioRows.get(ordered.slice(index + 1).find(other => extractedAudioRows.has(other)));
    document.querySelector('.timeline-inner .tracks').insertBefore(label, next?.label ?? null);
    $('lanes').insertBefore(lane, next?.lane ?? $('timelineRange'));
    extractedAudioRows.set(track, { lane, label });
    connectTrackMixerRow(label);
  }
}
