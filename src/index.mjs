import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FileBrowser, FileNavbar, FileToolbar, FileList, FileContextMenu, ChonkyActions, ChonkyIconName, CustomVisibilityState, defineFileAction} from '@samuelncui/chonky';
import {ChonkyIconFA} from '@samuelncui/chonky-icon-fontawesome';
import {createFilesController} from './controller.mjs';
import './style.css';
export {createFilesController} from './controller.mjs';
const h = React.createElement;
const Upload = defineFileAction({id: 'webos_upload', button: {name: 'Upload', toolbar: false, contextMenu: true, icon: ChonkyIconName.upload}});
const NewFolder = defineFileAction({id: 'webos_new_folder', button: {name: 'New folder', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const hasSingleFile = ({selectedFiles}) => selectedFiles.length === 1 && !selectedFiles[0].isDir;
const singleFileAction = {
  requiresSelection: true,
  customVisibility: state => hasSingleFile(state) ? CustomVisibilityState.Default : CustomVisibilityState.Disabled,
};
const Open = {
  ...ChonkyActions.OpenSelection,
  customVisibility: ({selectedFilesForAction}) => selectedFilesForAction.length === 1
    ? CustomVisibilityState.Default : CustomVisibilityState.Disabled,
  button: {...ChonkyActions.OpenSelection.button, name: 'Open', group: undefined},
};
const Rename = defineFileAction({id: 'webos_rename', ...singleFileAction, button: {name: 'Rename', toolbar: true, contextMenu: true, icon: ChonkyIconName.text}});
const Move = defineFileAction({id: 'webos_move', ...singleFileAction, button: {name: 'Move', toolbar: true, contextMenu: true, icon: ChonkyIconName.folder}});
const Download = defineFileAction({id: 'webos_download', ...singleFileAction, button: {name: 'Download', toolbar: true, contextMenu: true, icon: ChonkyIconName.download}});
const openWithAction = openChoices => defineFileAction({
  id:'webos_open_with', ...singleFileAction,
  customVisibility:state=>hasSingleFile(state) && openChoices(state.selectedFiles[0].id).length>1
    ? CustomVisibilityState.Default : CustomVisibilityState.Disabled,
  button:{name:'Open With…',toolbar:true,contextMenu:true}
});
const Remove = defineFileAction({id: 'webos_remove', requiresSelection: true, hotkeys: ['delete'], button: {name: 'Delete', toolbar: true, contextMenu: true, icon: ChonkyIconName.trash}});

function ask({title, value, choices, description, fieldLabel = 'Name', danger = false, items, signal, selectDestination, confirmLabel, cancelLabel = 'Cancel'}) {
  if (signal.aborted) return Promise.resolve(null);
  const dialog = document.createElement('dialog'), form = document.createElement('form'), heading = document.createElement('h2'), actions = document.createElement('div');
  const input = !choices && value !== undefined ? document.createElement('input') : null;
  let initialFocus = input;
  dialog.className = 'webos-files-dialog'; heading.textContent = title; heading.id = 'files-dialog-' + crypto.randomUUID(); dialog.setAttribute('aria-labelledby', heading.id);
  const cancel = document.createElement('button'), submit = document.createElement('button'); cancel.type = 'button'; cancel.textContent = cancelLabel; submit.type = 'submit'; submit.textContent = confirmLabel ?? (choices ? 'Open' : danger ? 'Delete' : 'Continue');
  if (choices) {
    const group = document.createElement('fieldset'), legend = document.createElement('legend');
    group.className = 'webos-files-app-choices';
    legend.textContent = fieldLabel;
    group.append(legend);
    for (const {id,label: text} of choices) {
      const label = document.createElement('label'), radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'application';
      radio.value = id;
      if (!initialFocus) {
        radio.checked = true;
        initialFocus = radio;
      }
      label.append(radio, text);
      group.append(label);
    }
    form.append(group);
  } else if (input) {
    const label = document.createElement('label');
    label.textContent = fieldLabel;
    input.value = value;
    input.required = true; label.append(input); form.append(label);
  }
  const browse = selectDestination ? document.createElement('button') : null;
  const pickerError = browse ? document.createElement('p') : null;
  if (browse) {
    browse.type = 'button';
    browse.textContent = 'Choose folder…';
    pickerError.hidden = true;
    pickerError.setAttribute('role', 'status');
    form.append(browse, pickerError);
  }
  if (items) {
    const list = document.createElement('ul');
    for (const item of items) { const li = document.createElement('li'); li.textContent = item.name + (item.directory ? ' (folder)' : ''); list.append(li); }
    form.append(list);
    if (items.some(item => item.directory)) { const note = document.createElement('p'); note.textContent = 'Only empty folders can be deleted. Deletion stops if an item cannot be deleted.'; form.append(note); }
  }
  actions.append(cancel, submit);
  if (description) {
    const detail = document.createElement('p');
    detail.textContent = description;
    detail.id = heading.id + '-detail';
    dialog.setAttribute('aria-describedby', detail.id);
    form.prepend(detail);
  }
  form.prepend(heading); form.append(actions); dialog.append(form); document.body.append(dialog);
  return new Promise(resolve => {
    let done = false; const finish = result => { if (done) return; done = true; signal.removeEventListener('abort', abort); dialog.close(); dialog.remove(); resolve(result); };
    const abort = () => finish(null); signal.addEventListener('abort', abort, {once: true}); cancel.addEventListener('click', () => finish(null));
    form.addEventListener('submit', e => {
      e.preventDefault();
      finish(choices ? new FormData(form).get('application') : (input ? input.value : true));
    });
    dialog.addEventListener('cancel', e => { e.preventDefault(); finish(null); });
    browse?.addEventListener('click', async () => {
      browse.disabled = true;
      pickerError.hidden = true;
      let destination;
      try { destination = await selectDestination(); }
      catch (error) {
        if (done) return;
        pickerError.textContent = error.message;
        pickerError.hidden = false;
      }
      if (done) return;
      browse.disabled = false;
      if (destination == null) {
        browse.focus();
        return;
      }
      input.value = destination;
      input.focus();
    });
    if (signal.aborted) return abort();
    try {
      dialog.showModal();
      (browse ?? initialFocus ?? cancel).focus();
      if (!browse && input) input.select();
    } catch { finish(null); }
  });
}

function useConflicts(openConflictMirror, directory, signal) {
  const [listing, setListing] = useState(null);
  useEffect(() => {
    if (!openConflictMirror) return;
    let active = true, revision = 0, unsubscribe;
    const refresh = async mirror => {
      const request = ++revision;
      try {
        const result = await mirror.list('/' + directory);
        if (active && !signal.aborted && request === revision) {
          setListing({directory, entries: result.entries.filter(item => item.status === 'conflict')});
        }
      } catch {
        if (active && !signal.aborted && request === revision) setListing(null);
      }
    };
    void openConflictMirror().then(mirror => {
      if (!active || signal.aborted) return;
      unsubscribe = mirror.subscribe(() => { void refresh(mirror); });
      return refresh(mirror);
    }).catch(() => { if (active && !signal.aborted) setListing(null); });
    return () => { active = false; unsubscribe?.(); };
  }, [openConflictMirror, directory, signal]);
  return listing?.directory === directory ? listing.entries : [];
}

function FilesView({controller, execute, signal, downloads, onRefresh, openChoices, pickMoveFolder, openConflictMirror, temporary, darkMode}) {
  const OpenWith = React.useMemo(() => openWithAction(openChoices), [openChoices]);
  const [state, setState] = useState(controller.inspect), [message, setMessage] = useState(''), [pending, setPending] = useState(false), [dropActive, setDropActive] = useState(false);
  const conflicts = useConflicts(openConflictMirror, state.directory, signal);
  const browser = useRef(null);
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
  function keepBoth(item) {
    void task(async () => {
      const extension = item.directory ? 0 : Math.max(0, item.name.lastIndexOf('.'));
      const base = extension === 0 ? item.name : item.name.slice(0, extension);
      const name = await ask({title: 'Keep both versions of ' + item.name,
        fieldLabel: item.directory ? 'Name for the device folder' : 'Name for the device copy',
        description: item.directory
          ? 'Save the device folder under a new name. Account contents at the original path stay as they are.'
          : 'The account version stays as it is. Save the edits from this device under a new name in this folder.',
        value: base + (item.directory ? ' (device folder)' : ' (device copy)') + (extension === 0 ? '' : item.name.slice(extension)),
        confirmLabel: 'Keep both', signal});
      if (name === null || signal.aborted) return;
      await execute(item.directory ? 'keep-folder' : 'keep-both', {path: item.path.slice(1), name, expectedRevision: item.version});
      // The selected conflict row may disappear. Keep keyboard focus in Files.
      conflictFocus.current?.focus({preventScroll: true});
    });
  }
  function cancelDeletion(item) {
    void task(async () => {
      const confirmed = await ask({title: 'Cancel pending deletion of ' + item.name,
        description: item.directory
          ? 'Keep the account version. This cancels pending deletions for this folder and its contents on this device.'
          : 'Keep the account version. This cancels the pending deletion on this device.',
        confirmLabel: 'Cancel deletion', cancelLabel: 'Go back', signal});
      if (!confirmed || signal.aborted) return;
      await execute('cancel-delete', {path: item.path.slice(1), expectedRevision: item.version});
      conflictFocus.current?.focus({preventScroll: true});
    });
  }
  const conflictFocus = useRef(null);
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
        if (!signal.aborted) setMessage('Saved ' + completed + (completed === 1 ? ' file' : ' files') + (temporary ? ' in this tab.' : ' to your account.'));
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
  function openItem(item) {
    if (chain.some(folder => folder.id === item.id)) return execute('list', {path: item.id === '/' ? '' : item.id});
    return execute('open', {path: item.id});
  }
  function focusFileList() {
    // The selected row and its actions may disappear when the folder refreshes.
    const list = browser.current?.querySelector('[role="list"]') ?? browser.current;
    if (list) {
      list.tabIndex = -1;
      list.focus({preventScroll: true});
    }
  }
  function openFocusedItem(event) {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const row = event.target;
    if (!row.matches?.('[role="listitem"][data-chonky-context-file-id]')) return;
    const item = files.find(file => file.id === row.dataset.chonkyContextFileId);
    if (!item) return;
    // Chonky's Enter opens the selection before checking the focused row.
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    void task(() => {
      if (item.isDir) focusFileList();
      return openItem(item);
    });
  }
  async function action(event) {
    if (event.id === Upload.id) { beginUpload(); return; }
    // Chonky's parent-arrow action already dispatches OpenFiles for the
    // breadcrumb parent. Handle that result once, not both notifications.
    if (![ChonkyActions.OpenFiles.id, NewFolder.id, Rename.id, Move.id, Remove.id, Download.id, OpenWith.id].includes(event.id)) return;
    await task(async () => {
      if (event.id === ChonkyActions.OpenFiles.id) {
        const item = event.payload?.targetFile || event.payload?.files?.[0];
        if (item) return openItem(item);
      }
      if (event.id === NewFolder.id) { const name = await ask({title: 'New folder', value: '', signal}); if (name !== null) await execute('mkdir', {name}); return; }
      if (event.id === OpenWith.id) {
        const selection = event.state?.selectedFiles || [];
        if (selection.length !== 1 || selection[0].isDir) throw Error('Select one file to open.');
        const item = await selected(event);
        const choices = openChoices(item.path);
        if (choices.length < 2 || signal.aborted) return;
        const opener = await ask({title:'Open '+item.name+' with',fieldLabel:'Application',choices,signal});
        if (opener !== null) await execute('open',{path:item.path,openWith:opener,expectedRevision:item.sha256});
        return;
      }
      if (event.id === Remove.id) {
        const selection = [...(event.state?.selectedFilesForAction || event.state?.selectedFiles || [])];
        if (!selection.length) throw Error('Select files or folders to delete.');
        const items = [];
        for (const item of selection) { items.push(await execute('snapshot', {path: item.id})); if (signal.aborted) return; }
        const title = temporary ? 'Delete the selected items from this tab?' : items.length === 1 ? 'Delete ' + items[0].name + ' from your account?' : 'Delete ' + items.length + ' items from your account?';
        if (await ask({title, items, danger: true, signal}) && !signal.aborted) {
          focusFileList();
          await execute('remove', {items: items.map(item => ({path: item.path, expectedRevision: item.sha256}))});
        }
        return;
      }
      const item = await selected(event); if (signal.aborted) return;
      if (event.id === Rename.id) {
        const name = await ask({title: 'Rename ' + item.name, value: item.name, confirmLabel: 'Rename', signal});
        if (name !== null && !signal.aborted) {
          focusFileList();
          await execute('rename', {path: item.path, name, expectedRevision: item.sha256});
        }
      }
      if (event.id === Move.id) {
        const selectDestination = pickMoveFolder && (async () => {
          const folder = await pickMoveFolder(signal);
          if (folder === null) return null;
          return folder === '/' ? item.name : folder.slice(1) + '/' + item.name;
        });
        const destination = await ask({title: 'Move ' + item.name, fieldLabel: 'Destination path in My files', value: item.path,
          selectDestination, confirmLabel: 'Move', signal});
        if (destination !== null && !signal.aborted) {
          focusFileList();
          await execute('move', {path: item.path, destination, expectedRevision: item.sha256});
        }
      }
      if (event.id === Download.id) {
        const result = await execute('download', {path: item.path, expectedRevision: item.sha256}); if (signal.aborted) return;
        const url = URL.createObjectURL(new Blob([result.data])), link = document.createElement('a'); link.href = url; link.download = result.name; link.hidden = true; document.body.append(link);
        const timer = setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url); }, 60000); downloads.set(url, timer);
        try { link.click(); setMessage('Download started: ' + result.name); } finally { link.remove(); }
      }
    });
  }
  const status = message || state.error || (state.busy || pending ? (temporary ? 'Working…' : 'Working with the server…') : state.notice || (temporary ? 'Temporary files in this tab. Register to keep them before reloading or leaving.' : 'Showing account files from the server.'));
  return h('div', {className: 'webos-files-view',
    onDragEnterCapture: event => { if (!externalFiles(event)) return; event.preventDefault(); if (!taskActive.current && !controller.inspect().busy) setDropActive(true); },
    onDragOverCapture: event => { if (!externalFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = taskActive.current || controller.inspect().busy ? 'none' : 'copy'; },
    onDragLeaveCapture: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropActive(false); },
    onDropCapture: event => {
      if (!externalFiles(event)) return; event.preventDefault(); event.stopPropagation(); setDropActive(false);
      if ([...event.dataTransfer.items || []].some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory)) { setMessage('Folder upload is not supported. Drop files instead.'); return; }
      uploadFiles([...event.dataTransfer.files || []], controller.inspect().directory);
    }},
    h('div', {className: 'webos-files-bar'}, h('strong', null, 'My files'), h('span', null, temporary ? 'This browser tab' : 'Account storage'),
      h('button', {type: 'button', disabled: state.busy || pending, onClick: () => task(async () => {
        await execute('list');
        if (!signal.aborted) await onRefresh?.();
      })}, 'Refresh')),
    conflicts.length > 0 && h('section', {className: 'webos-files-conflicts', 'aria-label': 'Sync conflicts'},
      h('strong', null, 'Sync conflicts'),
      h('ul', null, conflicts.map(item => h('li', {key: item.path},
        h('span', null, item.name),
        h('button', {type: 'button', disabled: state.busy || pending,
          'aria-label': (item.deleted ? 'Cancel pending deletion of ' : 'Keep both versions of ') + item.name,
          onClick: () => item.deleted ? cancelDeletion(item) : keepBoth(item)}, item.deleted ? 'Cancel deletion' : 'Keep both'))))),
    h('input', {type: 'file', multiple: true, hidden: true, ref: upload, 'aria-label': 'Upload account files'}),
    h('div', {className: 'webos-files-browser', ref: browser, 'aria-busy': state.busy || pending, onKeyDownCapture: openFocusedItem},
      dropActive && h('div', {className: 'webos-files-drop-overlay', 'aria-hidden': true}, 'Drop files to upload to ' + (state.directory || 'My files')),
      h(FileBrowser, {files, folderChain: chain, onFileAction: action, darkMode,
        iconComponent: ChonkyIconFA, fileActions: [Upload, Open, NewFolder, OpenWith, Rename, Move, Download, Remove], disableDefaultFileActions: [ChonkyActions.DeleteFiles.id], disableDragAndDrop: true, clearSelectionOnOutsideClick: false},
        h(FileNavbar),
        h('div', {className: 'webos-files-toolbar'}, h(FileToolbar, {layout: 'inline'}, h('button', {type: 'button', className: 'webos-files-upload', disabled: state.busy || pending, onClick: beginUpload},
          h(ChonkyIconFA, {icon: ChonkyIconName.upload}), 'Upload'))),
        h(FileList), h(FileContextMenu))),
    h('div', {className: 'webos-files-status', role: 'status', tabIndex: -1, ref: conflictFocus}, status));
}

