'use strict';

let lyricsAudioClip;
let lyricsFileRevision = 0;
let activeLyricTranscription;
const lyricsHandoffKey = 'gpsongtools.framecut.lyrics.v1';
const lyricsHandoffLifetime = 24 * 60 * 60 * 1000;
const lyricCloudKeyPrefix = 'gpsongtools.framecut.whisper-key.v1.';
let pendingLyricsHandoff;
let lyricsHandoffInDialog;

function syncLyricsHandoff() {
  pendingLyricsHandoff = null;
  try {
    const stored = localStorage.getItem(lyricsHandoffKey);
    const handoff = JSON.parse(stored);
    if (handoff?.version === 1 && Number.isFinite(handoff.sentAt) &&
        typeof handoff.lrc === 'string' && handoff.lrc.trim() && typeof handoff.audioName === 'string') {
      if (Date.now() - handoff.sentAt < lyricsHandoffLifetime) pendingLyricsHandoff = { ...handoff, stored };
      else localStorage.removeItem(lyricsHandoffKey);
    }
  } catch {
    // Local LRC import still works without browser storage.
  }
  const banner = $('lyricsHandoff');
  banner.hidden = !pendingLyricsHandoff;
  if (pendingLyricsHandoff) {
    const audio = pendingLyricsHandoff.audioName;
    $('lyricsHandoffStatus').textContent = 'Lyrics received from Auralyrics' + (audio ? ' for ' + audio : '') +
      '. Select the matching Audio clip and choose Import Lyrics.';
  }
}

function clearLyricsHandoff(handoff) {
  if (!handoff) return;
  try {
    // A newer handoff can arrive while the import dialog is open.
    if (localStorage.getItem(lyricsHandoffKey) === handoff.stored) localStorage.removeItem(lyricsHandoffKey);
  } catch {
    // The editor can finish importing the lyrics already in the dialog.
  }
  syncLyricsHandoff();
}

function parseLrc(text) {
  const timestamp = /\[(\d+):([0-5]?\d)(?:\.(\d{1,3}))?\]\s*/y;
  const linesAtTime = new Map();
  let offset = 0;
  let untimed = 0;
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    const metadata = /^\[([a-z][\w-]*):([^\]]*)\]$/i.exec(line);
    if (metadata) {
      const value = metadata[2].trim();
      if (metadata[1].toLowerCase() === 'offset' && /^[+-]?\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
        offset = Number(value);
      }
      continue;
    }

    timestamp.lastIndex = 0;
    const times = [];
    let textStart = 0;
    for (let tag = timestamp.exec(line); tag; tag = timestamp.exec(line)) {
      const milliseconds = (Number(tag[1]) * 60 + Number(tag[2])) * 1000 +
        Number((tag[3] ?? '').padEnd(3, '0'));
      if (Number.isSafeInteger(milliseconds)) times.push(milliseconds);
      textStart = timestamp.lastIndex;
    }
    if (!times.length) {
      untimed++;
      continue;
    }
    const lyric = line.slice(textStart).replace(/<\d+:[0-5]?\d(?:\.\d{1,3})?>/g, '').trim();
    for (const time of times) {
      const lines = linesAtTime.get(time) ?? [];
      if (lyric && !lines.includes(lyric)) lines.push(lyric);
      linesAtTime.set(time, lines);
    }
  }
  // A positive LRC offset makes a lyric appear earlier.
  const cues = Array.from(linesAtTime, ([time, lines]) => ({ time: (time - offset) / 1000, text: lines.join('\n') }));
  cues.sort((a, b) => a.time - b.time);
  return { cues, untimed };
}

function createLyricsClips(cues, audio) {
  const titles = [];
  for (const [index, cue] of cues.entries()) {
    if (!cue.text) continue;
    const from = Math.max(audio.start, cue.time);
    const to = Math.min(audio.end, cues[index + 1]?.time ?? audio.end);
    if (to - from <= 1e-7) continue;
    titles.push(createTitleClip(cue.text, audio.at + (from - audio.start), to - from));
  }
  return titles;
}

