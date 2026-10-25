import {MAX_MANIFEST_BYTES} from './library-reader.js';
import {LIBRARY_CHUNK_BYTES,inspectLibraryManifest} from './library-transfer.js';

async function writeFile(directory,name,blob,signal,onBytes){
 signal?.throwIfAborted();const handle=await directory.getFileHandle(name,{create:true});
 const stream=await handle.createWritable();
 try{
  for(let offset=0;offset<blob.size;offset+=LIBRARY_CHUNK_BYTES){signal?.throwIfAborted();const part=blob.slice(offset,offset+LIBRARY_CHUNK_BYTES);await stream.write(part);onBytes?.(part.size);}
  signal?.throwIfAborted();await stream.close();
 }catch(error){await stream.abort().catch(()=>{});throw error;}
}

// Caller supplies an explicitly chosen parent folder and a validated capture.
// Never reuse an existing folder. The manifest is the final completion marker.
export async function writeLibraryDirectory(transfer,parent,{signal,onProgress=()=>{},name='recordit-library-'+crypto.randomUUID()}={}){
 signal?.throwIfAborted();const checked=inspectLibraryManifest(transfer.manifest);
 const manifestBlob=new Blob([JSON.stringify(transfer.manifest,null,2)],{type:'application/json'});if(manifestBlob.size>MAX_MANIFEST_BYTES)throw Error('The library manifest exceeds the 64 MB transfer limit.');
 if(!/^recordit-library-[a-zA-Z0-9-]+$/.test(name))throw Error('Invalid library folder name.');
 const expected=checked.conversations.filter(c=>c.audio);
 if(!(transfer.files instanceof Map)||transfer.files.size!==expected.length||expected.some(c=>transfer.files.get(c.audio.file)?.size!==c.audio.size))throw Error('Prepared library audio is incomplete.');
 try{await parent.getDirectoryHandle(name);throw Error('That library folder already exists. Choose a new export.');}catch(error){if(error.name!=='NotFoundError')throw error;}
 const directory=await parent.getDirectoryHandle(name,{create:true});let writtenBytes=0;
 for(const entry of expected)await writeFile(directory,entry.audio.file,transfer.files.get(entry.audio.file),signal,bytes=>{writtenBytes+=bytes;onProgress({writtenBytes});});
 signal?.throwIfAborted();
 await writeFile(directory,'recordit-library.json',manifestBlob,signal);
 return {name,conversations:checked.conversations.length,audioFiles:expected.length,writtenBytes};
}
