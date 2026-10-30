/** Chonky is an application view; the host owns identity and mirrored storage. */
import React, {useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FullFileBrowser,ChonkyActions,ChonkyIconName,defineFileAction} from '@samuelncui/chonky';
import {ChonkyIconFA} from '@samuelncui/chonky-icon-fontawesome';
import './files.css';
const h=React.createElement;
const RenameFile=defineFileAction({id:'codi_rename_file',requiresSelection:true,fileFilter:file=>!!file&&!file.isDir,button:{name:'Rename',contextMenu:true,toolbar:false,icon:ChonkyIconName.text}});
const basename=path=>path.slice(path.lastIndexOf('/')+1);
const parent=path=>path.slice(0,path.lastIndexOf('/'))||'/';
const makeChain=path=>{const chain=[{id:'/',name:'My files',isDir:true}];let current='';for(const part of path.split('/').filter(Boolean)){current+='/'+part;chain.push({id:current,name:part,isDir:true});}return chain;};

function FilesView({host}){
 const {desktop}=host,{mirrorFileContext,openMirrorEditor}=host.storage;
 const [context,setContext]=useState(null),[directory,setDirectory]=useState('/'),[entries,setEntries]=useState([]),[sync,setSync]=useState(null),[error,setError]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),revision=useRef(0),current=useRef('/'),pending=useRef(false);
 const reload=useCallback(async(c,dir)=>{const seq=++revision.current;try{const [listing,status]=await Promise.all([c.files.list(dir),c.files.status()]);if(!alive.current||!c.valid()||seq!==revision.current)return;setEntries(listing.entries);setSync(status);}catch(e){if(alive.current&&seq===revision.current)setError(e.message);}},[]);
 useEffect(()=>{alive.current=true;let unsubscribe=()=>{};mirrorFileContext().then(c=>{if(!alive.current||host.signal.aborted||!c.valid())return;setContext(c);unsubscribe=c.files.subscribe(()=>reload(c,current.current));reload(c,current.current);}).catch(e=>{if(alive.current)setError(e.message);});return ()=>{alive.current=false;revision.current++;unsubscribe();};},[host,reload]);
 const go=useCallback(path=>{if(!context)return;try{const next=context.path(path);current.current=next;setDirectory(next);setEntries([]);setError('');reload(context,next);}catch(e){setError(e.message);}},[context,reload]);
 const run=useCallback(async task=>{if(!context||pending.current||!context.valid()||host.signal.aborted)return;pending.current=true;setBusy(true);setError('');try{await task(context);if(alive.current&&context.valid())await reload(context,current.current);}catch(e){if(alive.current)setError(e.message);}finally{pending.current=false;if(alive.current)setBusy(false);}},[context,host,reload]);
 const create=folder=>run(async c=>{const p=c.path((current.current==='/'?'':current.current)+'/'+c.name(name));if(folder)await c.files.mkdir(p);else{await c.files.write(p,'');if(alive.current&&c.valid())openMirrorEditor(desktop,c.owner,p);}if(alive.current)setName('');});
 const files=entries.filter(f=>!f.deleted).map(f=>({id:f.path,name:f.name,isDir:f.directory,size:f.directory?undefined:f.bytes,openable:f.status!=='conflict'||!f.deleted,draggable:!f.directory&&f.status==='synced',droppable:f.directory,version:f.version,status:f.status==='conflict'?{label:'Needs attention',color:'#a94420'}:f.status==='pending'?{label:'Syncing',color:'#725c0a'}:undefined}));
 const action=useCallback(event=>{
   if(event.id===ChonkyActions.OpenParentFolder.id){go(parent(current.current));return;}
   if(event.id===ChonkyActions.OpenFiles.id){const f=event.payload.targetFile||event.payload.files?.[0];if(!f)return;if(f.isDir)go(f.id);else if(context)openMirrorEditor(desktop,context.owner,f.id);return;}
   if(event.id===RenameFile.id){const selected=event.state.selectedFilesForAction;if(selected.length!==1){setError('Select one file to rename.');return;}const file=selected[0],name=prompt('New file name:',file.name);if(name===null||name===file.name)return;run(async c=>{const target=(parent(file.id)==='/'?'':parent(file.id))+'/'+c.name(name);await c.files.move(file.id,target,file.version);});return;}
   if(event.id===ChonkyActions.MoveFiles.id){if(event.payload.copy){setError('Copying files is not available yet.');return;}const dest=event.payload.destination;if(!dest?.isDir)return;run(async c=>{for(const f of event.payload.files){if(f.isDir)throw Error('Moving folders is not available yet.');const target=(dest.id==='/'?'':dest.id)+'/'+f.name;if(target!==f.id)await c.files.move(f.id,target,f.version);}});return;}
   if(event.id===ChonkyActions.DeleteFiles.id){const selected=event.state.selectedFilesForAction;if(!selected.length||!confirm(`Delete ${selected.length===1?selected[0].name:selected.length+' items'} from your files?`))return;run(async c=>{for(const f of selected){if(f.status?.label==='Needs attention')throw Error('Resolve conflicting copies before deleting.');await c.files.remove(f.id,f.version);}});}
 },[context,desktop,go,openMirrorEditor,run]);
 const conflicts=entries.filter(f=>f.status==='conflict');
 const status=error||(!context?'Opening your files…':sync?.conflicts?'Some files need attention. Choose which copy to keep.':sync?.error?'Saved on this device. Waiting to sync: '+sync.error:sync?.pending?'Saved on this device; syncing with server…':'Files are up to date.');
 return h(React.Fragment,null,
  h('div',{className:'codi-files-create'},h('input',{'aria-label':'New item name',placeholder:'New item name',value:name,onChange:e=>setName(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();create(false);}}}),h('button',{type:'button',disabled:busy||!context,onClick:()=>create(true)},'New folder'),h('button',{type:'button',disabled:busy||!context,onClick:()=>create(false)},'New text file')),
  h('div',{className:'codi-chonky', 'aria-label':'Account files'},h(FullFileBrowser,{files,folderChain:makeChain(directory),iconComponent:ChonkyIconFA,fileActions:[ChonkyActions.DeleteFiles,RenameFile],onFileAction:action,defaultFileViewActionId:ChonkyActions.EnableListView.id,clearSelectionOnOutsideClick:false})),
  conflicts.length>0&&h('div',{className:'codi-file-conflicts'},conflicts.map(f=>h('div',{key:f.path},h('span',null,basename(f.path)+': '),f.directory?'Folder conflict needs attention':h(React.Fragment,null,h('button',{type:'button',disabled:busy,onClick:()=>run(c=>c.files.resolve(f.path,'local',f.version))},'Keep this copy'),h('button',{type:'button',disabled:busy,onClick:()=>run(c=>c.files.resolve(f.path,'server',f.version))},'Use server copy'))))),
  h('div',{className:'app-status','aria-live':'polite'},status));
}
export function mount(host){
 const element=host.ui.make('div','window-content files-content'),root=createRoot(element);root.render(h(FilesView,{host}));
 return {element,dispose(){root.unmount();}};
}
