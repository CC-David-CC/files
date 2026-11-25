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

test('cancel deletion restores only the exact conflicted file tombstone', async () => {
  let item = {path:'/'+conflictPath,version:revision,deleted:true,directory:false,status:'conflict'};
  const calls = [];
  const files = {check() {}, async list(){return {entries:[]};}};
  const mirror = {
    async list(path) { assert.equal(path,'/'); return {entries:[item]}; },
    async resolve(path,choice,expected) {calls.push([path,choice,expected]);}
  };
  const controller = createFilesController({files,instanceId:'files',sessionId:'owner',
    authorize:async () => true,openFile() {},openConflictMirror:async () => mirror});
  const execute = () => controller.execute({instanceId:'files',sessionId:'owner',operation:'cancel-delete',
    args:{path:conflictPath,expectedRevision:revision}});
  item = {...item,deleted:false};
  await assert.rejects(execute(),/pending deletion changed/);
  assert.equal(calls.length,0);
  item = {...item,deleted:true};
  assert.equal((await execute()).status,'resolved');
  assert.deepEqual(calls,[['/'+conflictPath,'server',revision]]);
});

test('folder recovery creates a separate tree and checks for partial completion', async () => {
  const calls=[];
  const selected=[
    {path:'/Project',directory:true,version:revision},
    {path:'/Project/empty',directory:true,version:'dir'},
    {path:'/Project/note.txt',directory:false,version:'file',sha256},
  ];
  let fail=false;
  const files={
    check(){},
    async list(){return {entries:[]};},
    async mkdir(path){calls.push(['mkdir',path]);},
    async write(path,data,version){
      calls.push(['write',path,await data.text(),version]);
      if(fail)throw Error('Upload interrupted.');
      return {sha256};
    }
  };
  const mirror={
    async conflictTree(source,expected){assert.equal(source,'/Project');assert.equal(expected,revision);return selected;},
    async acquireSnapshot(path,options){
      assert.equal(path,'/Project/note.txt');
      assert.equal(options.expected,'file');
      return {sha256,data:new Blob(['device note']),release:()=>calls.push(['release'])};
    },
    async resolveConflictTree(source,destination,expected,selection){
      calls.push(['resolve',source,destination,expected]);assert.deepEqual(selection,selected);
    }
  };
  const controller=createFilesController({files,instanceId:'files',sessionId:'owner',authorize:async()=>true,
    openFile(){},openConflictMirror:async()=>mirror});
  const run=()=>controller.execute({instanceId:'files',sessionId:'owner',operation:'keep-folder',
    args:{path:'Project',name:'Project-copy',expectedRevision:revision}});
  assert.equal((await run()).status,'resolved');
  assert.deepEqual(calls,[
    ['mkdir','Project-copy'],['mkdir','Project-copy/empty'],
    ['write','Project-copy/note.txt','device note',null],['release'],
    ['resolve','/Project','/Project-copy',revision]
  ]);
  calls.length=0;
  fail=true;
  assert.equal((await run()).status,'copied');
  assert.match(controller.inspect().notice,/Copied 2 of 3.*original conflict remains open/);
  assert.equal(calls.some(call=>call[0]==='resolve'),false);
});
