/** Per-instance browsing state over a shared server-authoritative file service. */
export function createFilesController({files, instanceId, sessionId, authorize, openFile}) {
  if (!files || !instanceId || !sessionId || typeof authorize !== 'function' || typeof openFile !== 'function') throw TypeError('Explicit Files dependencies and target identities required.');
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
    async open({path: value}) {
      const selected = entry(value); if (selected.directory) return refresh(selected.path);
      const result = await files.read(selected.path); check();
      await openFile({path: selected.path, name: selected.name, sha256: result.sha256, data: result.data, sessionId, sourceInstanceId: instanceId}); check();
      return {status: 'opened', path: selected.path, sha256: result.sha256};
    },
    async import({name, blob}) {
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A filename is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      // Immutable Blob capture and hashing are owned by Storage's real worker.
      const result = await files.write(destination, blob); check();
      return confirmed({status: 'saved', path: destination, sha256: result.sha256, committed: true}, 'Saved to your account: ' + name);
    },
    async mkdir({name}) {
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A folder name is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      await files.mkdir(destination); check(); return confirmed({status: 'created', path: destination, committed: true}, 'Folder created on the server.');
    },
    async rename({path: value, name, expectedRevision}) {
      const selected = entry(value); if (selected.directory) throw Error('Folder moves are not enabled yet.');
      if (typeof name !== 'string' || name.includes('/')) throw TypeError('A filename is required.');
      if (!/^[0-9a-f]{64}$/.test(expectedRevision || '')) throw TypeError('An exact selected file revision is required.');
      const destination = path((directory ? directory + '/' : '') + name);
      await files.rename(selected.path, destination, expectedRevision); check(); return confirmed({status: 'renamed', path: destination, committed: true}, 'Renamed on the server.');
    },
    async remove({path: value, expectedRevision}) {
      const selected = entry(value);
      if (!selected.directory && !/^[0-9a-f]{64}$/.test(expectedRevision || '')) throw TypeError('An exact selected file revision is required.');
      await files.remove(selected.path, selected.directory ? null : expectedRevision); check(); return confirmed({status: 'deleted', committed: true}, 'Deleted from your account.');
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
      const operation = request.operation, args = {...request.args};
      if (await authorize(authority, Object.freeze({instanceId, sessionId, operation, path: args.path || directory})) !== true) throw Error('Files operation denied.');
      check(); if (busy) throw Error('A Files operation is already running.'); busy = true; error = ''; notice = ''; emit();
      try { return await ops[operation](args); }
      catch (failure) { if (!disposed) { error = failure.message; if (failure.outcome === 'unknown') error += ' Check the server before retrying.'; } throw failure; }
      finally { busy = false; if (!disposed) emit(); }
    },
    dispose() { if (disposed) return; disposed = true; entries = []; listeners.clear(); }
  });
}
