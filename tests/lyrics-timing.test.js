'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
const run = code => JSON.parse(vm.runInContext('JSON.stringify(' + code + ')', context));
for (const file of ['lyrics-timing.js', 'lyrics.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context);
}
vm.runInContext('function createTitleClip(text, at, duration) { return { text, at, duration }; }', context);

test('recognizes LRC timestamps and structure while preserving lyric spelling and case', () => {
  const input = '[offset:250]\r\n[VERSE 1]\r\n[00:03.400] Café,  don’t go!\r\n\r\n[ Sing again! ]';
  assert.deepEqual(run('lyricAlignmentLines(' + JSON.stringify(input) + ')'),
    ['Café,  don’t go!', '[ Sing again! ]']);
});

test('aligns repeated lyrics monotonically and estimates unmatched lines between anchors', () => {
  const lines = ['Café,  don’t go!', 'An unsung refrain.', 'Café,  don’t go!'];
  const words = [
    ['cafe', 1], ["don't", 1.3], ['go', 1.6], ['cafe', 6], ["don't", 6.3], ['go', 6.6]
  ].map(([word, start]) => ({ word, start, end: start + .2 }));
  const result = run('alignWrittenLyrics(' + JSON.stringify(lines) + ',' + JSON.stringify(words) + ', 8)');
  assert.equal(result.matched, 2);
  assert.deepEqual(result.cues.map(cue => cue.text), lines);
  assert.deepEqual(result.cues.map(cue => cue.time), [1, 3.5, 6]);
});

test('returns no alignment for entirely unrelated words', () => {
  assert.equal(run('alignWrittenLyrics(["Exactly as written"], [{word:"banana",start:1,end:2}], 5)'), null);
});

test('moves a zero-time Whisper result past the actual start of the audio', () => {
  const heard = 'normalizeLyricWords([{word:"Ready",start:0,end:0.2}], 5, 0.6)';
  assert.deepEqual(run('groupLyricWords(' + heard + ')'), [{ text: 'Ready', time: .6 }]);
  assert.equal(run('alignWrittenLyrics(["Get ready"],' + heard + ', 5, 0.6).cues[0].time'), .6);
});

test('uses the matching Whisper phrase boundary after an instrumental intro', () => {
  const segments = '[{text:"The quiet garden",start:7,end:8.4}]';
  const words = '[{word:"The",start:0,end:7.2},{word:"quiet",start:7.2,end:7.5},{word:"garden",start:7.5,end:8}]';
  const heard = 'normalizeLyricWords(' + words + ', 10, 0.025,' + segments + ')';
  assert.deepEqual(run('alignWrittenLyrics(["The QUIET garden!"], ' + heard + ', 10, 0.025).cues'),
    [{ text: 'The QUIET garden!', time: 7 }]);
});

test('repairs a stretched opening word when word timing is the only evidence', () => {
  const input = [
    { word: 'The', start: .025, end: 7.25 },
    { word: 'quiet', start: 7.25, end: 7.5 },
    { word: 'apple', start: 7.5, end: 7.75 },
    { word: 'garden', start: 7.75, end: 8 }
  ];
  const heard = 'normalizeLyricWords(' + JSON.stringify(input) + ', 10, .025)';
  assert.equal(run(heard + '[0].start'), 7);
  assert.equal(run(heard + '[1].start'), 7.25);
  assert.equal(run('normalizeLyricWords(' + JSON.stringify(input) + ', 10, 3)[0].start'), 3);
});

test('keeps an unmatched first line after the instrumental lead-in', () => {
  const words = '[{word:"unclear",start:7,end:7.5},{word:"garden",start:10,end:10.5}]';
  const result = run('alignWrittenLyrics(["Unrecognized line.","Garden."],' + words + ',12,.025)');
  assert.deepEqual(result.cues.map(cue => cue.time), [7, 10]);
  assert.equal(result.matched, 1);
});

test('uses Unicode word segmentation for alignment', () => {
  const result = run('alignWrittenLyrics(["你好世界！"], [{word:"你好",start:1,end:2},{word:"世界",start:2,end:3}], 5)');
  assert.deepEqual(result, { matched: 1, cues: [{ time: 1, text: '你好世界！' }] });
});

test('rounds and orders cues inside the trim and maps source time to editable clip positions', () => {
  const output = run('formatTranscribedLrc([{time:0,text:"One"},{time:0,text:"Two"},{time:2,text:"Three"}], 4.2, 6.2)');
  assert.equal(output, '[00:04.200] One\n[00:04.201] Two\n[00:06.199] Three');
  assert.deepEqual(run('parseLrc(' + JSON.stringify(output) + ').cues.map(cue => cue.time)'), [4.2, 4.201, 6.199]);
  const clips = run('createLyricsClips(parseLrc(' + JSON.stringify(output) + ').cues, {start:4.2,end:6.2,at:10})');
  assert.deepEqual(clips.map(clip => clip.text), ['One', 'Two', 'Three']);
  assert.deepEqual(clips.map(clip => Math.round(clip.at * 1000)), [10000, 10001, 11999]);
  assert.deepEqual(clips.map(clip => Math.round(clip.duration * 1000)), [1, 1998, 1]);
});

const openingWords = (first, rest = 7.5) => [first, ...['quiet', 'apple', 'garden', 'grows'].map((word, i) => ({
  word, start: rest + i * .25, end: rest + (i + 1) * .25
}))];

test('moves a short zero-time opening word to the audio onset across an instrumental gap', () => {
  const words = JSON.stringify(openingWords({ word: 'The', start: 0, end: .38 }, 7.75));
  assert.equal(run('normalizeLyricWords(' + words + ', 12, .025, [], 7.48)[0].start'), 7.48);
  // Without audio evidence of a quiet intro, a lone opening word keeps its timing.
  assert.equal(run('normalizeLyricWords(' + words + ', 12, .025, [], .03)[0].start'), .025);
  assert.equal(run('normalizeLyricWords(' + words + ', 12, .025)[0].start'), .025);
  assert.equal(run('alignWrittenLyrics(["The quiet apple"], normalizeLyricWords(' + words +
    ', 12, .025, [], 7.48), 12, .025).cues[0].time'), 7.48);
});

test('repairs several stretched opening words', () => {
  const words = [{ word: 'The', start: 0, end: 4.1 }, { word: 'quiet', start: 4.1, end: 8 },
    ...['apple', 'garden', 'grows', 'tall'].map((word, i) => ({ word, start: 8 + i * .25, end: 8.25 + i * .25 }))];
  const repaired = run('normalizeLyricWords(' + JSON.stringify(words) + ', 12, .025)');
  assert.deepEqual(repaired.slice(0, 3).map(word => word.start), [7.5, 7.75, 8]);
  // An onset that agrees with the words refines the start; a far earlier one is ignored.
  assert.equal(run('normalizeLyricWords(' + JSON.stringify(words) + ', 12, .025, [], 7.4)[0].start'), 7.4);
  assert.equal(run('normalizeLyricWords(' + JSON.stringify(words) + ', 12, .025, [], 1)[0].start'), 7.5);
});

test('detects a sustained level onset after a quiet intro', () => {
  const onset = run(`(() => {
    const rate = 1000, samples = new Float32Array(12 * rate);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i) * (i < 7480 ? .003 : .4);
    return detectLyricOnset(samples, rate);
  })()`);
  assert.ok(Math.abs(onset - 7.48) <= .03, String(onset));
  assert.equal(run('detectLyricOnset(new Float32Array(5000), 1000)'), null);
});
