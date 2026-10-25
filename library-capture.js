import {createLibraryTransfer} from './library-transfer.js';

// Collection rules still live outside IndexedDB. Detect observed rule changes
// around capture/hashing; this is not a cross-storage atomic transaction.
export async function captureLibraryTransfer({snapshotLibrary,loadCollections,exportData,signal,onProgress}){
 signal?.throwIfAborted();
 const collections=structuredClone(loadCollections()),fingerprint=JSON.stringify(collections);
 const unchanged=()=>{if(JSON.stringify(loadCollections())!==fingerprint)throw Error('Collection rules changed while preparing the library. Please try again.');};
 const snapshot=await snapshotLibrary();signal?.throwIfAborted();unchanged();
 const transfer=await createLibraryTransfer({notes:snapshot.notes,collections,getAudio:async id=>snapshot.audio.get(id),exportData,signal,onProgress});
 signal?.throwIfAborted();unchanged();return transfer;
}
