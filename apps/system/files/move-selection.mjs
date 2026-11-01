// A drag can contain several independent moves. If one fails, report the
// already completed operations so users can safely inspect before retrying.
export async function moveSelection(files, destination, move) {
  let moved = 0;
  try {
    for (const file of files) {
      if (file.isDir) throw Error('Moving folders is not available yet.');
      const target = (destination === '/' ? '' : destination) + '/' + file.name;
      if (target === file.id) continue;
      await move(file.id, target, file.version);
      moved++;
    }
  } catch (error) {
    if (moved) throw Error('Move stopped. ' + moved + ' ' + (moved === 1 ? 'file was' : 'files were') + ' moved; check Files before retrying. ' + error.message);
    throw error;
  }
  return moved;
}
