import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FullFileBrowser, ChonkyActions, ChonkyIconName, defineFileAction} from '@samuelncui/chonky';
import {ChonkyIconFA} from '@samuelncui/chonky-icon-fontawesome';
import {createFilesController} from './controller.mjs';
import './style.css';
export {createFilesController} from './controller.mjs';
const h = React.createElement;
const Upload = defineFileAction({id: 'webos_upload', button: {name: 'Upload', toolbar: true, contextMenu: true, icon: ChonkyIconName.upload}});
const NewFolder = defineFileAction({id: 'webos_new_folder', button: {name: 'New folder', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const Rename = defineFileAction({id: 'webos_rename', requiresSelection: true, button: {name: 'Rename', toolbar: true, contextMenu: true, icon: ChonkyIconName.text}});
const Move = defineFileAction({id: 'webos_move', requiresSelection: true, button: {name: 'Move', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const Download = defineFileAction({id: 'webos_download', requiresSelection: true, button: {name: 'Download', toolbar: true, contextMenu: true, icon: ChonkyIconName.download}});
const Remove = defineFileAction({id: 'webos_remove', requiresSelection: true, button: {name: 'Delete', toolbar: true, contextMenu: true, icon: ChonkyIconName.trash}});

function ask({title, value, fieldLabel = 'Name', danger = false, signal}) {
  if (signal.aborted) return Promise.resolve(null);
  const dialog = document.createElement('dialog'), form = document.createElement('form'), heading = document.createElement('h2'), label = document.createElement('label'), input = document.createElement('input'), actions = document.createElement('div');
  dialog.className = 'webos-files-dialog'; heading.textContent = title; heading.id = 'files-dialog-' + crypto.randomUUID(); dialog.setAttribute('aria-labelledby', heading.id);
  const cancel = document.createElement('button'), submit = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; submit.type = 'submit'; submit.textContent = danger ? 'Delete' : 'Continue';
  if (value !== undefined) { label.textContent = fieldLabel; input.value = value; input.required = true; label.append(input); form.append(label); }
  actions.append(cancel, submit); form.prepend(heading); form.append(actions); dialog.append(form); document.body.append(dialog);
  return new Promise(resolve => {
    let done = false; const finish = result => { if (done) return; done = true; signal.removeEventListener('abort', abort); dialog.close(); dialog.remove(); resolve(result); };
    const abort = () => finish(null); signal.addEventListener('abort', abort, {once: true}); cancel.addEventListener('click', () => finish(null));
    form.addEventListener('submit', e => { e.preventDefault(); finish(value === undefined ? true : input.value); }); dialog.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    if (signal.aborted) return abort();
    try { dialog.showModal(); (value === undefined ? cancel : input).focus(); input.select(); } catch { finish(null); }
  });
}

function FilesView({controller, execute, signal, downloads}) {
  const [state, setState] = useState(controller.inspect), [message, setMessage] = useState(''), [pending, setPending] = useState(false), upload = useRef(null);
  useEffect(() => controller.subscribe(setState), [controller]);
  const chain = [{id: '', name: 'My files', isDir: true}]; let current = '';
  for (const part of state.directory.split('/').filter(Boolean)) { current += (current ? '/' : '') + part; chain.push({id: current, name: part, isDir: true}); }
  const files = state.entries.map(item => ({id: item.path, name: item.name, isDir: item.directory, size: item.directory ? undefined : item.bytes, draggable: false, droppable: false}));
  async function task(action) { if (pending || signal.aborted) return; setPending(true); setMessage(''); try { await action(); } catch (error) { if (!signal.aborted) setMessage(error.message + (error.outcome === 'unknown' ? ' The server outcome is unknown; refresh before retrying.' : '')); } finally { if (!signal.aborted) setPending(false); } }
  async function selected(event) {
    const items = event.state?.selectedFilesForAction || event.state?.selectedFiles || [];
    if (items.length !== 1) throw Error('Select one file or folder.');
    return await execute('snapshot', {path: items[0].id});
  }
  async function action(event) {
    if (event.id === Upload.id) { upload.current?.click(); return; }
    if (![ChonkyActions.OpenParentFolder.id, ChonkyActions.OpenFiles.id, NewFolder.id, Rename.id, Move.id, Remove.id, Download.id].includes(event.id)) return;
    await task(async () => {
      if (event.id === ChonkyActions.OpenParentFolder.id) return execute('list', {path: state.directory.split('/').slice(0, -1).join('/')});
      if (event.id === ChonkyActions.OpenFiles.id) { const item = event.payload?.targetFile || event.payload?.files?.[0]; if (item) return execute('open', {path: item.id}); return; }
      if (event.id === NewFolder.id) { const name = await ask({title: 'New folder', value: '', signal}); if (name !== null) await execute('mkdir', {name}); return; }
      if (![Rename.id, Move.id, Remove.id, Download.id].includes(event.id)) return;
      const item = await selected(event); if (signal.aborted) return;
      if (event.id === Rename.id) { const name = await ask({title: 'Rename ' + item.name, value: item.name, signal}); if (name !== null) await execute('rename', {path: item.path, name, expectedRevision: item.sha256}); }
      if (event.id === Move.id) { const destination = await ask({title: 'Move ' + item.name, fieldLabel: 'Destination path in My files', value: item.path, signal}); if (destination !== null) await execute('move', {path: item.path, destination, expectedRevision: item.sha256}); }
      if (event.id === Remove.id) { if (await ask({title: 'Delete ' + item.name + ' from your account?', danger: true, signal})) await execute('remove', {path: item.path, expectedRevision: item.sha256}); }
      if (event.id === Download.id) {
        const result = await execute('download', {path: item.path, expectedRevision: item.sha256}); if (signal.aborted) return;
        const url = URL.createObjectURL(new Blob([result.data])), link = document.createElement('a'); link.href = url; link.download = result.name; link.hidden = true; document.body.append(link);
        const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60000); downloads.set(url, timer);
        try { link.click(); setMessage('Download started: ' + result.name); } finally { link.remove(); }
      }
    });
  }
  return h('div', {className: 'webos-files-view'},
    h('div', {className: 'webos-files-bar'}, h('strong', null, 'My files'), h('span', null, 'Account storage'),
      h('button', {type: 'button', disabled: state.busy || pending, onClick: () => task(() => execute('list'))}, 'Refresh'),
      h('button', {type: 'button', 'aria-label': 'Parent folder', disabled: !state.directory || state.busy || pending, onClick: () => task(() => execute('list', {path: state.directory.split('/').slice(0, -1).join('/')}))}, 'Up')),
    h('input', {type: 'file', multiple: true, hidden: true, ref: upload, 'aria-label': 'Upload account files', onChange: event => {
      const selected = [...event.target.files]; event.target.value = '';
      task(async () => { let completed = 0; try { for (const file of selected) { if (signal.aborted) return; await execute('import', {name: file.name, blob: new Blob([file])}); completed++; } }
        catch (error) { throw Object.assign(Error((completed ? completed + ' files saved before upload stopped. ' : '') + error.message), {outcome: error.outcome}); } });
    }}),
    h('div', {className: 'webos-files-browser', 'aria-busy': state.busy || pending}, h(FullFileBrowser, {files, folderChain: chain, onFileAction: action,
      iconComponent: ChonkyIconFA, fileActions: [Upload, NewFolder, Rename, Move, Download, Remove], disableDefaultFileActions: [ChonkyActions.DeleteFiles.id], disableDragAndDrop: true})),
    h('div', {className: 'webos-files-status', role: 'status'}, message || state.error || (state.busy || pending ? 'Working with the server…' : state.notice || 'Showing account files from the server.')));
}

export function mount({files, instanceId, sessionId, authority, authorize, openFile, signal: parentSignal}) {
  const controller = createFilesController({files, instanceId, sessionId, authorize, openFile}), element = document.createElement('div');
  element.className = 'webos-files'; const root = createRoot(element), abort = new AbortController(), downloads = new Map(); let disposed = false;
  const execute = (operation, args = {}) => controller.execute({instanceId, sessionId, operation, args}, authority);
  function dispose() { if (disposed) return; disposed = true; parentSignal?.removeEventListener('abort', dispose); abort.abort(); root.unmount(); controller.dispose(); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); element.remove(); }
  if (parentSignal?.aborted) { dispose(); throw new DOMException('Files startup cancelled.', 'AbortError'); }
  parentSignal?.addEventListener('abort', dispose, {once: true});
  root.render(h(FilesView, {controller, execute, signal: abort.signal, downloads}));
  const ready = execute('list'); ready.catch(() => {});
  return Object.freeze({element, dispose, ready, inspect: controller.inspect, execute, requestClose: () => !controller.inspect().busy});
}
