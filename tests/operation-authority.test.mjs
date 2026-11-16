import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFilesController} from '../src/controller.mjs';

function fixture(authorize) {
  const writes = [], moves = [], revision = 'a'.repeat(64);
  const controller = createFilesController({instanceId: 'files-1', sessionId: 'session-1', authorize, openFile() {},
    files: {check() {}, async list() { return {entries: [{name: 'note.txt', directory: false}]}; },
      async write(...args) { writes.push(args); return {sha256: revision}; }, async rename(...args) { moves.push(args); }}});
  const run = (operation, args = {}) => controller.execute({instanceId: 'files-1', sessionId: 'session-1', operation, args}, {});
  return {controller, run, writes, moves, revision};
}

test('an import cannot follow folder navigation while its authorization waits', async () => {
  let entered, approve;
  const waiting = new Promise(resolve => { entered = resolve; });
  const f = fixture(async (_, request) => {
    if (request.operation === 'import') { entered(); return new Promise(resolve => { approve = resolve; }); }
    return true;
  });
  const pending = f.run('import', {name: 'upload.txt', blob: new Blob(['disposable'])});
  await waiting; await f.run('list', {path: 'other-folder'}); approve(true);
  await assert.rejects(pending, /folder changed/i); assert.equal(f.writes.length, 0);
});

test('move authorization sees the exact destination and source revision', async () => {
  let decision;
  const f = fixture((_, request) => {
    if (request.operation === 'list') return true;
    decision = request;
    return request.destination === 'allowed/note.txt' && request.expectedRevision === 'a'.repeat(64);
  });
  await f.run('list');
  await f.run('move', {path: 'note.txt', destination: 'allowed/note.txt', expectedRevision: f.revision});
  assert.equal(decision.path, 'note.txt'); assert.equal(decision.directory, '');
  assert.deepEqual(f.moves, [['note.txt', 'allowed/note.txt', f.revision]]);
  await assert.rejects(f.run('move', {path: 'note.txt', destination: 'forbidden/note.txt', expectedRevision: f.revision}), /denied/i);
  assert.equal(f.moves.length, 1);
});

test('import policy can restrict the actual account destination', async () => {
  const f = fixture((_, request) => request.operation === 'list' || request.destination === 'Documents/allowed.txt');
  await f.run('list', {path: 'Documents'});
  await f.run('import', {name: 'allowed.txt', blob: new Blob(['disposable'])});
  await assert.rejects(f.run('import', {name: 'forbidden.txt', blob: new Blob(['disposable'])}), /denied/i);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0][0], 'Documents/allowed.txt');
});

test('picker and batch imports cannot drift to a newly navigated folder', async () => {
  const f = fixture(() => true);
  await f.run('list', {path: 'Documents'});
  await f.run('import', {name: 'first.mp4', blob: new Blob(['first']), expectedDirectory: 'Documents'});
  await f.run('list', {path: 'other-folder'});
  await assert.rejects(f.run('import', {name: 'second.mp4', blob: new Blob(['second']), expectedDirectory: 'Documents'}), /destination folder changed/i);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0][0], 'Documents/first.mp4');
});
