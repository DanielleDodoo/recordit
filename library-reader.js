import {inspectLibraryManifest,validateLibraryTransfer} from './library-transfer.js';
export const MAX_MANIFEST_BYTES=64*1024*1024;
export async function readLibraryDirectory(directory,{signal,onProgress}={}){
 signal?.throwIfAborted();
 const file=await (await directory.getFileHandle('recordit-library.json')).getFile();
 if(file.size>MAX_MANIFEST_BYTES)throw Error('The library manifest exceeds the 64 MB transfer limit.');
 const manifest=JSON.parse(await file.text());signal?.throwIfAborted();
 const inspected=inspectLibraryManifest(manifest),files=new Map();
 for(const entry of inspected.conversations){
  signal?.throwIfAborted();if(entry.audio)files.set(entry.audio.file,await (await directory.getFileHandle(entry.audio.file)).getFile());
 }
 const validated=await validateLibraryTransfer(manifest,files,{signal,onProgress});
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(manifest)));
 signal?.throwIfAborted();
 return {...validated,digest:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')};
}
