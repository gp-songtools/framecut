'use strict';

const lyricWordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

function lyricAlignmentLines(text) {
  return text.split(/\r\n|\n|\r/).flatMap(raw => {
    const line = raw.replace(/^(?:\s*\[\d+:[0-5]?\d(?:\.\d{1,3})?\])+\s?/, '')
      .replace(/<\d+:[0-5]?\d(?:\.\d{1,3})?>/g, '');
    const bracketTag = /^\s*\[(?:[a-z][\w-]*:[^\]]*|(?:intro|verse|(?:pre[- ]?|post[- ]?)?chorus|hook|refrain|bridge|outro|interlude|instrumental|break|solo)(?:\s+\d+)?(?:\|[^\]]*)?)\]\s*$/i;
    if (!line.trim() || bracketTag.test(line)) return [];
    return [line];
  });
}

function lyricTokens(text) {
  return Array.from(lyricWordSegmenter.segment(text.normalize('NFKD').toLowerCase()))
    .filter(part => part.isWordLike)
    .map(part => part.segment.replace(/[\p{M}'’]/gu, ''));
}

function wordsFromLyricSegments(segments) {
  return segments.flatMap(({ text, start, end }) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const step = Math.max(0, end - start) / words.length;
    return words.map((word, i) => ({
      word, start: start + i * step, end: start + (i + 1) * step, phraseStart: i === 0
    }));
  });
}

function normalizeLyricWords(words, duration, firstSignal) {
  return words.filter(item => typeof item.word === 'string' && item.word.trim() &&
    Number.isFinite(item.start) && item.start < duration)
    .map(item => {
      const start = Math.max(firstSignal, item.start);
      const end = Number.isFinite(item.end) ? Math.max(start, Math.min(duration, item.end)) : start;
      return { ...item, word: item.word.trim(), start, end };
    })
    .sort((left, right) => left.start - right.start);
}

function groupLyricWords(words) {
  const cues = [];
  let cue;
  let previous;
  let count;
  for (const item of words) {
    if (!cue || item.phraseStart || item.start - previous.end > .6 ||
        /[.!?。！？]["'”’)]?$/.test(previous.word) || count >= 10 ||
        cue.text.length + item.word.length > 54) {
      cue = { time: item.start, text: item.word };
      cues.push(cue);
      count = 1;
    } else {
      cue.text += /^[,.!?;:、。！？]/.test(item.word) ? item.word : ' ' + item.word;
      count++;
    }
    previous = item;
  }
  return cues;
}

function similarLyricToken(left, right) {
  if (Math.min(left.length, right.length) < 4 || Math.abs(left.length - right.length) > 1) return false;
  if (left.length > right.length) [left, right] = [right, left];
  let i = 0, j = 0, edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (left.length === right.length) i++;
    j++;
  }
  return edits + right.length - j <= 1;
}

function alignLyricTokenTimes(written, heard) {
  const width = heard.length + 1;
  // A row of scores and one byte per backtrack step keeps long-song alignment bounded.
  if (written.length * heard.length > 8000000) throw Error('Too many lyrics to align at once. Try a shorter audio clip and the matching lyrics.');
  const directions = new Uint8Array((written.length + 1) * width);
  const scores = new Int32Array(width);
  for (let j = 1; j < width; j++) scores[j] = -j;
  for (let i = 1; i <= written.length; i++) {
    let diagonal = scores[0];
    scores[0] = -i;
    for (let j = 1; j < width; j++) {
      const above = scores[j];
      const left = written[i - 1], right = heard[j - 1].token;
      const match = left === right ? 4 : similarLyricToken(left, right) ? 1 : -3;
      const paired = diagonal + match;
      const skipWritten = above - 1;
      const skipHeard = scores[j - 1] - 1;
      let step = 0;
      if (paired > skipWritten && paired > skipHeard) {
        scores[j] = paired;
        step = 1;
      } else if (skipWritten >= skipHeard) {
        scores[j] = skipWritten;
        step = 2;
      } else {
        scores[j] = skipHeard;
        step = 3;
      }
      directions[i * width + j] = step;
      diagonal = above;
    }
  }
  const times = new Map();
  for (let i = written.length, j = heard.length; i > 0 && j > 0;) {
    const step = directions[i * width + j];
    if (step === 1) { times.set(--i, heard[--j].time); }
    else if (step === 2) i--;
    else j--;
  }
  return times;
}

function alignWrittenLyrics(lines, words, duration, firstSignal = 0) {
  const written = [];
  const ranges = lines.map(line => {
    const from = written.length;
    written.push(...lyricTokens(line));
    return { from, to: written.length };
  });
  const heard = words.flatMap(item => {
    const tokens = lyricTokens(item.word);
    return tokens.map((token, i) => ({ token, time: item.start + (item.end - item.start) * i / tokens.length }));
  });
  const matched = alignLyricTokenTimes(written, heard);
  if (!matched.size) return null;
  const wordDuration = Math.max(.12, Math.min(.6,
    (words.at(-1).end - words[0].start) / heard.length));
  const times = ranges.map(({ from, to }) => {
    for (let i = from; i < to; i++) {
      if (matched.has(i)) return Math.max(firstSignal, matched.get(i) - (i - from) * wordDuration);
    }
    return null;
  });
  const anchors = times.flatMap((time, i) => time === null ? [] : [i]);
  const weights = ranges.map(({ from, to }) => Math.max(1, to - from));
  const first = anchors[0], last = anchors.at(-1);
  for (let i = first - 1; i >= 0; i--) times[i] = times[i + 1] - weights[i] * wordDuration;
  if (times[0] < firstSignal) {
    for (let i = 0; i < first; i++) times[i] = firstSignal + (times[first] - firstSignal) * i / first;
  }
  for (let a = 1; a < anchors.length; a++) {
    const lo = anchors[a - 1], hi = anchors[a];
    const span = weights.slice(lo, hi).reduce((sum, n) => sum + n, 0);
    let elapsed = 0;
    for (let i = lo + 1; i < hi; i++) {
      elapsed += weights[i - 1];
      times[i] = times[lo] + (times[hi] - times[lo]) * elapsed / span;
    }
  }
  for (let i = last + 1; i < times.length; i++) times[i] = times[i - 1] + weights[i - 1] * wordDuration;
  if (last + 1 < times.length && times.at(-1) >= duration) {
    const span = times.at(-1) - times[last];
    const available = Math.max(0, duration - times[last]);
    for (let i = last + 1; i < times.length; i++) {
      times[i] = times[last] + (times[i] - times[last]) * available / (span + wordDuration);
    }
  }
  return { cues: lines.map((text, i) => ({ text, time: times[i] })), matched: anchors.length };
}

function formatTranscribedLrc(cues, sourceStart, sourceEnd) {
  const first = Math.ceil(sourceStart * 1000 - 1e-7);
  const last = Math.ceil(sourceEnd * 1000 - 1e-7) - 1;
  if (last - first + 1 < cues.length) throw Error('This audio clip is too short for all the lyric lines.');
  let previous = first - 1;
  return cues.map(({ time, text }, i) => {
    const ceiling = last - (cues.length - i - 1);
    const ms = Math.min(ceiling, Math.max(previous + 1, Math.round((sourceStart + time) * 1000)));
    previous = ms;
    const minutes = String(Math.floor(ms / 60000)).padStart(2, '0');
    const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    return '[' + minutes + ':' + seconds + '.' + String(ms % 1000).padStart(3, '0') + '] ' + text;
  }).join('\n');
}
