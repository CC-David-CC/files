import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileBrowser, FileNavbar, FileToolbar, FileList, FileContextMenu, ChonkyActions, ChonkyIconName, defineFileAction} from '@samuelncui/chonky';
import {ChonkyIconFA} from '@samuelncui/chonky-icon-fontawesome';
import {createFilesController} from './controller.mjs';
import './style.css';
export {createFilesController} from './controller.mjs';
const h = React.createElement;
const Upload = defineFileAction({id: 'webos_upload', button: {name: 'Upload', toolbar: false, contextMenu: true, icon: ChonkyIconName.upload}});
const NewFolder = defineFileAction({id: 'webos_new_folder', button: {name: 'New folder', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const Rename = defineFileAction({id: 'webos_rename', requiresSelection: true, button: {name: 'Rename', toolbar: true, contextMenu: true, icon: ChonkyIconName.text}});
const Move = defineFileAction({id: 'webos_move', requiresSelection: true, button: {name: 'Move', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const Download = defineFileAction({id: 'webos_download', requiresSelection: true, button: {name: 'Download', toolbar: true, contextMenu: true, icon: ChonkyIconName.download}});
const Remove = defineFileAction({id: 'webos_remove', requiresSelection: true, hotkeys: ['delete'], button: {name: 'Delete', toolbar: true, contextMenu: true, icon: ChonkyIconName.trash}});

function ask({title, value, fieldLabel = 'Name', danger = false, items, signal}) {
  if (signal.aborted) return Promise.resolve(null);
  const dialog = document.createElement('dialog'), form = document.createElement('form'), heading = document.createElement('h2'), label = document.createElement('label'), input = document.createElement('input'), actions = document.createElement('div');
  dialog.className = 'webos-files-dialog'; heading.textContent = title; heading.id = 'files-dialog-' + crypto.randomUUID(); dialog.setAttribute('aria-labelledby', heading.id);
  const cancel = document.createElement('button'), submit = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'; submit.type = 'submit'; submit.textContent = danger ? 'Delete' : 'Continue';
  if (value !== undefined) { label.textContent = fieldLabel; input.value = value; input.required = true; label.append(input); form.append(label); }
  if (items) {
    const list = document.createElement('ul');
    for (const item of items) { const li = document.createElement('li'); li.textContent = item.name + (item.directory ? ' (folder)' : ''); list.append(li); }
    form.append(list);
    if (items.some(item => item.directory)) { const note = document.createElement('p'); note.textContent = 'Only empty folders can be deleted. Deletion stops if an item cannot be deleted.'; form.append(note); }
  }
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
  const [state, setState] = useState(controller.inspect), [message, setMessage] = useState(''), [pending, setPending] = useState(false), [dropActive, setDropActive] = useState(false);
  const upload = useRef(null), uploadTarget = useRef(null), taskActive = useRef(false);
  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    // External files dropped outside an upload target must not navigate away
    // from the desktop. Internal Chonky movement remains disabled.
    const prevent = event => { if ([...event.dataTransfer?.types || []].includes('Files')) event.preventDefault(); };
    window.addEventListener('dragover', prevent); window.addEventListener('drop', prevent);
    return () => { window.removeEventListener('dragover', prevent); window.removeEventListener('drop', prevent); };
  }, []);
  // Chonky requires a nonempty ID. The UI-only root sentinel cannot collide
  // with a canonical account path, which never starts with a slash.
  const chain = [{id: '/', name: 'My files', isDir: true}]; let current = '';
  for (const part of state.directory.split('/').filter(Boolean)) { current += (current ? '/' : '') + part; chain.push({id: current, name: part, isDir: true}); }
  const files = state.entries.map(item => ({id: item.path, name: item.name, isDir: item.directory, size: item.directory ? undefined : item.bytes, draggable: false, droppable: false}));
  async function task(action) {
    if (signal.aborted) return;
    if (taskActive.current || controller.inspect().busy) { setMessage('Wait for the current Files operation to finish, then try again.'); return; }
    taskActive.current = true; setPending(true); setMessage('');
    try { await action(); }
    catch (error) { if (!signal.aborted) setMessage(error.message + (error.outcome === 'unknown' ? ' The server outcome is unknown; refresh before retrying.' : '')); }
    finally { taskActive.current = false; if (!signal.aborted) setPending(false); }
  }
  function uploadFiles(selected, directory) {
    if (!selected.length) { setMessage('No files selected.'); return; }
    void task(async () => {
      let completed = 0;
      try {
        for (const file of selected) {
          if (signal.aborted) return;
          if (file.size > 128 * 1024 * 1024) throw Error('Files are limited to 128 MiB.');
          setMessage('Uploading ' + (completed + 1) + ' of ' + selected.length + ': ' + file.name + '…');
          await execute('import', {name: file.name, blob: new Blob([file]), expectedDirectory: directory}); completed++;
        }
        if (!signal.aborted) setMessage('Saved ' + completed + (completed === 1 ? ' file' : ' files') + ' to your account.');
      } catch (error) { throw Object.assign(Error((completed ? completed + ' files saved before upload stopped. ' : '') + error.message), {outcome: error.outcome}); }
    });
  }
  function beginUpload() {
    if (taskActive.current || controller.inspect().busy || signal.aborted) { setMessage('Wait for the current Files operation to finish, then try again.'); return; }
    if (uploadTarget.current !== null) return;
    uploadTarget.current = controller.inspect().directory;
    setMessage('Choose files to upload to ' + (uploadTarget.current || 'My files') + '.');
    try {
      if (typeof upload.current.showPicker === 'function') upload.current.showPicker();
      else upload.current.click();
    } catch (error) { uploadTarget.current = null; setMessage('Could not open the file picker: ' + error.message); }
  }
  useEffect(() => {
    const input = upload.current;
    const selected = () => {
      const files = [...input.files], directory = uploadTarget.current; input.value = ''; uploadTarget.current = null;
      if (directory === null) { setMessage('Choose Upload again in the destination folder.'); return; }
      uploadFiles(files, directory);
    };
    const cancelled = () => {
      // A picker owns only its waiting selection, never an import already
      // started by change. Ignore late notifications from a handled chooser.
      if (uploadTarget.current === null) return;
      uploadTarget.current = null;
      if (!taskActive.current) setMessage('Upload cancelled.');
    };
    // Listen to the native file-control events directly. React's normalized
    // cancel handler does not deliver this input's picker-cancellation event.
    input.addEventListener('change', selected); input.addEventListener('cancel', cancelled);
    return () => { input.removeEventListener('change', selected); input.removeEventListener('cancel', cancelled); };
  }, [controller, execute, signal]);
  const externalFiles = event => [...event.dataTransfer?.types || []].includes('Files');
  async function selected(event) {
    const items = event.state?.selectedFilesForAction || event.state?.selectedFiles || [];
    if (items.length !== 1) throw Error('Select one file or folder.');
    return await execute('snapshot', {path: items[0].id});
  }
  async function action(event) {
    if (event.id === Upload.id) { beginUpload(); return; }
    // Chonky's parent-arrow action already dispatches OpenFiles for the
    // breadcrumb parent. Handle that result once, not both notifications.
    if (![ChonkyActions.OpenFiles.id, NewFolder.id, Rename.id, Move.id, Remove.id, Download.id].includes(event.id)) return;
    await task(async () => {
      if (event.id === ChonkyActions.OpenFiles.id) {
        const item = event.payload?.targetFile || event.payload?.files?.[0];
        if (!item) return;
        if (chain.some(folder => folder.id === item.id)) return execute('list', {path: item.id === '/' ? '' : item.id});
        return execute('open', {path: item.id});
      }
      if (event.id === NewFolder.id) { const name = await ask({title: 'New folder', value: '', signal}); if (name !== null) await execute('mkdir', {name}); return; }
      if (![Rename.id, Move.id, Remove.id, Download.id].includes(event.id)) return;
      if (event.id === Remove.id) {
        const selection = [...(event.state?.selectedFilesForAction || event.state?.selectedFiles || [])];
        if (!selection.length) throw Error('Select files or folders to delete.');
        const items = [];
        for (const item of selection) { items.push(await execute('snapshot', {path: item.id})); if (signal.aborted) return; }
        const title = items.length === 1 ? 'Delete ' + items[0].name + ' from your account?' : 'Delete ' + items.length + ' items from your account?';
        if (await ask({title, items, danger: true, signal})) await execute('remove', {items: items.map(item => ({path: item.path, expectedRevision: item.sha256}))});
        return;
      }
      const item = await selected(event); if (signal.aborted) return;
      if (event.id === Rename.id) { const name = await ask({title: 'Rename ' + item.name, value: item.name, signal}); if (name !== null) await execute('rename', {path: item.path, name, expectedRevision: item.sha256}); }
      if (event.id === Move.id) { const destination = await ask({title: 'Move ' + item.name, fieldLabel: 'Destination path in My files', value: item.path, signal}); if (destination !== null) await execute('move', {path: item.path, destination, expectedRevision: item.sha256}); }
      if (event.id === Download.id) {
        const result = await execute('download', {path: item.path, expectedRevision: item.sha256}); if (signal.aborted) return;
        const url = URL.createObjectURL(new Blob([result.data])), link = document.createElement('a'); link.href = url; link.download = result.name; link.hidden = true; document.body.append(link);
        const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60000); downloads.set(url, timer);
        try { link.click(); setMessage('Download started: ' + result.name); } finally { link.remove(); }
      }
    });
  }
  const status = message || state.error || (state.busy || pending ? 'Working with the server…' : state.notice || 'Showing account files from the server.');
  return h('div', {className: 'webos-files-view',
    onDragEnterCapture: event => { if (!externalFiles(event)) return; event.preventDefault(); if (!taskActive.current && !controller.inspect().busy) setDropActive(true); },
    onDragOverCapture: event => { if (!externalFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = taskActive.current || controller.inspect().busy ? 'none' : 'copy'; },
    onDragLeaveCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false); },
    onDropCapture: event => {
      if (!externalFiles(event)) return; event.preventDefault(); event.stopPropagation(); setDropActive(false);
      if ([...event.dataTransfer.items || []].some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory)) { setMessage('Folder upload is not supported. Drop files instead.'); return; }
      uploadFiles([...event.dataTransfer.files || []], controller.inspect().directory);
    }},
    h('div', {className: 'webos-files-bar'}, h('strong', null, 'My files'), h('span', null, 'Account storage'),
      h('button', {type: 'button', disabled: state.busy || pending, onClick: () => task(() => execute('list'))}, 'Refresh')),
    h('input', {type: 'file', multiple: true, hidden: true, ref: upload, 'aria-label': 'Upload account files'}),
    h('div', {className: 'webos-files-browser', 'aria-busy': state.busy || pending},
      dropActive && h('div', {className: 'webos-files-drop-overlay', 'aria-hidden': true}, 'Drop files to upload to ' + (state.directory || 'My files')),
      h(FileBrowser, {files, folderChain: chain, onFileAction: action,
        iconComponent: ChonkyIconFA, fileActions: [Upload, NewFolder, Rename, Move, Download, Remove], disableDefaultFileActions: [ChonkyActions.DeleteFiles.id], disableDragAndDrop: true, clearSelectionOnOutsideClick: false},
        h(FileNavbar),
        h(FileToolbar, null, h('button', {type: 'button', className: 'webos-files-upload', disabled: state.busy || pending, onClick: beginUpload},
          h(ChonkyIconFA, {icon: ChonkyIconName.upload}), 'Upload')),
        h(FileList), h(FileContextMenu))),
    h('div', {className: 'webos-files-status', role: 'status'}, status));
}

export function mount({files, instanceId, sessionId, authority, authorize, openFile, activateFile, signal: parentSignal}) {
  const controller = createFilesController({files, instanceId, sessionId, authorize, openFile, activateFile}), element = document.createElement('div');
  element.className = 'webos-files'; const root = createRoot(element), abort = new AbortController(), downloads = new Map(); let disposed = false;
  const execute = (operation, args = {}) => controller.execute({instanceId, sessionId, operation, args}, authority);
  function dispose() { if (disposed) return; disposed = true; parentSignal?.removeEventListener('abort', dispose); abort.abort(); root.unmount(); controller.dispose(); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); element.remove(); }
  if (parentSignal?.aborted) { dispose(); throw new DOMException('Files startup cancelled.', 'AbortError'); }
  parentSignal?.addEventListener('abort', dispose, {once: true});
  root.render(h(FilesView, {controller, execute, signal: abort.signal, downloads}));
  const ready = execute('list'); ready.catch(() => {});
  return Object.freeze({element, dispose, ready, inspect: controller.inspect, execute, requestClose: () => !controller.inspect().busy});
}
