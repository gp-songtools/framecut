'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'place-clips.js'), 'utf8'), context);
const call = (name, ...args) => vm.runInContext(name, context)(...args);
const plain = value => JSON.parse(JSON.stringify(value));
const parse = (body, stats) => plain(call('parseVideoSequence', body, stats));

test('parses scenes, padded or not, and skips odd lines', () => {
  const stats = {};
  const scenes = parse('[00:00.00] 01_Intro_00-12.mp4\n\n[00:12.50] 2_Verse_12-26.mp4\nnot a line\n[01:05.00] 03_Outro_65-130.mp4\n[00:30] plain.mp4', stats);
  assert.equal(scenes.length, 4);
  assert.equal(stats.skipped, 1);
  assert.deepEqual(scenes[0], { line: 1, time: 0, name: '01_Intro_00-12.mp4', scene: 1, startSec: 0, endSec: 12 });
  assert.equal(scenes[1].time, 12.5);
  assert.equal(scenes[1].scene, 2);
  assert.equal(scenes[2].time, 65);
  assert.equal(scenes[2].endSec, 130);
  assert.deepEqual([scenes[3].scene, scenes[3].startSec, scenes[3].endSec], [null, null, null]);
});

const scenes = parse('[00:00.00] 01_Intro_00-12.mp4\n[00:12.00] 02_Verse1_12-26.mp4\n[00:26.00] 03_Chorus_26-39.mp4');

test('matches by exact name, case, then scene number, each file once', () => {
  const files = [{ name: '02_verse1_12-26.MP4' }, { name: '01_Intro_00-12.mp4' }, { name: '1_Other.mp4' }, { name: '99_Extra_00-05.mp4' }];
  const match = plain(call('matchSceneFiles', scenes, files));
  assert.deepEqual(match.byScene, [1, 0, -1]);
  assert.deepEqual(match.unmatched, [2, 3]);
});

test('falls back to the scene number, first file in name order wins', () => {
  const files = [{ name: '03_b_x.mp4' }, { name: '03_a_x.mp4' }, { name: '001-Intro.mov' }];
  const match = plain(call('matchSceneFiles', scenes, files));
  assert.deepEqual(match.byScene, [2, -1, 1]);
  assert.deepEqual(match.how, ['number', '', 'number']);
  assert.deepEqual(match.unmatched, [0]);
});

test('scene length from the name, the next line, or unknown', () => {
  const list = parse('[00:00.00] a.mp4\n[00:10.00] b_20-20.mp4\n[00:25.00] 01_X_5-9.mp4');
  assert.equal(call('sceneLength', list, 0), 10);
  assert.equal(call('sceneLength', list, 1), 15);
  assert.equal(call('sceneLength', list, 2), 4);
  assert.equal(call('sceneLength', list.slice(0, 1), 0), null);
});

test('plans positions with offset, trimming and short clips', () => {
  const byScene = [0, 1, -1];
  const durations = [30, 10];
  const plan = plain(call('planPlacement', scenes, byScene, { songZero: 5, durations }));
  assert.deepEqual(plan, [
    { scene: 0, file: 0, at: 5, start: 0, end: 12, short: false },
    { scene: 1, file: 1, at: 17, start: 0, end: 10, short: true }
  ]);
  const full = plain(call('planPlacement', scenes, byScene, { keepFull: true, durations }));
  assert.deepEqual([full[0].at, full[0].end], [0, 30]);
});

test('treats Drive files as video by type, or by extension when the type is generic', () => {
  assert.equal(call('driveVideoType', 'a.mp4', 'video/mp4'), 'video/mp4');
  assert.equal(call('driveVideoType', 'a.mp4', 'application/octet-stream'), 'video/mp4');
  assert.equal(call('driveVideoType', 'A.MOV', ''), 'video/quicktime');
  assert.equal(call('driveVideoType', 'a.webm', undefined), 'video/webm');
  assert.equal(call('driveVideoType', 'a.txt', 'application/octet-stream'), '');
  assert.equal(call('driveVideoType', 'a.mp4', 'image/png'), '');
  assert.equal(call('driveVideoType', 'noext', ''), '');
});
