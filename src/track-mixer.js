'use strict';

function defaultTrackMix() {
  return { visual: { volume: 1, muted: false }, audio: { volume: 1, muted: false } };
}

let trackMix = defaultTrackMix();
const trackMixerControls = new Map();

function timelineTrack(clip) {
  return clip.audioTrack ?? clip.track;
}

function trackMixFor(track) {
  return trackMix[track] ?? { volume: 1, muted: false };
}

function trackOutputLevel(track) {
  const mix = trackMixFor(track);
  return mix.muted ? 0 : mix.volume;
}

function clipVolumeAt(clip, sourceTime) {
  if (clip.audioExtracted) return 0;
  return scalarKeyframeValueAt(clip.volumeKeys, sourceTime, (clip.volume ?? 1) * 100) / 100;
}

function clipHasVolume(clip) {
  if (clip.audioExtracted) return false;
  return clipVolumeAt(clip, clip.start) > 0 || clipVolumeAt(clip, clip.end) > 0 ||
    Boolean(clip.volumeKeys?.some(key => key.at > clip.start && key.at < clip.end && key.value > 0));
}

function clipOutputVolume(clip, sourceTime) {
  const fade = clip.audioFadeIn || clip.audioFadeOut ? audioFadeGain(clip, sourceTime) : 1;
  return clipVolumeAt(clip, sourceTime) * trackOutputLevel(timelineTrack(clip)) * fade;
}

function updateTrackMix(track, values) {
  trackMix = { ...trackMix, [track]: { ...trackMixFor(track), ...values } };
}

function syncTrackMixer() {
  for (const [track, { mute, volume }] of trackMixerControls) {
    const mix = trackMixFor(track);
    mute.setAttribute('aria-pressed', String(mix.muted));
    volume.syncValue(mix.volume * 100);
  }
}

function connectTrackMixerRow(row) {
  const track = row.dataset.mixTrack;
  const label = row.querySelector('.track-name').textContent;
  const mute = row.querySelector('.track-mute');
  const mix = trackMixFor(track);
  mute.setAttribute('aria-pressed', String(mix.muted));
  const volume = inspectorSliderField(label + ' track volume (%)', mix.volume * 100, 0, 100,
    value => updateTrackMix(track, { volume: value / 100 }), '1', row, { compact: true });
  mute.onclick = () => {
    remember();
    updateTrackMix(track, { muted: !trackMixFor(track).muted });
    syncTrackMixer();
    updateHistoryButtons();
    draw(Boolean(playback));
  };
  trackMixerControls.set(track, { mute, volume });
}

function connectTrackMixer() {
  for (const row of document.querySelectorAll('[data-mix-track]')) connectTrackMixerRow(row);
}
