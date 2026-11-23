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

// `audio` is the clip's level onset in seconds, or { onset, envelope } from the selected clip.
function normalizeLyricWords(words, duration, firstSignal, segments = [], audio = null) {
  const timed = words.filter(item => typeof item.word === 'string' && item.word.trim() &&
    Number.isFinite(item.start) && item.start < duration)
    .map(item => {
      const start = Math.max(firstSignal, item.start);
      const end = Number.isFinite(item.end) ? Math.max(start, Math.min(duration, item.end)) : start;
      return { ...item, word: item.word.trim(), start, end };
    })
    .sort((left, right) => left.start - right.start);
  if (!timed.length) return timed;

  const first = timed[0];
  const phrase = segments.find(({ text, start }) =>
    typeof text === 'string' && text.trim() && Number.isFinite(start) && start < duration);
  if (phrase && phrase.start - first.start > .15) {
    const opening = timed.slice(0, 4).flatMap(({ word }) => lyricTokens(word));
    const phraseTokens = lyricTokens(phrase.text);
    const count = Math.min(opening.length, phraseTokens.length, 3);
    if (count && phraseTokens.slice(0, count).every((token, i) => token === opening[i])) {
      for (const word of timed) {
        if (word.start >= phrase.start) break;
        word.start = phrase.start;
        word.end = Math.max(word.start, word.end);
      }
      return timed;
    }
  }

  repairOpeningLyricWords(timed, firstSignal, audio, segments);
  return timed;
}

