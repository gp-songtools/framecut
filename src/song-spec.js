'use strict';

let sharedFramecutSongSpec;
let openedFramecutSongSpec;
let songSpecFileRevision = 0;

function readFramecutSongSpec(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const doc = SongSpec.parse(text.replace(/^\uFEFF/, ''));
  if (SongSpec.setting(doc, 'schema_version') !== String(SongSpec.SCHEMA_VERSION)) return null;
  const numericSetting = key => {
    const value = Number(SongSpec.setting(doc, key));
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  const lyrics = SongSpec.section(doc, 'lyrics');
  const timed = SongSpec.section(doc, 'timed-lyrics');
  return {
    title: SongSpec.setting(doc, 'title'),
    bpm: numericSetting('bpm'),
    key: SongSpec.setting(doc, 'key'),
    duration: numericSetting('duration'),
    lyrics: SongSpec.stripTags(lyrics?.body),
    lyricsBy: lyrics?.by ? SongSpec.toolName(lyrics.by) : '',
    timedLyrics: timed?.body ?? '',
    timedLyricsBy: timed?.by ? SongSpec.toolName(timed.by) : ''
  };
}

function activeFramecutSongSpec() {
  return openedFramecutSongSpec?.data ?? sharedFramecutSongSpec;
}

function renderFramecutSongSpec() {
  const spec = activeFramecutSongSpec();
  $('songSpecStatus').textContent = openedFramecutSongSpec ? openedFramecutSongSpec.name
    : spec ? 'Shared Song Spec in this browser' : 'Open or drop a .songspec.md file here.';
  $('useSharedSongSpec').hidden = !openedFramecutSongSpec || !sharedFramecutSongSpec;
  const details = $('songSpecDetails');
  details.replaceChildren();
  const fields = spec ? [
    ['Title', spec.title], ['BPM', spec.bpm], ['Key', spec.key],
    ['Duration', spec.duration && spec.duration + ' s']
  ].filter(([, value]) => value) : [];
  for (const [label, value] of fields) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    details.append(term, description);
  }
  details.hidden = !fields.length;
  const timedLines = spec?.timedLyrics ? spec.timedLyrics.split('\n').filter(line => line.trim()).length : 0;
  const timedStatus = timedLines
    ? ' Timed lyrics: ' + timedLines + (timedLines === 1 ? ' line' : ' lines') +
      (spec.timedLyricsBy ? ' by ' + spec.timedLyricsBy : '') + '.' : '';
  $('songSpecLyricsStatus').textContent = spec
    ? (spec.lyrics ? 'Lyrics available' + (spec.lyricsBy ? ' from ' + spec.lyricsBy : '') +
      '. Select an Audio clip and choose Import Lyrics.' : 'This Song Spec has no lyrics.') + timedStatus
    : '';
  $('useSongSpecLyrics').hidden = !spec?.lyrics;
}

async function openFramecutSongSpec(file) {
  const revision = ++songSpecFileRevision;
  $('songSpecError').textContent = '';
  try {
    const text = await file.text();
    const data = readFramecutSongSpec(text);
    if (revision !== songSpecFileRevision) return;
    if (!data) {
      $('songSpecError').textContent = 'Choose a Song Spec file with schema_version: 1.';
      return;
    }
    openedFramecutSongSpec = { name: file.name, text, data };
    renderFramecutSongSpec();
  } catch {
    if (revision === songSpecFileRevision) $('songSpecError').textContent = 'Could not read this Song Spec file.';
  }
}

function formatTimedLyricsSection(cues) {
  const stamp = time => {
    const hundredths = Math.max(0, Math.round((Number(time) || 0) * 100));
    const minutes = Math.floor(hundredths / 6000);
    const rest = hundredths % 6000;
    return '[' + String(minutes).padStart(2, '0') + ':' + String(Math.floor(rest / 100)).padStart(2, '0') +
      '.' + String(rest % 100).padStart(2, '0') + ']';
  };
  const lines = [];
  [...cues].map((cue, index) => ({ cue, index }))
    .sort((a, b) => a.cue.time - b.cue.time || a.index - b.index)
    .forEach(({ cue }) => {
      for (const raw of String(cue.text ?? '').split(/\r\n|\n|\r/)) {
        const line = raw.trim();
        if (!line || /^(\[[^\]]*\]\s*)+$/.test(line)) continue;
        lines.push(stamp(cue.time) + ' ' + line);
      }
    });
  return lines.join('\n');
}

function saveTimedLyricsToSongSpec(cues) {
  const message = $('lyricsMessage');
  const body = formatTimedLyricsSection(cues);
  if (!body) {
    message.textContent = 'There are no timed lyric lines to save.';
    return;
  }
  const write = doc => {
    const reason = SongSpec.confirmReason(doc, 'timed-lyrics', 'framecut');
    if (reason && !confirm(reason + ' Overwrite the Timed lyrics section?')) return false;
    SongSpec.setSection(doc, 'timed-lyrics', body, {
      by: 'framecut', from: SongSpec.section(doc, 'lyrics') ? ['lyrics'] : []
    });
    return true;
  };
  try {
    if (openedFramecutSongSpec?.text) {
      const doc = SongSpec.parse(openedFramecutSongSpec.text);
      if (!write(doc)) return;
      const text = SongSpec.serialize(doc);
      const name = openedFramecutSongSpec.name || SongSpec.fileName(doc);
      openedFramecutSongSpec = { name: openedFramecutSongSpec.name, text, data: readFramecutSongSpec(text) };
      SongSpec.download(text, name);
      message.textContent = 'Downloaded ' + name + ' with timed lyrics.';
    } else if (location.origin === 'https://gp-songtools.github.io' && SongSpec.store.load()) {
      let saved = true;
      SongSpec.store.update(doc => { saved = write(doc); });
      if (!saved) return;
      message.textContent = 'Saved timed lyrics to the shared Song Spec.';
    } else {
      const doc = SongSpec.parse(SongSpec.create());
      write(doc);
      const name = SongSpec.fileName(doc);
      SongSpec.download(SongSpec.serialize(doc), name);
      message.textContent = 'Downloaded ' + name + ' with timed lyrics.';
    }
  } catch (error) {
    message.textContent = 'Could not save timed lyrics: ' + (error?.message || 'unknown error');
    return;
  }
  renderFramecutSongSpec();
}

function isSongSpecFile(file) {
  return /\.songspec\.md$/i.test(file.name);
}

function connectFramecutSongSpec() {
  const input = $('songSpecFile');
  $('openSongSpec').onclick = () => input.click();
  input.onchange = () => {
    const file = input.files[0];
    input.value = '';
    if (file) openFramecutSongSpec(file);
  };
  $('useSharedSongSpec').onclick = () => {
    songSpecFileRevision++;
    openedFramecutSongSpec = null;
    $('songSpecError').textContent = '';
    renderFramecutSongSpec();
  };
  if (location.origin === 'https://gp-songtools.github.io') {
    const receive = text => {
      sharedFramecutSongSpec = readFramecutSongSpec(text);
      renderFramecutSongSpec();
    };
    SongSpec.store.onChange(receive);
    receive(SongSpec.store.load());
  } else {
    renderFramecutSongSpec();
  }
}
