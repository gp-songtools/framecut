'use strict';

let framecutSongSpecPanel;
let songSpecAudioSelected;

function syncFramecutSongSpecSelection(clip) {
  const audio = clip?.track === 'audio';
  if (audio !== songSpecAudioSelected) renderFramecutSongSpec();
}

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
  const video = SongSpec.section(doc, 'video-sequence');
  return {
    title: SongSpec.setting(doc, 'title'),
    bpm: numericSetting('bpm'),
    key: SongSpec.setting(doc, 'key'),
    duration: numericSetting('duration'),
    lyrics: SongSpec.stripTags(lyrics?.body),
    lyricsBy: lyrics?.by ? SongSpec.toolName(lyrics.by) : '',
    timedLyrics: timed?.body ?? '',
    timedLyricsBy: timed?.by ? SongSpec.toolName(timed.by) : '',
    video: video?.body ?? '',
    videoBy: video?.by ? SongSpec.toolName(video.by) : '',
    stale: SongSpec.summary(doc)
      .filter(row => row.present && ['lyrics', 'timed-lyrics', 'video-sequence'].includes(row.id))
      .flatMap(row => row.stale)
  };
}

function activeFramecutSongSpec() {
  return readFramecutSongSpec(SongSpec.store.load());
}

function songSpecLineCount(body) {
  return String(body || '').split('\n').filter(line => line.trim()).length;
}

function songSpecLinesLabel(count) {
  return count + (count === 1 ? ' line' : ' lines');
}

function songSpecTimeRange(body) {
  const stamps = [...String(body).matchAll(/^\s*\[(\d+:\d{2}(?:\.\d+)?)\]/gm)].map(match => match[1]);
  return stamps.length ? stamps[0] + '–' + stamps[stamps.length - 1] : '';
}

function songSpecInDialog(spec) {
  if (!spec || !$('lyricsDialog').open) return '';
  const value = $('lyricsText').value.trim();
  if (!value) return '';
  if (spec.timedLyrics && value === spec.timedLyrics.trim()) return 'Timed lyrics (' + (spec.timedLyricsBy || 'Song Spec') + ')';
  if (spec.lyrics && value === spec.lyrics.trim()) return 'Lyrics (' + (spec.lyricsBy || 'Song Spec') + ')';
  return '';
}

function renderFramecutSongSpec() {
  const box = $('songSpecFrom');
  if (!box) return;
  const spec = activeFramecutSongSpec();
  const audio = active()?.track === 'audio';
  songSpecAudioSelected = audio;
  const dialogOpen = $('lyricsDialog').open;
  const inUse = songSpecInDialog(spec);
  $('useSongSpecLyrics').hidden = !spec?.lyrics;
  $('useSongSpecTimedLyrics').hidden = !spec?.timedLyrics;
  box.replaceChildren();
  if (!spec) {
    box.hidden = true;
    return;
  }
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const fields = [
    ['Title', spec.title], ['BPM', spec.bpm], ['Key', spec.key],
    ['Duration', spec.duration && spec.duration + ' s']
  ].filter(([, value]) => value);
  const details = make('dl');
  for (const [label, value] of fields) details.append(make('dt', label), make('dd', value));
  const rows = [];
  const useRow = (text, title, use, used) => {
    const row = make('div', null, 'spec-row');
    row.append(make('span', text));
    if (title) row.title = title;
    if (used) row.append(make('b', 'In use', 'spec-used'));
    else {
      const button = make('button', 'Use in Import Lyrics');
      button.type = 'button';
      button.disabled = !audio && !dialogOpen;
      if (button.disabled) button.title = 'Select an audio clip first';
      button.onclick = use;
      row.append(button);
      if (button.disabled) row.append(make('small', 'Select an audio clip, then use these lyrics.', 'spec-note'));
    }
    return row;
  };
  const lyricsLines = songSpecLineCount(spec.lyrics);
  if (lyricsLines) {
    rows.push(useRow('Lyrics from ' + (spec.lyricsBy || 'the song spec') + ': ' + songSpecLinesLabel(lyricsLines) +
      ' ([tags] removed).', '', () => useSongSpecInImportLyrics('lyrics'), inUse.startsWith('Lyrics')));
  }
  const timedLines = songSpecLineCount(spec.timedLyrics);
  if (timedLines) {
    const range = songSpecTimeRange(spec.timedLyrics);
    rows.push(useRow('Timed lyrics from ' + (spec.timedLyricsBy || 'the song spec') + ': ' + songSpecLinesLabel(timedLines) +
      (range ? ', ' + range : '') + '.', 'Times are song time; use the full song audio clip.',
    () => useSongSpecInImportLyrics('timed'), inUse.startsWith('Timed')));
  }
  const videoLines = songSpecLineCount(spec.video);
  if (videoLines) {
    const row = make('div', null, 'spec-row');
    row.append(make('span', 'Video sequence from ' + (spec.videoBy || 'the song spec') + ': ' + videoLines +
      (videoLines === 1 ? ' clip.' : ' clips.')), make('small', 'Pick the scene clip files, or get them from this song\'s Google Drive folder, to put them on the timeline.', 'spec-note'));
    const place = make('button', 'Place clips…');
    place.type = 'button';
    place.onclick = openPlaceFilePicker;
    const fromDrive = make('button', 'Place clips from Drive…');
    fromDrive.type = 'button';
    fromDrive.onclick = placeClipsFromDrive;
    row.append(place, fromDrive);
    rows.push(row);
  }
  for (const note of spec.stale) rows.push(make('p', note, 'spec-stale'));
  if (inUse) rows.push(make('p', 'Import Lyrics is using from the song spec: ' + inUse, 'spec-used'));
  if (!fields.length && !rows.length) {
    box.hidden = true;
    return;
  }
  box.append(make('h3', 'From the song spec'),
    make('p', 'Optional: use any of these, or import your own.', 'secondary'));
  if (fields.length) box.append(details);
  box.append(...rows);
  box.hidden = false;
}