// Whisper often pins the opening line to the clip start after an instrumental intro. It may
// stretch one or more of its words across the intro, leave a short word before a gap, or squeeze
// the whole line in at zero. Find the trustworthy end of that opening run (a stretched word's end,
// the next word after a gap, or the end of the phrase Whisper reported), then place the run just
// before it and refine with the audio's level onset when it agrees.
function repairOpeningLyricWords(timed, firstSignal, audio, segments = []) {
  const audioOnset = typeof audio === 'number' ? audio : audio?.onset;
  if (timed.length < 2 || timed[0].start > .15) return;
  const normal = word => word.end - word.start >= .06 && word.end - word.start <= 1.2;
  const durations = timed.slice(0, 12).filter(normal).map(word => word.end - word.start).sort((a, b) => a - b);
  if (durations.length < 3) return;
  const typical = durations[Math.floor(durations.length / 2)];
  const stretched = word => word.end - word.start > Math.max(1.5, typical * 4);
  let count = 0;
  while (count < Math.min(12, timed.length - 1)) {
    if (count && timed[count].start - timed[count - 1].end > .2) break;
    const word = timed[count++];
    // Keep consecutive stretched words together; the run ends after the last of them.
    if (stretched(word) && !(stretched(timed[count]) && timed[count].start - word.end <= .2)) break;
  }
  const run = timed.slice(0, count);
  const next = timed[count];
  const last = run.at(-1);
  const knownOnset = Number.isFinite(audioOnset) && audioOnset > timed[0].start + .3 ? audioOnset : null;
  let end = null;
  if (stretched(last)) {
    end = Math.min(last.end, next.start);
  } else if (next.start - last.end > Math.max(2, typical * 6)) {
    const phrase = segments.find(({ start, end: phraseEnd }) =>
      Number.isFinite(start) && Number.isFinite(phraseEnd) && start <= last.start + .15 && phraseEnd > last.end);
    const phraseTokens = lyricTokens(phrase?.text ?? '');
    const runTokens = run.flatMap(({ word }) => lyricTokens(word));
    const samePhrase = runTokens.length && runTokens.every((token, i) => phraseTokens[i] === token);
    if (samePhrase && phrase.end - last.end > 1 && phrase.end <= next.start + .2) end = phrase.end;
    // An unfinished phrase before a long gap belongs with the next word.
    else if (!/[.!?。！？,;:]["'”’)]?$/.test(last.word)) end = next.start;
    else if (knownOnset !== null && knownOnset < next.start - .06 * count) {
      end = Math.min(next.start, knownOnset + (last.end - timed[0].start));
    }
  }
  if (end === null || end - timed[0].start <= Math.max(2.5, typical * 2 * count)) return;
  let start = Math.max(firstSignal, end - count * typical);
  const localOnset = audio?.envelope ? lyricOnsetBefore(audio.envelope, end) : null;
  if (localOnset !== null && localOnset >= end - Math.max(4, count * typical * 4) && localOnset < end - .06 * count) {
    start = Math.max(firstSignal, localOnset);
  } else if (knownOnset !== null && knownOnset >= start - 1.5 && knownOnset < end - .06 * count) start = knownOnset;
  const step = (end - start) / count;
  run.forEach((word, i) => {
    word.start = start + i * step;
    word.end = start + (i + 1) * step;
  });
}

// Smoothed energy per 10 ms frame, kept so the samples can be transferred to a worker.
function lyricLevelEnvelope(samples, sampleRate) {
  const frame = Math.max(1, Math.round(sampleRate * .01));
  const count = Math.floor(samples.length / frame);
  const window = 10;
  const levels = new Float32Array(count);
  let total = 0;
  const energy = new Float32Array(count);
  for (let f = 0; f < count; f++) {
    let sum = 0;
    for (let i = f * frame, to = i + frame; i < to; i++) sum += samples[i] * samples[i];
    energy[f] = sum / frame;
    total += energy[f] - (f >= window ? energy[f - window] : 0);
    levels[f] = total / Math.min(f + 1, window);
  }
  return { levels, seconds: frame / sampleRate };
}

// Returns when the clip first reaches a sustained level near its loud passages (in seconds).
function detectLyricOnset(samples, sampleRate) {
  const { levels, seconds } = lyricLevelEnvelope(samples, sampleRate);
  const count = levels.length;
  if (count < 20) return null;
  const loud = Float32Array.from(levels).sort()[Math.floor(count * .95)];
  if (!(loud > 1e-8)) return null;
  const threshold = loud * 10 ** (-15 / 10);
  for (let f = 0, held = 0; f < count; f++) {
    held = levels[f] >= threshold ? held + 1 : 0;
    if (held >= 15) return (f - held + 1) * seconds;
  }
  return null;
}

// Finds where the vocals around a time began: walks back from it while the level stays within
// 15 dB of the loudest nearby passage, allowing short dips between syllables, and stops at the
// first quiet stretch. Sound earlier in an intro cannot move this onset.
function lyricOnsetBefore({ levels, seconds }, time, span = 4) {
  const last = Math.min(levels.length - 1, Math.round(time / seconds));
  const first = Math.max(0, Math.round((time - span) / seconds));
  if (last - first < 30) return null;
  let loud = 0;
  for (let f = Math.max(0, last - Math.round(1 / seconds)); f <= Math.min(levels.length - 1, last + Math.round(2 / seconds)); f++) {
    loud = Math.max(loud, levels[f]);
  }
  if (!(loud > 1e-8)) return null;
  const threshold = loud * 10 ** (-15 / 10);
  const pause = Math.round(.3 / seconds);
  let onset = null;
  for (let f = last, quiet = 0; f >= first; f--) {
    if (levels[f] >= threshold) {
      onset = f;
      quiet = 0;
    } else if (onset !== null && ++quiet >= pause) {
      return onset * seconds;
    }
  }
  return null;
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
  const vocalStart = Math.max(firstSignal, heard[0].time);
  const wordDuration = Math.max(.12, Math.min(.6,
    (words.at(-1).end - words[0].start) / heard.length));
  const times = ranges.map(({ from, to }) => {
    for (let i = from; i < to; i++) {
      if (matched.has(i)) return Math.max(vocalStart, matched.get(i) - (i - from) * wordDuration);
    }
    return null;
  });
  const anchors = times.flatMap((time, i) => time === null ? [] : [i]);
  const weights = ranges.map(({ from, to }) => Math.max(1, to - from));
  const first = anchors[0], last = anchors.at(-1);
  const openingWeight = weights.slice(0, first).reduce((sum, weight) => sum + weight, 0);
  let openingElapsed = 0;
  for (let i = 0; i < first; i++) {
    times[i] = vocalStart + (times[first] - vocalStart) * openingElapsed / openingWeight;
    openingElapsed += weights[i];
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
