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
  return {
    title: SongSpec.setting(doc, 'title'),
    bpm: numericSetting('bpm'),
    key: SongSpec.setting(doc, 'key'),
    duration: numericSetting('duration'),
    lyrics: SongSpec.stripTags(lyrics?.body),
    lyricsBy: lyrics?.by ? SongSpec.toolName(lyrics.by) : ''
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
  $('songSpecLyricsStatus').textContent = spec
    ? spec.lyrics ? 'Lyrics available' + (spec.lyricsBy ? ' from ' + spec.lyricsBy : '') +
      '. Select an Audio clip and choose Import Lyrics.' : 'This Song Spec has no lyrics.'
    : '';
  $('useSongSpecLyrics').hidden = !spec?.lyrics;
}

async function openFramecutSongSpec(file) {
  const revision = ++songSpecFileRevision;
  $('songSpecError').textContent = '';
  try {
    const data = readFramecutSongSpec(await file.text());
    if (revision !== songSpecFileRevision) return;
    if (!data) {
      $('songSpecError').textContent = 'Choose a Song Spec file with schema_version: 1.';
      return;
    }
    openedFramecutSongSpec = { name: file.name, data };
    renderFramecutSongSpec();
  } catch {
    if (revision === songSpecFileRevision) $('songSpecError').textContent = 'Could not read this Song Spec file.';
  }
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
