import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFilesController} from '../src/controller.mjs';
const sha = 'a'.repeat(64);
function fixture({allowed = true, failure = null} = {}) {
 const calls = []; let moved = false;
 const files = {check() {}, async list() {return {entries: moved ? [] : [{name:'note.txt',directory:false,sha256:sha}]};},
 async rename(...args) {calls.push(args); if (failure) throw failure; moved = true;}};
 const controller = createFilesController({files,instanceId:'files-one',sessionId:'session-one',authorize:()=>allowed,openFile:()=>{}});
 const execute = (operation,args) => controller.execute({instanceId:'files-one',sessionId:'session-one',operation,args},{});
 return {controller,execute,calls};
}
test('move forwards exact source revision and destination to shared Storage',async()=>{
 const {controller,execute,calls}=fixture();await execute('list',{});
 const result=await execute('move',{path:'note.txt',destination:'folder/note.txt',expectedRevision:sha});
 assert.deepEqual(calls,[['note.txt','folder/note.txt',sha]]);assert.equal(result.committed,true);assert.equal(result.path,'folder/note.txt');assert.equal(controller.inspect().notice,'Moved on the server.');
});
test('move refuses unsafe destination and missing revision before mutation',async()=>{
 const {execute,calls}=fixture();await execute('list',{});
 for(const destination of ['../note.txt','/note.txt','folder/../note.txt','note.txt']) await assert.rejects(execute('move',{path:'note.txt',destination,expectedRevision:sha}));
 await assert.rejects(execute('move',{path:'note.txt',destination:'folder/note.txt'}));assert.deepEqual(calls,[]);
});
test('server conflict leaves source listed and never claims a confirmed move',async()=>{
 const failure=Object.assign(Error('Revision conflict'),{status:409});const {controller,execute}=fixture({failure});await execute('list',{});
 await assert.rejects(execute('move',{path:'note.txt',destination:'folder/note.txt',expectedRevision:sha}),/Revision conflict/);
 assert.equal(controller.inspect().entries[0].path,'note.txt');assert.equal(controller.inspect().notice,'');
});
test('unauthorized callers cannot invoke move',async()=>{
 const {execute,calls}=fixture({allowed:false});await assert.rejects(execute('move',{path:'note.txt',destination:'folder/note.txt',expectedRevision:sha}),/denied/);assert.deepEqual(calls,[]);
});
