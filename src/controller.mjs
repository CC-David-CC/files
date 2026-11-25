/** Per-instance browsing state over a shared server-authoritative file service. */
export function createFilesController({files, instanceId, sessionId, authorize, openFile, activateFile = () => false, openConflictMirror, signal}) {
  if (!files || !instanceId || !sessionId || typeof authorize !== 'function' || typeof openFile !== 'function' || typeof activateFile !== 'function') throw TypeError('Explicit Files dependencies and target identities required.');
  let directory = '', entries = [], busy = false, disposed = false, error = '', notice = '', revision = 0;
  const listeners = new Set();
  const check = () => { if (disposed) throw new DOMException('Files view closed.', 'AbortError'); files.check(); };
  const path = value => {
    if (typeof value !== 'string' || value.length > 2048 || value.startsWith('/') || value.endsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[\0\\]/.test(part))) throw TypeError('Canonical account path required.');
    return value;
  };
  const inspect = () => ({instanceId, sessionId, directory, entries: structuredClone(entries), busy, disposed, error, notice, revision});
  const emit = () => { revision++; const s = inspect(); for (const listener of [...listeners]) listener(s); };
  const entry = value => { const p = path(value), found = entries.find(item => item.path === p); if (!found) throw Error('Refresh and select a file in this folder.'); return found; };
  function removalTargets(args) {
    if (args.items !== undefined && (args.path !== undefined || args.expectedRevision !== undefined)) throw TypeError('Specify one deletion selection.');
    const items = args.items === undefined ? [{path: args.path, expectedRevision: args.expectedRevision}] : args.items;
    if (!Array.isArray(items) || !items.length || items.length > 1024) throw TypeError('Select between 1 and 1024 items.');
    const seen = new Set();
    return Object.freeze(items.map(item => {
      const selected = entry(item?.path);
      if (seen.has(selected.path)) throw TypeError('A deletion selection cannot contain duplicates.');
      seen.add(selected.path);
      if (!selected.directory && !/^[0-9a-f]{64}$/.test(item.expectedRevision || '')) throw TypeError('An exact selected file revision is required.');
      return Object.freeze({path: selected.path, expectedRevision: selected.directory ? null : item.expectedRevision});
    }));
  }
  async function refresh(destination = directory) {
    if (destination !== '') path(destination);
    const listing = await files.list(destination); check();
    if (!Array.isArray(listing.entries)) throw Error('Invalid account listing.');
    const next = listing.entries.map(item => ({...item, path: (destination ? destination + '/' : '') + item.name}));
    for (const item of next) path(item.path);
    directory = destination; entries = next; emit();
    return {status: 'listed', directory};
  }
  async function confirmed(result, message) {
    notice = message;
    try { await refresh(); }
    catch (failure) {
      if (disposed) throw Object.assign(failure, {committed: true});
      error = message + ' Folder refresh failed: ' + failure.message;
    }
    return result;
  }
  const ops = {
    list: ({path: destination = directory}) => refresh(destination),
    async snapshot({path: value}) {
      const selected = entry(value);
      if (selected.directory) return {...selected, sha256: null};
      const version = await files.version(selected.path); check(); return {...selected, ...version};
    },
    async open({path: value, openWith, expectedRevision}) {
      const selected = entry(value);
      if (openWith !== undefined) {
        if (selected.directory || typeof openWith !== 'string' || !/^[0-9a-f]{64}$/.test(expectedRevision || '')) {
          throw TypeError('Choose one file and its exact revision.');
        }
      } else {
        if (selected.directory) return refresh(selected.path);
        const activated = await activateFile({path: selected.path, name: selected.name, sessionId, sourceInstanceId: instanceId}); check();
        if (typeof activated !== 'boolean') throw TypeError('File activation must return a boolean.');
        if (activated) return {status: 'activated', path: selected.path};
      }
      const result = await files.read(selected.path); check();
      if (openWith !== undefined && result.sha256 !== expectedRevision) throw Error('This file changed. Select it again before opening.');
      const opened = await openFile({path: selected.path, name: selected.name, sha256: result.sha256, data: result.data, sessionId, sourceInstanceId: instanceId, ...(openWith === undefined ? {} : {openWith})}); check();
      if (opened?.status === 'activated') return {status: 'activated', path: selected.path};
      return {status: 'opened', path: selected.path, sha256: result.sha256};
    },
    async import({name, blob}) {
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A filename is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      // Immutable Blob capture and hashing are owned by Storage's real worker.
      const result = await files.write(destination, blob); check();
      return confirmed({status: 'saved', path: destination, sha256: result.sha256, committed: true}, (files.temporary ? 'Saved in this tab: ' : 'Saved to your account: ') + name);
    },
    async mkdir({name}) {
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A folder name is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      await files.mkdir(destination); check(); return confirmed({status: 'created', path: destination, committed: true}, files.temporary ? 'Folder created in this tab.' : 'Folder created on the server.');
    },
    async rename({path: value, name, expectedRevision}) {
      const selected = entry(value); if (selected.directory) throw Error('Folder moves are not enabled yet.');
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A filename is required.');
      if (!/^[0-9a-f]{64}$/.test(expectedRevision || '')) throw TypeError('An exact selected file revision is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      await files.rename(selected.path, destination, expectedRevision); check(); return confirmed({status: 'renamed', path: destination, committed: true}, files.temporary ? 'Renamed in this tab.' : 'Renamed on the server.');
    },
    async move({path: value, destination, expectedRevision}) {
      const selected = entry(value); if (selected.directory) throw Error('Folder moves are not enabled yet.');
      const target = path(destination);
      if (target === selected.path) throw Error('Choose a different destination.');
      if (!/^[0-9a-f]{64}$/.test(expectedRevision || '')) throw TypeError('An exact selected file revision is required.');
      await files.rename(selected.path, target, expectedRevision); check();
      return confirmed({status: 'moved', path: target, committed: true}, files.temporary ? 'Moved in this tab.' : 'Moved on the server.');
    },
    async remove({items}) {
      const deletedPaths = [];
      try {
        for (const item of items) {
          check(); await files.remove(item.path, item.expectedRevision);
          // Record the acknowledgement before a close/session check. Never
          // retry an interrupted mutation whose server outcome is unknown.
          deletedPaths.push(item.path); check();
        }
      } catch (failure) {
        const message = 'Confirmed deletion of ' + deletedPaths.length + ' of ' + items.length + ' items. Deletion stopped: ' + failure.message;
        if (!disposed) {
          try { await refresh(); } catch { /* The original mutation failure remains authoritative. */ }
        }
        throw Object.assign(Error(message), {cause: failure, outcome: failure.outcome, deletedPaths, deletedCount: deletedPaths.length, total: items.length});
      }
      return confirmed({status: 'deleted', committed: true, deletedPaths, deletedCount: deletedPaths.length, total: items.length},
        files.temporary ? 'Deleted from this tab.' : items.length === 1 ? 'Deleted from your account.' : 'Deleted ' + deletedPaths.length + ' items from your account.');
    },
    async 'keep-both'({path: value, destination, expectedRevision}) {
      const mirror = await openConflictMirror();
      check();
      // The new account file must contain this exact local conflict revision.
      // Keep the source lease until the server write and receipt are confirmed.
      const snapshot = await mirror.acquireSnapshot('/' + value, {expected: expectedRevision, signal});
      try {
        check();
        if (snapshot.status !== 'conflict') throw Error('The file conflict changed. Select it again.');
        let receipt;
        try {
          receipt = await files.write(destination, snapshot.data.slice(), null, {signal});
        } catch (failure) {
          if (failure.status !== 409 && failure.outcome !== 'unknown') throw failure;
          // A retry can reuse an already-saved copy with identical contents.
          const existing = await files.version(destination).catch(() => null);
          if (existing?.sha256 !== snapshot.sha256) {
            if (failure.status === 409) throw Error('That filename already exists. Choose a different name.');
            throw failure;
          }
          receipt = existing;
        }
        check();
        if (receipt?.sha256 !== snapshot.sha256) throw Error('The saved copy could not be verified. Refresh Files before trying again.');
        const result = {status: 'copied', path: destination, sha256: receipt.sha256, committed: true};
        try {
          // Resolve only the selected local revision, even if another tab edited
          // the original while the separate account copy was being uploaded.
          await mirror.resolve('/' + value, 'server', expectedRevision);
          check();
        } catch (failure) {
          if (disposed) throw Object.assign(failure, {committed: true});
          return confirmed(result, 'Saved a copy to ' + destination + '. The original still needs attention: ' + failure.message);
        }
        return confirmed({...result, status: 'resolved'}, 'Saved the device copy to ' + destination + ' and cleared the sync conflict.');
      } finally {
        snapshot.release();
      }
    },
    async download({path: value, expectedRevision}) {
      const selected = entry(value); if (selected.directory) throw Error('Choose a file.');
      const result = await files.read(selected.path); check();
      if (result.sha256 !== expectedRevision) throw Error('This file changed. Select it again before downloading.');
      return {name: selected.name, data: result.data, sha256: result.sha256};
    }
  };
  return Object.freeze({inspect,
    subscribe(listener) { check(); listeners.add(listener); return () => listeners.delete(listener); },
    async execute(request, authority) {
      check();
      if (!request || request.instanceId !== instanceId || request.sessionId !== sessionId || !Object.hasOwn(ops, request.operation)) throw Error('Explicit current Files instance and session target required.');
      // Bytes are explicit operation input, never returned by ordinary inspect.
      const operation = request.operation, args = {...request.args}, capturedDirectory = directory;
      // Capture and validate the entire selection before any asynchronous
      // authorization. A caller cannot substitute targets during that wait.
      if (operation === 'remove') args.items = removalTargets(args);
      if (operation === 'import' && args.expectedDirectory !== undefined && args.expectedDirectory !== capturedDirectory) throw Error('The destination folder changed. Choose Upload again in the destination folder.');
      let destination = null;
      if (operation === 'move') destination = path(args.destination);
      if (operation === 'keep-both') {
        if (typeof openConflictMirror !== 'function') throw Error('Account file conflicts are unavailable.');
        const source = path(args.path);
        if (source.slice(0, Math.max(0, source.lastIndexOf('/'))) !== capturedDirectory) throw Error('Reopen the folder with the file conflict.');
        if (typeof args.expectedRevision !== 'string' || !args.expectedRevision || args.expectedRevision.length > 128) throw TypeError('Select an exact conflict revision.');
        if (typeof args.name !== 'string' || args.name.includes('/')) throw TypeError('Enter a filename for the device copy.');
        destination = path((capturedDirectory ? capturedDirectory + '/' : '') + args.name);
        if (destination === source) throw Error('Choose a new name for the device copy.');
        args.destination = destination;
      }
      if (['import', 'mkdir', 'rename'].includes(operation)) {
        if (typeof args.name !== 'string' || args.name.includes('/')) throw TypeError('A file or folder name is required.');
        destination = path((capturedDirectory ? capturedDirectory + '/' : '') + args.name);
      }
      const targets = operation === 'remove' ? args.items : [{path: args.path ?? capturedDirectory, expectedRevision: args.expectedRevision ?? null}];
      // Every selected resource must be authorized before the first write.
      for (const target of targets) {
        if (await authorize(authority, Object.freeze({instanceId, sessionId, operation,
          directory: capturedDirectory, path: target.path, destination,
          expectedRevision: target.expectedRevision})) !== true) throw Error('Files operation denied.');
        check();
      }
      check();
      // Folder-relative writes must not drift to a different resource while
      // an asynchronous permission decision is pending.
      if (directory !== capturedDirectory) throw Error('Files folder changed while authorization was pending.');
      if (busy) throw Error('A Files operation is already running.'); busy = true; error = ''; notice = ''; emit();
      try { return await ops[operation](args); }
      catch (failure) { if (!disposed) { error = failure.message; if (failure.outcome === 'unknown') error += ' Check the server before retrying.'; } throw failure; }
      finally { busy = false; if (!disposed) emit(); }
    },
    dispose() { if (disposed) return; disposed = true; entries = []; listeners.clear(); }
  });
}
