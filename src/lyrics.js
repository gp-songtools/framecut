'use strict';

let lyricsAudioClip;
let lyricsFileRevision = 0;

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

function openLyricsDialog(audio) {
  if (audio?.track !== 'audio' || openingProject || exporting) return;
  pause();
  if (selected !== audio.id) {
    selected = audio.id;
    refresh();
  }
  lyricsAudioClip = audio;
  lyricsFileRevision++;
  $('lyricsAudio').textContent = 'Sync to ' + assets.get(audio.asset).name;
  $('lyricsText').value = '';
  $('lyricsFile').value = '';
  $('lyricsMessage').textContent = '';
  $('applyLyrics').disabled = false;
  $('lyricsDialog').showModal();
}

function connectLyricsImport() {
  const dialog = $('lyricsDialog');
  const input = $('lyricsFile');
  const text = $('lyricsText');
  const message = $('lyricsMessage');
  const apply = $('applyLyrics');
  $('timelineImportLyrics').onclick = () => openLyricsDialog(active());
  $('chooseLyricsFile').onclick = () => input.click();
  $('cancelLyrics').onclick = () => dialog.close();
  text.oninput = () => {
    lyricsFileRevision++;
    apply.disabled = false;
    message.textContent = '';
  };
  input.onchange = async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const revision = ++lyricsFileRevision;
    apply.disabled = true;
    message.textContent = '';
    try {
      const contents = await file.text();
      if (dialog.open && revision === lyricsFileRevision) text.value = contents;
    } catch {
      if (dialog.open && revision === lyricsFileRevision) message.textContent = 'Could not read this LRC file.';
    } finally {
      if (revision === lyricsFileRevision) apply.disabled = false;
    }
  };
  $('lyricsForm').onsubmit = event => {
    event.preventDefault();
    const audio = lyricsAudioClip;
    if (!clips.includes(audio)) {
      message.textContent = 'Reopen Import Lyrics from the audio clip you want to use.';
      return;
    }
    const { cues, untimed } = parseLrc(text.value);
    if (!cues.some(cue => cue.text)) {
      message.textContent = 'Enter timed lyrics such as [00:04.50] Your first lyric.';
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
    dialog.close();
    seek(titles[0].at);
    refresh();
    notify('Imported ' + titles.length + (titles.length === 1 ? ' lyric clip.' : ' lyric clips.') +
      (untimed ? ' Skipped ' + untimed + (untimed === 1 ? ' untimed line.' : ' untimed lines.') : ''));
  };
}
