import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFilesController} from '../src/controller.mjs';
function fixture({activate = () => false, open = () => {}, allowed = true} = {}) {
  const calls = [];
  const controller = createFilesController({instanceId:'files-1',sessionId:'session-1',authorize:()=>allowed,
    activateFile: value => {calls.push(['activate',value]);return activate(value);},
    openFile: value => {calls.push(['open',value]);return open(value);},
    files:{check(){},async list(){return {entries:[{name:'note.txt',directory:false},{name:'folder',directory:true}]};},
      async read(path){calls.push(['read',path]);return {data:new TextEncoder().encode('server'),sha256:'a'.repeat(64)};}}});
  const run=(operation,args={})=>controller.execute({instanceId:'files-1',sessionId:'session-1',operation,args},{});
  return {controller,run,calls};
}
test('an existing file is activated through the authorized open operation without reading server bytes',async()=>{
  const f=fixture({activate:()=>true});await f.run('list');
  assert.deepEqual(await f.run('open',{path:'note.txt'}),{status:'activated',path:'note.txt'});
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],['activate',{path:'note.txt',name:'note.txt',sessionId:'session-1',sourceInstanceId:'files-1'}]);
});
test('a new file uses the real read and exact host-open revision after activation misses',async()=>{
  const f=fixture();await f.run('list');const result=await f.run('open',{path:'note.txt'});
  assert.equal(result.status,'opened');assert.equal(result.sha256,'a'.repeat(64));assert.deepEqual(f.calls.map(x=>x[0]),['activate','read','open']);
  assert.equal(f.calls[2][1].sha256,'a'.repeat(64));
});
test('a host race that activates after the read does not claim a newly loaded document revision',async()=>{
  const f=fixture({open:()=>({status:'activated'})});await f.run('list');
  assert.deepEqual(await f.run('open',{path:'note.txt'}),{status:'activated',path:'note.txt'});
});
test('denied or unknown file targets cannot trigger activation, and folders retain navigation semantics',async()=>{
  const f=fixture();await f.run('list');await assert.rejects(f.run('open',{path:'missing.txt'}),/Refresh and select/);assert.equal(f.calls.length,0);
  await f.run('open',{path:'folder'});assert.equal(f.calls.length,0);
  const denied=fixture({allowed:false});await assert.rejects(denied.run('open',{path:'note.txt'}),/denied/);assert.equal(denied.calls.length,0);
});
test('an ambiguous activation acknowledgement is refused before any file transfer',async()=>{
  const f=fixture({activate:()=>({window:'wrong contract'})});await f.run('list');await assert.rejects(f.run('open',{path:'note.txt'}),/boolean/);assert.equal(f.calls.length,1);
});


test('Open With bypasses the default window and forwards only the verified selection',async()=>{
  const f=fixture({activate:()=>true});await f.run('list');
  const revision='a'.repeat(64);
  assert.equal((await f.run('open',{path:'note.txt',openWith:'spreadsheet',expectedRevision:revision})).status,'opened');
  assert.deepEqual(f.calls.map(x=>x[0]),['read','open']);
  assert.equal(f.calls[1][1].openWith,'spreadsheet');
  assert.equal(f.calls[1][1].sha256,revision);
});

test('Open With refuses an intervening file change before opening or activating any app',async()=>{
  const f=fixture({activate:()=>true});await f.run('list');
  await assert.rejects(f.run('open',{path:'note.txt',openWith:'spreadsheet',expectedRevision:'b'.repeat(64)}),/changed/);
  assert.deepEqual(f.calls,[['read','note.txt']]);
});
