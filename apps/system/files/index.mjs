/** Account files are stored locally and synchronized through the host. */
export function mount(host){
 const {desktop,w}=host,{make,textButton,appInput}=host.ui,{mirrorFileContext,openMirrorEditor}=host.storage;
 const body=make('div','window-content files-content'),bar=make('form','app-toolbar'),tools=make('div','app-toolbar'),list=make('div','guest-file-list'),status=make('div','app-status');
 let directory='/',revision=0,context,unsubscribe=()=>{},busy=false;
 const path=appInput('Folder','/'),name=appInput('New item name');name.placeholder='New item name';
 const active=()=>!host.signal.aborted&&body.isConnected&&(!context||context.valid());
 const go=value=>{try{directory=context.path(value);path.value=directory;reload();}catch(e){status.textContent=e.message;}};
 bar.append(textButton('Home',()=>go('/')),textButton('Up',()=>go(directory.slice(0,directory.lastIndexOf('/'))||'/')),path);
 bar.addEventListener('submit',e=>{e.preventDefault();if(context)go(path.value);});
 const run=async fn=>{if(busy||!active()||!context)return;busy=true;try{await fn();name.value='';await reload();}catch(e){if(active())status.textContent=e.message;}finally{busy=false;}};
 const newPath=()=>context.path((directory==='/'?'':directory)+'/'+context.name(name.value));
 tools.append(name,textButton('New folder',()=>run(()=>context.files.mkdir(newPath()))),textButton('New text file',()=>run(async()=>{const p=newPath();await context.files.write(p,'');if(active())openMirrorEditor(desktop,context.owner,p);})));
 async function reload(){if(!context||!active())return;const n=++revision,target=directory;try{const [result,sync]=await Promise.all([context.files.list(target),context.files.status()]);if(!active()||n!==revision)return;list.replaceChildren();
  if(!result.entries.length)list.append(make('p','empty-folder','This folder is empty.'));
  for(const file of result.entries){const row=make('div','guest-file-row');row.append(textButton((file.directory?'▸ ':'')+file.name,()=>file.directory?go(file.path):openMirrorEditor(desktop,context.owner,file.path),'guest-file-name'),make('span','file-size',file.status==='conflict'?'Needs attention':file.status==='pending'?'Syncing':file.directory?'Folder':file.bytes+' bytes'));
   if(file.status==='conflict'&&!file.directory){row.append(textButton('Keep this copy',()=>run(()=>context.files.resolve(file.path,'local',file.version))),textButton('Use server copy',()=>run(()=>context.files.resolve(file.path,'server',file.version))));}
   else if(!file.deleted)row.append(textButton('Delete',()=>run(async()=>{if(confirm('Delete '+file.name+' from your files?'))await context.files.remove(file.path,file.version);})));list.append(row);
  }
  status.textContent=sync.conflicts?'Some files need attention. Choose which copy to keep.':sync.error?'Saved on this device. Waiting to sync: '+sync.error:sync.pending?'Saved on this device; syncing with server…':'Files are up to date.';
 }catch(e){if(active()&&n===revision)status.textContent=e.message;}}
 body.append(bar,tools,list,status);status.textContent='Opening your files…';
 queueMicrotask(async()=>{try{context=await mirrorFileContext();if(!active())return;unsubscribe=context.files.subscribe(()=>reload());await reload();}catch(e){if(!host.signal.aborted)status.textContent=e.message;}});
 return {element:body,dispose(){revision++;unsubscribe();}};
}
