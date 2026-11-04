// Prefer a detached Blob snapshot so Files does not materialize a second
// full-sized Uint8Array just to hand it to the browser's download machinery.
// Guest and older host implementations keep the byte-read fallback.
export async function readDownloadSnapshot(files,path,expectedVersion,{signal=null}={}){
 const check=()=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
 check();
 const item=typeof files.readBlob==='function'?await files.readBlob(path,{signal}):await files.read(path);
 // Older/guest byte readers may not support cancellation. Never start a
 // download from their eventual result after the Files window has closed.
 check();
 if(item.status==='conflict')throw Error('Resolve this file’s conflict in Files before downloading.');
 if(item.version!==expectedVersion)throw Error('The file changed. Reload and select it again.');
 const tag=Object.prototype.toString.call(item.data);
 return tag==='[object Blob]'||tag==='[object File]'?item.data:new Blob([item.data],{type:'application/octet-stream'});
}
