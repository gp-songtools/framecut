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
