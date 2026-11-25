import assert from 'node:assert/strict';
import test from 'node:test';
import {createFilesController} from '../src/controller.mjs';

const sha256 = 'a'.repeat(64);
const conflictPath = 'notes.txt';
const copyPath = 'notes (device copy).txt';
const revision = 'selected-version';

function fixture({writeError, existing, resolveError, snapshotError, allowed = true} = {}) {
  const calls = [];
  const files = {
    check() {},
    async list() { return {entries:[]}; },
    async write(path, data, previous) {
      calls.push(['write', path, await data.text(), previous]);
      if (writeError) throw writeError;
      return {sha256};
    },
    async version(path) { calls.push(['version', path]); return existing; }
  };
  const mirror = {
    async acquireSnapshot(path, options) {
      calls.push(['capture', path, options.expected]);
      if (snapshotError) throw snapshotError;
      return {data:new Blob(['device edits']), sha256, status:'conflict', release:() => calls.push(['release'])};
    },
    async resolve(path, choice, expected) {
      calls.push(['resolve', path, choice, expected]);
      if (resolveError) throw resolveError;
    }
  };
  const controller = createFilesController({files, instanceId:'files', sessionId:'owner',
    authorize:async () => allowed, openFile() {}, openConflictMirror:async () => mirror});
  const run = (args = {}) => controller.execute({instanceId:'files', sessionId:'owner', operation:'keep-both',
    args:{path:conflictPath, name:copyPath, expectedRevision:revision, ...args}});
  return {calls, controller, run};
}

test('keep both uploads the exact device revision without overwriting the account version', async () => {
  const {calls, run} = fixture();
  assert.equal((await run()).status, 'resolved');
  assert.deepEqual(calls, [
    ['capture', '/'+conflictPath, revision],
    ['write', copyPath, 'device edits', null],
    ['resolve', '/'+conflictPath, 'server', revision],
    ['release']
  ]);
});

test('a stale conflict or unauthorized choice leaves the account and device versions alone', async () => {
  const stale = fixture({snapshotError:Error('Conflict changed')});
  await assert.rejects(stale.run(), /Conflict changed/);
  assert.deepEqual(stale.calls, [['capture', '/'+conflictPath, revision]]);
  const rejected = fixture({allowed:false});
  await assert.rejects(rejected.run(), /operation denied/);
  assert.deepEqual(rejected.calls, []);
  await assert.rejects(rejected.run({name:conflictPath}), /new name/);
});

test('a different file at the chosen name is never overwritten', async () => {
  const {calls, run} = fixture({writeError:Object.assign(Error('Collision'),{status:409}), existing:{sha256:'b'.repeat(64)}});
  await assert.rejects(run(), /already exists/);
  assert.deepEqual(calls.map(call => call[0]), ['capture','write','version','release']);
});

test('an uncertain upload can reuse an exact saved copy, then resolve the original', async () => {
  const {calls, run} = fixture({writeError:Object.assign(Error('Response lost'),{outcome:'unknown'}), existing:{sha256}});
  assert.equal((await run()).status,'resolved');
  assert.deepEqual(calls.map(call => call[0]), ['capture','write','version','resolve','release']);
});

test('a revision change after upload preserves the confirmed copy and reports the unresolved original', async () => {
  const {calls, controller, run} = fixture({resolveError:Error('Conflict changed')});
  assert.equal((await run()).status,'copied');
  assert.match(controller.inspect().notice, /original still needs attention/);
  assert.deepEqual(calls.map(call => call[0]), ['capture','write','resolve','release']);
});
