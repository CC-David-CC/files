// Prefer a detached Blob snapshot so Files does not materialize a second
// full-sized Uint8Array just to hand it to the browser's download machinery.
// Guest and older host implementations keep the byte-read fallback.
export async function readDownloadSnapshot(files,path,expectedVersion){
 const item=typeof files.readBlob==='function'?await files.readBlob(path):await files.read(path);
 if(item.status==='conflict')throw Error('Resolve this file’s conflict in Files before downloading.');
 if(item.version!==expectedVersion)throw Error('The file changed. Reload and select it again.');
 const tag=Object.prototype.toString.call(item.data);
 return tag==='[object Blob]'||tag==='[object File]'?item.data:new Blob([item.data],{type:'application/octet-stream'});
}
