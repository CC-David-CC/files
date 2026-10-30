import {browserFilesContent} from './browser.mjs';
export function mount(host){
const {desktop,w}=host;const {make,textButton,appInput}=host.ui;const {guestFiles,serverFilesAvailable,serverFileContext,fileVolumeBar,serverFilesChanged,openGuestEditor,openServerEditor,downloadGuestFile,signedInSubject}=host.storage;const currentSession=host.session();
function fileManagerContent(desktop,w){
  if(w.storage==='browser')return browserFilesContent(host);
  if(w.storage==='server')return serverFileManagerContent(desktop,w);
  const body=make('div','window-content files-content'),bar=make('form','app-toolbar');w.path=guestFiles.path(w.path||'/');
  const path=appInput('Guest folder','/home/guest'+(w.path==='/'?'':w.path)),list=make('div','guest-file-list'),message=make('div','app-status','Files in this guest session are temporary.');
  list.dataset.fileList='true';list.setAttribute('aria-label','Guest files');
  const go=p=>{try{w.path=guestFiles.path(p);path.value='/home/guest'+(w.path==='/'?'':w.path);reload();}catch(e){message.textContent=e.message;}};
  bar.append(textButton('Home',()=>go('/')),textButton('Up',()=>go(w.path+'/..')),path,textButton('Refresh',()=>reload()));bar.addEventListener('submit',e=>{e.preventDefault();go(path.value);});
  const tools=make('div','app-toolbar'),name=appInput('New item name');name.placeholder='New item name';
  const act=async f=>{if(host.signal.aborted)return;try{const result=await f();if(host.signal.aborted)return;name.value='';message.textContent=typeof result==='string'?result:'Done. Files remain temporary until downloaded.';reload();}catch(e){if(!host.signal.aborted)message.textContent=e.message;}};
  tools.append(name,textButton('New folder',()=>act(()=>guestFiles.mkdir(w.path+'/'+guestFiles.name(name.value)))) ,textButton('New text file',()=>act(async()=>{const p=guestFiles.path(w.path+'/'+guestFiles.name(name.value));try{await guestFiles.stat(p);throw Error('That name already exists.');}catch(e){if(!e.message.startsWith('File or folder not found'))throw e;}if(host.signal.aborted)return;await guestFiles.write(p,'');if(!host.signal.aborted)openGuestEditor(desktop,p);} )));
  const upload=make('input');upload.type='file';upload.multiple=true;upload.hidden=true;
  upload.addEventListener('change',()=>act(async()=>{for(const file of upload.files){if(file.size>8*1024*1024)throw Error('Files are limited to 8 MB.');const p=guestFiles.path(w.path+'/'+guestFiles.name(file.name));try{await guestFiles.stat(p);throw Error('A file named '+file.name+' already exists.');}catch(e){if(!e.message.startsWith('File or folder not found'))throw e;}const bytes=new Uint8Array(await file.arrayBuffer());if(host.signal.aborted)return;await guestFiles.write(p,bytes);if(host.signal.aborted)return;}upload.value='';}));
  tools.append(textButton('Import…',()=>upload.click()),upload);
  let snapshot='',revision=0;
  async function reload(){const request=++revision,target=w.path;try{const files=await guestFiles.list(target);if(host.signal.aborted||request!==revision||w.path!==target)return;const hash=JSON.stringify([target,files]);if(hash===snapshot)return;snapshot=hash;list.replaceChildren();if(!files.length)list.append(make('p','empty-folder','This folder is empty.'));
    for(const file of files){const row=make('div','guest-file-row');row.dataset.path=file.path;
      const open=textButton((file.dir?'▸ ':'')+file.name,()=>file.dir?go(file.path):openGuestEditor(desktop,file.path),'guest-file-name');
      row.append(open,make('span','file-size',file.dir?'Folder':file.size+' bytes'));
      if(!file.dir)row.append(textButton('Download',()=>act(async()=>{const bytes=await guestFiles.read(file.path);if(!host.signal.aborted)downloadGuestFile(file.name,bytes);})));
      if(!file.dir&&serverFilesAvailable()&&signedInSubject())row.append(textButton('Save to server…',()=>act(async()=>{
        const target=prompt('Save a new private server file (relative to your server home):',file.name);if(target===null)return;
        const c=await serverFileContext();if(host.signal.aborted||!c.valid())return;const bytes=await guestFiles.read(file.path);if(host.signal.aborted||!c.valid())return;await c.files.write(target,bytes);
        if(c.valid())serverFilesChanged();return 'Saved a private server copy as '+target+'. The guest copy remains temporary.';
      })));
      if(w.path==='/Trash')row.append(textButton('Restore',()=>act(()=>guestFiles.restore(file.path))));
      if(file.path!=='/Trash')row.append(textButton(w.path.startsWith('/Trash')?'Delete permanently':'Trash',()=>act(()=>guestFiles.trash(file.path))));
      list.append(row);
    }
  }catch(e){if(!host.signal.aborted&&request===revision){snapshot='';list.replaceChildren(make('p','empty-folder',e.message));}}}
  list.reload=reload;host.onDispose(()=>{revision++;list.reload=null;});body.append(fileVolumeBar(desktop,w),bar,tools,list,message);reload();return body;
}

function serverFileManagerContent(desktop,w){
  const body=make('div','window-content files-content');body.append(fileVolumeBar(desktop,w));
  const owner=signedInSubject();
  if(!owner){body.append(make('p','empty-folder','Sign in using Anon in the top bar to read and save your private server files. Temporary files remain available.'));return body;}
  w.serverDirectories??=new Map();let directory=w.serverDirectories.get(owner)||'';
  const bar=make('form','app-toolbar'),path=appInput('Server folder','/'+directory),tools=make('div','app-toolbar');
  const name=appInput('New server item name');name.placeholder='New item name';
  const list=make('div','guest-file-list'),status=make('div','app-status','Private server files · '+currentSession.public.name);
  list.dataset.serverFileList='true';list.setAttribute('aria-label','Server files');
  const current=()=>!host.signal.aborted&&body.isConnected&&signedInSubject()===owner;
  let revision=0,busy=false;
  const relative=p=>guestFiles.path(p).slice(1);
  const go=p=>{directory=relative(p);w.serverDirectories.set(owner,directory);path.value='/'+directory;reload();};
  bar.append(textButton('Home',()=>go('')),textButton('Up',()=>go(directory+'/..')),path,textButton('Refresh',()=>reload()));
  bar.addEventListener('submit',e=>{e.preventDefault();go(path.value);});
  const act=async task=>{
    if(busy||!current())return;busy=true;status.textContent='Working…';
    try{const context=await serverFileContext();if(!current()||!context.valid())return;const message=await task(context);if(!context.valid()||!current())return;name.value='';status.textContent=typeof message==='string'?message:'Done · private server files';serverFilesChanged();}
    catch(error){if(current())status.textContent=error.message;}
    finally{busy=false;}
  };
  const newPath=()=>[directory,guestFiles.name(name.value)].filter(Boolean).join('/');
  tools.append(name,textButton('New folder',()=>act(async c=>c.files.mkdir(newPath()))),textButton('New text file',()=>act(async c=>{const p=newPath();await c.files.write(p,'');if(c.valid()&&current())openServerEditor(desktop,owner,p);} )));
  const upload=make('input');upload.type='file';upload.multiple=true;upload.hidden=true;upload.setAttribute('aria-label','Import server files');
  upload.addEventListener('change',()=>act(async c=>{
    const target=directory;
    try{for(const file of upload.files){if(file.size>8*1024*1024)throw Error('Files are limited to 8 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());if(!current()||!c.valid())return;await c.files.write([target,guestFiles.name(file.name)].filter(Boolean).join('/'),bytes);}}
    finally{upload.value='';}
  }));
  tools.append(textButton('Import…',()=>upload.click()),upload);
  async function reload(){
    const request=++revision,target=directory;list.setAttribute('aria-busy','true');
    try{
      const c=await serverFileContext();if(!current()||!c.valid())return;const result=await c.files.list(target);
      if(request!==revision||!c.valid()||!current())return;
      list.replaceChildren();if(!result.entries.length)list.append(make('p','empty-folder','This server folder is empty.'));
      for(const file of result.entries){
        const p=[target,file.name].filter(Boolean).join('/'),row=make('div','guest-file-row');row.dataset.serverPath=p;
        row.append(textButton((file.directory?'▸ ':'')+file.name,()=>file.directory?go(p):openServerEditor(desktop,owner,p),'guest-file-name'),make('span','file-size',file.directory?'Folder':file.bytes+' bytes'));
        if(!file.directory){
          row.append(textButton('Word count on server',()=>act(async c=>{
            const source=await c.files.read(p);if(!c.valid()||!current())return;
            status.textContent='Server is creating a saved report…';
            const report=await c.files.wordCount(p,source.sha256);
            if(!c.valid()||!current())return;
            openServerEditor(desktop,owner,report.path);
            return 'Report saved on server: '+report.path;
          })));
          row.append(textButton('Download',()=>act(async c=>{const value=await c.files.read(p);if(c.valid()&&current())downloadGuestFile(file.name,value.data);})),textButton('Copy to guest',()=>act(async c=>{
            const value=await c.files.read(p);if(!c.valid()||!current())return;
            const target='/Downloads/'+guestFiles.name(file.name);
            try{await guestFiles.stat(target);throw Error('A file with that name is already in guest Downloads. Rename or remove it first.');}catch(error){if(!error.message.startsWith('File or folder not found'))throw error;}
            if(host.signal.aborted||!c.valid())return;await guestFiles.write(target,value.data);return 'Copied to guest '+target+' · changes in Linux remain temporary until saved back to the server.';
          })));
        }
        row.append(textButton('Delete',()=>act(async c=>{
          if(!confirm('Permanently delete '+file.name+' from your server files?'))return;
          const version=file.directory?null:(await c.files.read(p)).sha256;if(!current()||!c.valid())return;await c.files.remove(p,version);
        })));
        list.append(row);
      }
    }catch(error){if(request===revision&&current()){list.replaceChildren(make('p','empty-folder',error.message));status.textContent=error.message;}}
    finally{if(request===revision)list.setAttribute('aria-busy','false');}
  }
  list.reload=reload;body.append(bar,tools,list,status);queueMicrotask(reload);return body;
}

return {element:fileManagerContent(desktop,w),dispose(){}};
}
