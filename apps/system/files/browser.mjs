/** Browser volume UI; persistence and account scoping belong to the host. */
export function browserFilesContent(host){
 const {desktop,w}=host,{make,textButton,appInput}=host.ui,{browserFileContext,browserFilesScope,browserFilesChanged,openBrowserEditor,fileVolumeBar,guestFiles,downloadGuestFile}=host.storage;
 const owner=browserFilesScope(),session=host.session(),body=make('div','window-content files-content');body.dataset.browserFiles='';body.append(fileVolumeBar(desktop,w));
 w.browserDirectories??=new Map();let directory=w.browserDirectories.get(owner)||'/',revision=0,busy=false,context=null;
 const current=()=>!host.signal.aborted&&body.isConnected&&host.session()===session&&browserFilesScope()===owner;
 const bar=make('form','app-toolbar'),path=appInput('Browser folder',directory),tools=make('div','app-toolbar'),input=appInput('New browser item name'),list=make('div','guest-file-list'),status=make('div','app-status'),retention=make('p','app-status');
 input.placeholder='New item name';list.dataset.browserFileList='';list.setAttribute('aria-label','Browser files');
 const go=p=>{try{directory=normal(p);w.browserDirectories.set(owner,directory);path.value=directory;reload();}catch(e){status.textContent=e.message;}};
 const normal=p=>{const raw=String(p).startsWith('/')?String(p):'/'+p,parts=[];for(const part of raw.split('/')){if(!part||part==='.')continue;if(part==='..')parts.pop();else parts.push(part);}return '/'+parts.join('/');};
 bar.append(textButton('Home',()=>go('/')),textButton('Up',()=>go(directory+'/..')),path,textButton('Refresh',()=>reload()));bar.addEventListener('submit',e=>{e.preventDefault();go(path.value);});
 const keep=textButton('Keep browser files',()=>{
  if(!current()||!context?.valid())return;keep.disabled=true;
  // Invoke persist directly inside the user gesture, before an awaited context.
  context.files.requestPersistence().then(p=>{if(current())retention.textContent=p.persistent?'Browser storage protection granted. Clearing site data or losing this device still removes these files.':'Files are saved in this browser, but the browser did not grant storage protection and may remove them under storage pressure. Download important files.';},e=>{if(current())retention.textContent=e.message;}).finally(()=>{if(current())keep.disabled=false;});
 });keep.disabled=true;
 const act=async task=>{if(busy||!current())return;busy=true;try{const c=await browserFileContext({signal:host.signal});if(!current()||!c.valid())return;const message=await task(c);if(!current()||!c.valid())return;input.value='';status.textContent=typeof message==='string'?message:'Saved in this browser.';browserFilesChanged();}catch(e){if(current())status.textContent=e.message;}finally{busy=false;}};
 const newPath=c=>c.files.path((directory==='/'?'':directory)+'/'+c.files.name(input.value));
 tools.append(input,textButton('New folder',()=>act(c=>c.files.mkdir(newPath(c)))),textButton('New text file',()=>act(async c=>{const p=newPath(c);await c.files.write(p,'');if(current()&&c.valid())openBrowserEditor(desktop,owner,p);} )));
 const upload=make('input');upload.type='file';upload.multiple=true;upload.hidden=true;upload.setAttribute('aria-label','Import browser files');upload.addEventListener('change',()=>act(async c=>{try{const target=directory;for(const file of upload.files){if(file.size>8*1024*1024)throw Error('Files are limited to 8 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());if(!current()||!c.valid())return;await c.files.write((target==='/'?'':target)+'/'+c.files.name(file.name),bytes);}}finally{upload.value='';}}));tools.append(textButton('Import…',()=>upload.click()),upload,keep);
 async function reload(){
  const request=++revision,target=directory;list.setAttribute('aria-busy','true');
  try{
   const c=await browserFileContext({signal:host.signal});if(!current()||!c.valid())return;context=c;const result=await c.files.list(target);if(!current()||!c.valid()||request!==revision)return;
   list.replaceChildren();if(!result.entries.length)list.append(make('p','empty-folder','This browser folder is empty.'));
   for(const file of result.entries){
    const row=make('div','guest-file-row');row.dataset.browserPath=file.path;row.append(textButton((file.directory?'▸ ':'')+file.name,()=>file.directory?go(file.path):openBrowserEditor(desktop,owner,file.path),'guest-file-name'),make('span','file-size',file.directory?'Folder':file.bytes+' bytes'));
    if(!file.directory){row.append(textButton('Download',()=>act(async c=>{const value=await c.files.read(file.path);if(current()&&c.valid())downloadGuestFile(file.name,value.data);})),textButton('Copy to Linux',()=>act(async c=>{
     const value=await c.files.read(file.path);if(!current()||!c.valid())return;const destination='/Downloads/'+guestFiles.name(file.name);try{await guestFiles.stat(destination);throw Error('A file with that name already exists in Linux Downloads.');}catch(e){if(!e.message.startsWith('File or folder not found'))throw e;}if(!current()||!c.valid())return;await guestFiles.write(destination,value.data);return 'Copied to temporary Linux Downloads. The saved browser file remains separate.';
    })) );}
    row.append(textButton('Delete',()=>act(async c=>{if(!confirm('Delete '+file.name+' from this browser?'))return;await c.files.remove(file.path,file.version);return 'Deleted from this browser.';})));list.append(row);
   }
   const p=await c.files.persistence();if(!current()||request!==revision)return;keep.disabled=!p.supported;retention.textContent=p.persistent?'Saved on this device with browser storage protection. Clearing site data or losing the device removes these files.':'Saved in this browser, separate from Linux RAM and server files. The browser may remove unprotected storage under pressure; download important files.';
   if(!status.textContent)status.textContent='On this device only · no server copy.';
  }catch(e){if(current()&&request===revision){list.replaceChildren(make('p','empty-folder',e.message));status.textContent=e.message;}}
  finally{if(request===revision)list.setAttribute('aria-busy','false');}
 }
 list.reload=reload;host.onDispose(()=>{revision++;list.reload=null;context=null;});body.append(bar,tools,list,status,retention);queueMicrotask(reload);return body;
}
