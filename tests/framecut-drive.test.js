'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'framecut-drive.js'), 'utf8'), context);
const call = (name, ...args) => vm.runInContext(name, context)(...args);

test('adds (2), (3) before the extension and never reuses a name', () => {
  assert.equal(call('uniqueDriveName', 'Song.webm', []), 'Song.webm');
  assert.equal(call('uniqueDriveName', 'Song.webm', ['Song.webm']), 'Song (2).webm');
  assert.equal(call('uniqueDriveName', 'Song.webm', ['Song.webm', 'Song (2).webm']), 'Song (3).webm');
  assert.equal(call('uniqueDriveName', 'My.mix.mp4', new Set(['My.mix.mp4'])), 'My.mix (2).mp4');
  assert.equal(call('uniqueDriveName', 'noext', ['noext']), 'noext (2)');
});

test('turns Drive errors into plain messages', () => {
  assert.equal(call('driveError', { code: 'auth', message: 'x' }), 'Google sign-in expired. Click again to sign in.');
  assert.equal(call('driveError', { code: 'cancelled', message: 'x' }), 'Cancelled.');
  assert.equal(call('driveError', { code: 'popup', message: 'Window closed.' }), 'Window closed.');
  assert.equal(call('driveError', new Error('Plain.')), 'Plain.');
  assert.equal(call('driveError', null), 'Google Drive failed.');
});

test('labels file sizes', () => {
  assert.equal(call('driveSizeLabel', '2048'), '2 KB');
  assert.equal(call('driveSizeLabel', 5 * 1024 * 1024), '5.0 MB');
  assert.equal(call('driveSizeLabel', undefined), '');
});
