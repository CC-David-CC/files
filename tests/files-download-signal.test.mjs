import test from 'node:test';
import assert from 'node:assert/strict';
import {readDownloadSnapshot} from '../apps/system/files/download-snapshot.mjs';
test('download passes caller abort signal to detached file read',async()=>{
 const ctrl=new AbortController();let received;
 const files={async readBlob(path,options){assert.equal(path,'/file');received=options?.signal;return {data:new Blob(['ok']),version:'v1',status:'synced'}}};
 const result=await readDownloadSnapshot(files,'/file','v1',{signal:ctrl.signal});
 assert.equal(received,ctrl.signal);assert.equal(await result.text(),'ok');
});