function syncLyricEngine() {
  const method = $('lyricsEngine').value;
  const align = $('alignLyrics').checked;
  const cloud = method === 'cloud';
  $('lyricsCloudOptions').hidden = !cloud;
  let detail = 'Uses the bundled Whisper model. Audio stays on this device.';
  if (cloud) {
    const { label } = lyricCloudProviders[$('lyricsCloudProvider').value];
    detail = 'Sends the selected clip’s audio to ' + label + '. Keys are temporary unless you choose to remember them.';
  } else if (method === 'live') {
    detail = align ? 'Alignment uses the bundled Whisper model for word timing.'
      : 'Listens to the clip in real time. Your browser’s speech service may process the audio online.';
  }
  $('lyricsEngineInfo').textContent = detail + (align
    ? ' Keeps the lyric lines in the editor.' : ' Generates a new draft from the audio.');
}

function currentLyricCloudStorageKey() {
  return lyricCloudKeyPrefix + $('lyricsCloudProvider').value;
}

function loadLyricCloudKey() {
  let saved = '';
  try { saved = localStorage.getItem(currentLyricCloudStorageKey()) ?? ''; } catch { /* Browser storage is optional. */ }
  $('lyricsCloudKey').value = saved;
  $('rememberLyricsCloudKey').checked = Boolean(saved);
  $('forgetLyricsCloudKey').hidden = !saved;
  $('lyricsKeyStatus').textContent = '';
}

function updateLyricCloudKey() {
  const remember = $('rememberLyricsCloudKey');
  const forget = $('forgetLyricsCloudKey');
  const status = $('lyricsKeyStatus');
  const saved = remember.checked ? $('lyricsCloudKey').value.trim() : '';
  try {
    if (saved) localStorage.setItem(currentLyricCloudStorageKey(), saved);
    else localStorage.removeItem(currentLyricCloudStorageKey());
    forget.hidden = !saved;
    status.textContent = '';
    return true;
  } catch {
    remember.checked = !forget.hidden;
    status.textContent = saved ? 'Could not save this API key in the browser.' : 'Could not remove the saved API key from this browser.';
    return false;
  }
}

function setLyricTranscriptionBusy(busy) {
  for (const name of ['lyricsEngine', 'alignLyrics', 'lyricsCloudProvider', 'lyricsCloudKey',
    'rememberLyricsCloudKey', 'forgetLyricsCloudKey', 'transcribeLyrics', 'chooseLyricsFile', 'useSongSpecLyrics', 'applyLyrics']) {
    $(name).disabled = busy;
  }
  $('lyricsText').readOnly = busy;
  $('stopLyricsTranscription').hidden = !busy;
}