function useSongSpecInImportLyrics(kind) {
  if (!$('lyricsDialog').open) {
    const audio = active();
    if (audio?.track !== 'audio') return;
    openLyricsDialog(audio);
    if (!$('lyricsDialog').open) return;
  }
  if (kind === 'timed') useSongSpecTimedLyricsInDialog();
  else useSongSpecLyricsInDialog();
  renderFramecutSongSpec();
}

async function dropFramecutSongSpec(file) {
  const say = (text, kind) => framecutSongSpecPanel?.say(text, kind);
  try {
    const text = await file.text();
    const current = SongSpec.store.load();
    const present = current && SongSpec.summary(SongSpec.parse(current)).some(row => row.present);
    if (present && !confirm('Replace the song spec in this browser with ' + file.name + '?')) return;
    if (!SongSpec.store.save(text)) {
      say('This browser blocked saving the song spec (private mode or storage full).', 'ssp-e');
      return;
    }
    const errors = SongSpec.validate(SongSpec.parse(text)).filter(issue => issue.level === 'error');
    say(errors.length ? 'Opened ' + file.name + '. ' + errors.length + ' problem(s): ' + errors.map(issue => issue.message).join(' ')
      : 'Opened ' + file.name + '.', errors.length ? 'ssp-w' : '');
  } catch {
    say('Could not read this song spec file.', 'ssp-e');
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
  let cancelled = false;
  try {
    const doc = SongSpec.store.update(target => {
      const reason = SongSpec.confirmReason(target, 'timed-lyrics', 'framecut');
      if (reason && !confirm(reason + ' Overwrite the Timed lyrics section?')) {
        cancelled = true;
        return;
      }
      SongSpec.setSection(target, 'timed-lyrics', body, {
        by: 'framecut', from: SongSpec.section(target, 'lyrics') ? ['lyrics'] : []
      });
    });
    if (cancelled) return;
    const text = SongSpec.serialize(doc);
    if (SongSpec.store.load() === text) {
      message.textContent = 'Saved timed lyrics to the song spec. Use Download in the Song spec panel to keep a file.';
    } else {
      const name = SongSpec.fileName(doc);
      SongSpec.download(text, name);
      message.textContent = 'This browser blocked saving, so ' + name + ' was downloaded with timed lyrics.';
    }
  } catch (error) {
    message.textContent = 'Could not save timed lyrics: ' + (error?.message || 'unknown error');
  }
}

function isSongSpecFile(file) {
  return /\.songspec\.md$/i.test(file.name);
}

function connectFramecutSongSpec() {
  framecutSongSpecPanel = SongSpec.mountPanel($('songSpecMount'), { onChange: renderFramecutSongSpec });
  SongSpec.store.onChange(renderFramecutSongSpec);
  renderFramecutSongSpec();
}
