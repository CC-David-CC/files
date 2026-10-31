// A completed server check is evidence about that moment, not a guarantee that
// files cannot subsequently change on another device or directly on the server.
export function fileSyncMessage({error,connected,status}){
 if(error)return error;
 if(!connected)return 'Opening your files…';
 if(!status)return 'Checking files on this device…';
 if(status.ephemeral)return 'temp_linux resets on restart.';
 if(status.conflicts)return 'Some files need attention. Choose which copy to keep.';
 if(status.error)return status.pending?'Changes are kept on this device. Server sync is delayed; retrying automatically.':'Could not check the server. Showing files available on this device; retrying automatically.';
 if(status.pending)return 'Changes are kept on this device; waiting to sync with the server.';
 if(status.lastSynced===null||status.lastSynced===undefined)return 'Checking server files; showing files available on this device.';
 return 'Files checked with the server.';
}