async function runLyricTranscription() {
  if (activeLyricTranscription) return;
  const clip = lyricsAudioClip;
  const asset = assets.get(clip?.asset);
  const text = $('lyricsText');
  const message = $('lyricsMessage');
  if (!asset || !clips.includes(clip)) {
    message.textContent = 'Reopen Import Lyrics from the audio clip you want to use.';
    return;
  }
  const { start, end } = clip;
  const duration = end - start;
  const selectedMethod = $('lyricsEngine').value;
  const align = $('alignLyrics').checked;
  const method = selectedMethod === 'live' && align ? 'local' : selectedMethod;
  const lines = align ? lyricAlignmentLines(text.value) : [];
  const provider = $('lyricsCloudProvider').value;
  const key = method === 'cloud' ? $('lyricsCloudKey').value.trim() : '';
  if (align && !lines.length) {
    message.textContent = 'Paste or open the lyrics you want to align.';
    return;
  }
  if (method === 'cloud' && !key) {
    message.textContent = 'Enter your ' + lyricCloudProviders[provider].label + ' API key.';
    return;
  }
  if (method === 'cloud' && Math.round(duration * lyricSampleRate) * 2 + 44 > lyricCloudLimit) {
    message.textContent = 'Cloud Whisper accepts up to 25 MB of audio. Trim the clip to about 13 minutes or use In-browser Whisper.';
    return;
  }
  const job = new AbortController();
  activeLyricTranscription = job;
  const { signal } = job;
  const setStatus = status => {
    if (activeLyricTranscription === job && !signal.aborted) message.textContent = status;
  };
  lyricsFileRevision++;
  setLyricTranscriptionBusy(true);
  let context;
  try {
    if (method === 'live') {
      lyricLiveRecognition();
      context = new AudioContext();
      await context.resume();
    }
    setStatus('Preparing the selected audio clip…');
    const samples = await decodeLyricClip(asset, { start, end }, signal);
    signal.throwIfAborted();
    // Whisper can timestamp the first word at zero even if the clip starts with silence.
    const firstSample = samples.findIndex(sample => Math.abs(sample) > .0001);
    if (firstSample < 0) throw Error('The selected part of the clip is silent.');
    const firstSignal = firstSample / lyricSampleRate;
    let result;
    if (method === 'cloud') {
      setStatus('Transcribing with ' + lyricCloudProviders[provider].label + ' Whisper…');
      result = await transcribeLyricsInCloud(samples, provider, key, signal);
    } else if (method === 'live') {
      setStatus('Listening to the audio clip in real time…');
      result = await transcribeLyricsLive(samples, context, signal);
    } else {
      setStatus('Loading the bundled Whisper model…');
      result = await transcribeLyricsOnDevice(samples, signal, setStatus);
    }
    signal.throwIfAborted();
    if (!clips.includes(clip) || clip.start !== start || clip.end !== end) {
      throw Error('The audio trim changed. Run transcription again for the current clip.');
    }
    const { words, segments } = result;
    const timed = normalizeLyricWords(words?.length ? words : wordsFromLyricSegments(segments),
      duration, firstSignal, segments);
    if (!timed.length) throw Error('No timed speech or singing was detected in the selected clip.');
    const alignment = align ? alignWrittenLyrics(lines, timed, duration, firstSignal) : null;
    if (align && !alignment) throw Error('Whisper could not match your lyrics to this audio. Check the selected clip and lyrics.');
    const cues = alignment?.cues ?? groupLyricWords(timed);
    text.value = formatTranscribedLrc(cues, start, end);
    lyricsHandoffInDialog = null;
    $('lyricsTextLabel').textContent = 'Timed lyrics';
    if (!align) $('lyricsSongSpecHint').hidden = true;
    const matched = alignment && alignment.matched < cues.length
      ? ' Estimated timing for ' + (cues.length - alignment.matched) + ' unmatched lines.' : '';
    setStatus((align ? 'Aligned ' : 'Transcribed ') + cues.length + ' lyric ' +
      (cues.length === 1 ? 'line.' : 'lines.') + matched + ' Review the timestamps, then choose Import Lyrics.');
  } catch (error) {
    setStatus(error.message);
  } finally {
    if (context) void context.close().catch(() => {});
    if (activeLyricTranscription === job) {
      activeLyricTranscription = null;
      setLyricTranscriptionBusy(false);
      if (signal.aborted) message.textContent = 'Transcription canceled.';
    }
  }
}

function openLyricsDialog(audio) {
  if (audio?.track !== 'audio' || openingProject || exporting) return;
  pause();
  if (selected !== audio.id) {
    selected = audio.id;
    refresh();
  }
  lyricsAudioClip = audio;
  syncLyricsHandoff();
  lyricsHandoffInDialog = pendingLyricsHandoff;
  lyricsFileRevision++;
  $('lyricsAudio').textContent = 'Sync to ' + assets.get(audio.asset).name;
  $('lyricsTextLabel').textContent = lyricsHandoffInDialog ? 'Timed lyrics from Auralyrics' : 'Lyrics or timed LRC';
  $('lyricsText').value = lyricsHandoffInDialog?.lrc ?? '';
  $('lyricsSongSpecHint').hidden = true;
  $('lyricsFile').value = '';
  $('lyricsMessage').textContent = '';
  $('applyLyrics').disabled = false;
  $('alignLyrics').checked = false;
  loadLyricCloudKey();
  syncLyricEngine();
  $('lyricsDialog').showModal();
}