export function mount({files, instanceId, sessionId, authority, authorize, openFile, activateFile, signal: parentSignal, onRefresh, openChoices = () => [], pickMoveFolder, openConflictMirror}) {
  const abort = new AbortController(), downloads = new Map(), element = document.createElement('div');
  const controller = createFilesController({files, instanceId, sessionId, authorize, openFile, activateFile, openConflictMirror, signal: abort.signal});
  element.className = 'webos-files';
  const root = createRoot(element);
  let disposed = false;
  const execute = (operation, args = {}) => controller.execute({instanceId, sessionId, operation, args}, authority);
  function dispose() { if (disposed) return; disposed = true; parentSignal?.removeEventListener('abort', dispose); abort.abort(); root.unmount(); controller.dispose(); for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url); } downloads.clear(); element.remove(); }
  if (parentSignal?.aborted) { dispose(); throw new DOMException('Files startup cancelled.', 'AbortError'); }
  parentSignal?.addEventListener('abort', dispose, {once: true});
  const darkMode = getComputedStyle(document.documentElement).colorScheme === 'dark';
  root.render(h(FilesView, {controller, execute, signal: abort.signal, downloads, onRefresh, openChoices, pickMoveFolder, openConflictMirror,
    temporary: files.temporary === true, darkMode}));
  const ready = execute('list'); ready.catch(() => {});
  return Object.freeze({element, dispose, ready, inspect: controller.inspect, execute, requestClose: () => !controller.inspect().busy});
}
