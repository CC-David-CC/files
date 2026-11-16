import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFilesController} from '../src/controller.mjs';

const sha = 'a'.repeat(64), changed = 'b'.repeat(64);
const selection = (...paths) => ({items: paths.map(path => ({path, expectedRevision: sha}))});
function fixture({authorize = () => true, remove} = {}) {
  const saved = new Map(['a.txt', 'b.txt', 'c.txt'].map(name => [name, {name, directory: false, sha256: sha}]));
  saved.set('empty', {name: 'empty', directory: true});
  const calls = []; let revoked = false;
  const controller = createFilesController({instanceId: 'files-1', sessionId: 'session-1', authorize, openFile() {}, files: {
    check() { if (revoked) throw Error('Session revoked.'); },
    async list() { return {entries: [...saved.values()]}; },
    async remove(path, revision) {
      calls.push([path, revision]);
      if (remove) await remove(path, revision, saved);
      else if (!saved.get(path)?.directory && saved.get(path)?.sha256 !== revision) throw Error('File revision changed.');
      saved.delete(path);
    }
  }});
  const run = (operation, args = {}) => controller.execute({instanceId: 'files-1', sessionId: 'session-1', operation, args}, {});
  return {controller, run, saved, calls, revoke() { revoked = true; }};
}

test('batch authorizes every exact revision before any deletion and preserves unselected files', async () => {
  const decisions = []; let f;
  f = fixture({authorize(_, request) { if (request.operation === 'remove') { assert.equal(f.calls.length, 0); decisions.push(request); } return true; }});
  await f.run('list'); const result = await f.run('remove', selection('a.txt', 'b.txt', 'empty'));
  assert.deepEqual(decisions.map(r => [r.path, r.expectedRevision]), [['a.txt', sha], ['b.txt', sha], ['empty', null]]);
  assert.equal(result.deletedCount, 3); assert.deepEqual([...f.saved.keys()], ['c.txt']);
  assert.equal(f.controller.inspect().notice, 'Deleted 3 items from your account.');
});

test('an invalid late item, duplicate or denied target prevents every deletion', async () => {
  const f = fixture({authorize: (_, request) => request.path !== 'b.txt'}); await f.run('list');
  await assert.rejects(f.run('remove', selection('a.txt', 'missing.txt')), /Refresh and select/);
  await assert.rejects(f.run('remove', selection('a.txt', 'a.txt')), /duplicates/);
  await assert.rejects(f.run('remove', {items: [{path: 'a.txt', expectedRevision: sha}, {path: 'b.txt'}]}), /exact selected file revision/);
  await assert.rejects(f.run('remove', selection('a.txt', 'b.txt')), /denied/);
  assert.equal(f.calls.length, 0);
});

test('selection is captured before asynchronous authorization and cannot be retargeted', async () => {
  let entered, approve; const waiting = new Promise(resolve => { entered = resolve; });
  const f = fixture({authorize(_, r) { if (r.operation === 'remove' && r.path === 'a.txt') { entered(); return new Promise(resolve => { approve = resolve; }); } return true; }});
  await f.run('list'); const args = selection('a.txt', 'b.txt'), pending = f.run('remove', args); await waiting;
  args.items[1].path = 'c.txt'; args.items[1].expectedRevision = changed; args.items.push({path: 'empty'}); approve(true);
  await pending; assert.deepEqual(f.calls, [['a.txt', sha], ['b.txt', sha]]); assert(f.saved.has('c.txt'));
});

test('revision conflict stops a batch, reports acknowledged count and refreshes surviving entries', async () => {
  const f = fixture(); await f.run('list'); f.saved.get('b.txt').sha256 = changed;
  await assert.rejects(f.run('remove', selection('a.txt', 'b.txt', 'c.txt')), error => {
    assert.equal(error.deletedCount, 1); assert.equal(error.total, 3); assert.match(error.message, /Confirmed deletion of 1 of 3/); return true;
  });
  assert.deepEqual(f.calls, [['a.txt', sha], ['b.txt', sha]]);
  assert.deepEqual(f.controller.inspect().entries.map(e => e.name), ['b.txt', 'c.txt', 'empty']);
  assert.equal(f.saved.get('b.txt').sha256, changed); assert.equal(f.controller.inspect().busy, false);
});

test('unknown outcome is never retried or counted as an acknowledged deletion', async () => {
  const f = fixture({remove(path, _, saved) { if (path === 'b.txt') { saved.delete(path); throw Object.assign(Error('Connection lost.'), {outcome: 'unknown'}); } }});
  await f.run('list');
  await assert.rejects(f.run('remove', selection('a.txt', 'b.txt', 'c.txt')), error => error.outcome === 'unknown' && error.deletedCount === 1);
  assert.equal(f.calls.length, 2); assert(f.saved.has('c.txt')); assert.match(f.controller.inspect().error, /Check the server before retrying/);
});

test('session revocation stops remaining items while counting an acknowledged deletion', async () => {
  let f; f = fixture({remove() { f.revoke(); }}); await f.run('list');
  await assert.rejects(f.run('remove', selection('a.txt', 'b.txt')), error => error.deletedCount === 1 && /Session revoked/.test(error.message));
  assert.equal(f.calls.length, 1); assert(f.saved.has('b.txt'));
});

test('navigation during authorization refuses the whole batch; legacy single deletion still works', async () => {
  let entered, approve; const waiting = new Promise(resolve => { entered = resolve; });
  const f = fixture({authorize(_, r) { if (r.operation === 'remove') { entered(); return new Promise(resolve => { approve = resolve; }); } return true; }});
  await f.run('list'); const pending = f.run('remove', selection('a.txt')); await waiting; await f.run('list', {path: 'other'}); approve(true);
  await assert.rejects(pending, /folder changed/); assert.equal(f.calls.length, 0);
  const single = fixture(); await single.run('list'); await single.run('remove', {path: 'a.txt', expectedRevision: sha});
  assert.equal(single.saved.has('a.txt'), false);
});

test('nonempty folder refusal stops remaining items without recursive deletion', async () => {
  const f = fixture({remove(path) { if (path === 'empty') throw Error('Folder is not empty.'); }}); await f.run('list');
  await assert.rejects(f.run('remove', selection('a.txt', 'empty', 'c.txt')), error => error.deletedCount === 1 && /not empty/.test(error.message));
  assert.deepEqual(f.calls, [['a.txt', sha], ['empty', null]]); assert(f.saved.has('c.txt')); assert(f.saved.has('empty'));
});