function connectLyricsImport() {
  const dialog = $('lyricsDialog');
  const input = $('lyricsFile');
  const text = $('lyricsText');
  const message = $('lyricsMessage');
  const apply = $('applyLyrics');
  syncLyricsHandoff();
  window.addEventListener('storage', event => {
    if (!event.key || event.key === lyricsHandoffKey) syncLyricsHandoff();
    if (dialog.open && (!event.key || event.key === currentLyricCloudStorageKey())) loadLyricCloudKey();
  });
  $('dismissLyricsHandoff').onclick = () => clearLyricsHandoff(pendingLyricsHandoff);
  $('timelineImportLyrics').onclick = () => openLyricsDialog(active());
  for (const name of ['lyricsEngine', 'alignLyrics']) $(name).onchange = syncLyricEngine;
  $('lyricsCloudProvider').onchange = () => {
    loadLyricCloudKey();
    syncLyricEngine();
  };
  $('rememberLyricsCloudKey').onchange = updateLyricCloudKey;
  $('lyricsCloudKey').onchange = () => {
    if ($('rememberLyricsCloudKey').checked) updateLyricCloudKey();
  };
  $('forgetLyricsCloudKey').onclick = () => {
    $('rememberLyricsCloudKey').checked = false;
    $('lyricsCloudKey').value = '';
    if (updateLyricCloudKey()) $('lyricsKeyStatus').textContent = 'Saved API key removed.';
    $('lyricsCloudKey').focus();
  };
  $('transcribeLyrics').onclick = runLyricTranscription;
  $('stopLyricsTranscription').onclick = () => activeLyricTranscription?.abort();
  dialog.addEventListener('close', () => {
    activeLyricTranscription?.abort();
    activeLyricTranscription = null;
    $('lyricsCloudKey').value = '';
    $('rememberLyricsCloudKey').checked = false;
    $('forgetLyricsCloudKey').hidden = true;
    setLyricTranscriptionBusy(false);
  });
  $('useSongSpecLyrics').onclick = () => {
    const spec = activeFramecutSongSpec();
    if (!spec?.lyrics) return;
    if (text.value.trim() && text.value !== spec.lyrics &&
        !confirm('Replace the lyrics in the import box with the Song Spec lyrics?')) return;
    lyricsFileRevision++;
    apply.disabled = false;
    lyricsHandoffInDialog = null;
    text.value = spec.lyrics;
    $('lyricsTextLabel').textContent = 'Lyrics from Song Spec';
    $('lyricsSongSpecAttribution').textContent = 'Using Lyrics from Song Spec' +
      (spec.lyricsBy ? ' (' + spec.lyricsBy + ')' : '') + '.';
    $('lyricsSongSpecHint').hidden = false;
    $('alignLyrics').checked = true;
    syncLyricEngine();
    message.textContent = '';
  };
  $('chooseLyricsFile').onclick = () => input.click();
  $('cancelLyrics').onclick = () => dialog.close();
  text.oninput = () => {
    lyricsFileRevision++;
    apply.disabled = false;
    $('transcribeLyrics').disabled = false;
    message.textContent = '';
  };
  input.onchange = async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const revision = ++lyricsFileRevision;
    apply.disabled = true;
    $('transcribeLyrics').disabled = true;
    message.textContent = '';
    try {
      const contents = await file.text();
      if (dialog.open && revision === lyricsFileRevision) {
        lyricsHandoffInDialog = null;
        $('lyricsTextLabel').textContent = 'Lyrics or timed LRC';
        $('lyricsSongSpecHint').hidden = true;
        text.value = contents;
      }
    } catch {
      if (dialog.open && revision === lyricsFileRevision) message.textContent = 'Could not read this lyrics file.';
    } finally {
      if (revision === lyricsFileRevision) {
        apply.disabled = false;
        $('transcribeLyrics').disabled = false;
      }
    }
  };
  $('lyricsForm').onsubmit = event => {
    event.preventDefault();
    if (activeLyricTranscription) return;
    const audio = lyricsAudioClip;
    if (!clips.includes(audio)) {
      message.textContent = 'Reopen Import Lyrics from the audio clip you want to use.';
      return;
    }
    const { cues, untimed } = parseLrc(text.value);
    if (!cues.some(cue => cue.text)) {
      message.textContent = 'Enter timed lyrics such as [00:04.50] Your first lyric, or select Transcribe.';
      return;
    }
    const titles = createLyricsClips(cues, audio);
    if (!titles.length) {
      message.textContent = 'The lyrics fall outside the selected audio clip’s source range.';
      return;
    }
    remember();
    clips = clips.concat(titles);
    selected = titles[0].id;
    clearLyricsHandoff(lyricsHandoffInDialog);
    lyricsHandoffInDialog = null;
    dialog.close();
    seek(titles[0].at);
    refresh();
    notify('Imported ' + titles.length + (titles.length === 1 ? ' lyric clip.' : ' lyric clips.') +
      (untimed ? ' Skipped ' + untimed + (untimed === 1 ? ' untimed line.' : ' untimed lines.') : ''));
  };
}
