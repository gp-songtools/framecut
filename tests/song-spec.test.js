'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({ location: { origin: 'null' }, Buffer, TextEncoder, TextDecoder });
for (const file of ['songspec.js', 'song-spec.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), context);
}
const format = cues => vm.runInContext('formatTimedLyricsSection', context)(cues);
const SongSpec = vm.runInContext('SongSpec', context);

test('sorts cues and writes one LRC line per text line', () => {
  assert.equal(format([{ time: 5, text: 'Second\nThird' }, { time: 1.234, text: 'First' }]),
    '[00:01.23] First\n[00:05.00] Second\n[00:05.00] Third');
});

test('rounds to hundredths with carry and allows minutes past 59', () => {
  assert.equal(format([{ time: 59.999, text: 'Carry' }, { time: 3905.2, text: 'Late' }]),
    '[01:00.00] Carry\n[65:05.20] Late');
});

test('skips empty text and tag-only lines', () => {
  assert.equal(format([{ time: 1, text: '[Chorus]\n\nSing' }, { time: 2, text: '   ' }, { time: 3, text: '[Verse 2] [x]' }]),
    '[00:01.00] Sing');
  assert.equal(format([]), '');
});

test('framecut can write a valid Timed lyrics section', () => {
  const doc = SongSpec.parse(SongSpec.create());
  const body = format([{ time: 4.5, text: 'Hello' }, { time: 9, text: 'World' }]);
  SongSpec.setSection(doc, 'timed-lyrics', body, { by: 'framecut', from: [] });
  const reparsed = SongSpec.parse(SongSpec.serialize(doc));
  assert.equal(SongSpec.section(reparsed, 'timed-lyrics').body, body);
  assert.equal(SongSpec.section(reparsed, 'timed-lyrics').by, 'framecut');
  assert.equal(SongSpec.validate(reparsed).filter(issue => issue.field === 'timed-lyrics').length, 0);
});
