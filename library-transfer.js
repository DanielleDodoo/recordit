import {validateBackup} from './core.js';
import {restoreHistory} from './backup-history.js';
import {sourceKey,sourcesFor,validateSummary} from './summaries.js';
import {MAX_AUDIO_BYTES} from './limits.js';

// Audio stays in separate files. Hash a bounded slice at a time, never a whole
// recording in memory. No database or filesystem mutations happen in this module.
export const LIBRARY_CHUNK_BYTES=4*1024*1024;
const fail=message=>{throw Error('Library transfer: '+message);};
const string=(value,max)=>typeof value==='string'&&value.length<=max;
const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
async function hashes(blob,signal,onChunk=()=>{}){const values=[];signal?.throwIfAborted();for(let offset=0;offset<blob.size;offset+=LIBRARY_CHUNK_BYTES){signal?.throwIfAborted();values.push(await digest(blob.slice(offset,offset+LIBRARY_CHUNK_BYTES)));signal?.throwIfAborted();onChunk(Math.min(LIBRARY_CHUNK_BYTES,blob.size-offset));}return values;}

export function inspectLibraryManifest(value){
 if(!value||value.format!=='recordit-library'||value.version!==1||value.chunkBytes!==LIBRARY_CHUNK_BYTES)fail('unsupported format or version.');
 if(!Number.isFinite(value.created)||value.created<0)fail('invalid creation date.');
 if(!Array.isArray(value.collections)||value.collections.length>200)fail('invalid collection rules.');
 const names=new Set(['unfiled','all']);
 const collections=value.collections.map(c=>{
  if(!c||!string(c.name,80)||!c.name.trim()||c.name!==c.name.trim()||names.has(c.name.toLowerCase())||!Array.isArray(c.keywords)||c.keywords.length>200||c.keywords.some(k=>!string(k,200)||!k.trim()))fail('invalid or duplicate collection.');
  names.add(c.name.toLowerCase());return {name:c.name,keywords:[...c.keywords]};
 });
 if(!Array.isArray(value.conversations)||value.conversations.length>10000)fail('invalid conversation list.');
 const ids=new Set(),warnings=[];
 const conversations=value.conversations.map(entry=>{
  if(!entry||!string(entry.key,80)||!/^[a-zA-Z0-9-]+$/.test(entry.key)||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(entry.key)||ids.has(entry.key.toLowerCase()))fail('invalid or duplicate conversation key.');
  ids.add(entry.key.toLowerCase());const raw=entry.record;
  if(!raw||!string(raw.title,200)||!string(raw.transcript,2000000)||!Number.isFinite(raw.created)||raw.created<0||!Number.isFinite(raw.duration)||raw.duration<0)fail('invalid conversation metadata.');
  if(!string(raw.category,80)||!Array.isArray(raw.tags)||raw.tags.length>30||raw.tags.some(t=>!string(t,200))||typeof raw.collectionManual!=='boolean')fail('invalid filing metadata.');
  if(!Array.isArray(raw.secondaryCategories)||raw.secondaryCategories.length>200||raw.secondaryCategories.some(c=>!string(c,80)))fail('invalid secondary collections.');
  if(!Array.isArray(raw.chunks)||raw.chunks.length>100000||raw.chunks.some(c=>!c||!string(c.text,2000000)||!Array.isArray(c.timestamp)||c.timestamp.length!==2||c.timestamp.some(t=>t!==null&&(!Number.isFinite(t)||t<0))||(c.timestamp[0]!==null&&c.timestamp[1]!==null&&c.timestamp[1]<c.timestamp[0])))fail('invalid transcript timing.');
  for(const name of new Set([raw.category,...raw.secondaryCategories]))if(!names.has(name.toLowerCase()))warnings.push({key:entry.key,message:'Collection '+name+' has no rules in this transfer; its label is retained.'});
  const note=validateBackup(raw);note.created=raw.created;note.collectionManual=raw.collectionManual;note.secondaryCategories=[...raw.secondaryCategories];
  note.collectionReason=typeof raw.collectionReason==='string'?raw.collectionReason.slice(0,10000):null;
  Object.assign(note,restoreHistory(raw,note));
  if(raw.generatedSummary){
   if(typeof raw.generatedSummary!=='object'||Array.isArray(raw.generatedSummary)||['themes','conclusions','next_steps'].some(k=>!Array.isArray(raw.generatedSummary[k])||raw.generatedSummary[k].length>200||raw.generatedSummary[k].some(b=>!b||!string(b.text,10000)||!Array.isArray(b.evidence))))fail('invalid saved summary.');
   if(raw.generatedSummary.sourceKey===sourceKey(note))note.generatedSummary={...raw.generatedSummary,...validateSummary(raw.generatedSummary,sourcesFor(note))};
   else warnings.push({key:entry.key,message:'Saved summary refers to an older transcript; regenerate it after import. The original remains in the manifest.'});
  }
  const audio=entry.audio;
  if(audio!==null){
   if(!audio||audio.file!==entry.key+'.audio'||raw.audioFile!==audio.file||!Number.isSafeInteger(audio.size)||audio.size<=0||audio.size>MAX_AUDIO_BYTES||!Array.isArray(audio.hashes)||audio.hashes.length!==Math.ceil(audio.size/LIBRARY_CHUNK_BYTES)||audio.hashes.some(h=>typeof h!=='string'||!/^[a-f0-9]{64}$/.test(h)))fail('invalid audio descriptor.');
  }
  if(audio===null&&(raw.duration>0||raw.audioType))warnings.push({key:entry.key,message:'No audio file is included for this conversation.'});
  return {key:entry.key,note,audio:audio?{file:audio.file,size:audio.size,hashes:[...audio.hashes]}:null};
 });
 return {collections,conversations,warnings};
}

export async function createLibraryTransfer({notes,collections,getAudio,exportData,created=Date.now(),signal,onProgress=()=>{}}){
 signal?.throwIfAborted();
 if(!Array.isArray(notes)||notes.some(n=>n.recording))fail('finish active recordings before exporting the library.');
 const manifest={format:'recordit-library',version:1,chunkBytes:LIBRARY_CHUNK_BYTES,created,collections:structuredClone(collections),conversations:[]},files=new Map();
 let checkedBytes=0,completed=0;
 for(const note of notes){
  signal?.throwIfAborted();
  const record=structuredClone(exportData(note)),blob=(await getAudio(note.id))?.blob;
  const file=note.id+'.audio';record.audioFile=file;
  let audio=null;
  if(blob){if(!Number.isSafeInteger(blob.size)||blob.size<=0||blob.size>MAX_AUDIO_BYTES)fail('invalid audio size.');audio={file,size:blob.size,hashes:await hashes(blob,signal,bytes=>{checkedBytes+=bytes;onProgress({completed,total:notes.length,checkedBytes});})};files.set(file,blob);}
  manifest.conversations.push({key:note.id,record,audio});completed++;onProgress({completed,total:notes.length,checkedBytes});
 }
 signal?.throwIfAborted();inspectLibraryManifest(manifest);
 return {manifest,files};
}

export async function validateLibraryTransfer(manifest,files,{signal,onProgress=()=>{}}={}){
 signal?.throwIfAborted();let checkedBytes=0;
 const result=inspectLibraryManifest(manifest);
 if(!(files instanceof Map))fail('audio files must be provided by filename.');
 const expected=new Set(result.conversations.filter(c=>c.audio).map(c=>c.audio.file));
 if(files.size!==expected.size||[...files.keys()].some(name=>!expected.has(name)))fail('missing, extra or incorrectly named audio files.');
 for(const entry of result.conversations){
  if(!entry.audio)continue;
  const blob=files.get(entry.audio.file);
  if(!blob||blob.size!==entry.audio.size||typeof blob.slice!=='function')fail('audio file is missing or incomplete.');
  const actual=await hashes(blob,signal,bytes=>{checkedBytes+=bytes;onProgress({checkedBytes});});
  if(actual.some((hash,i)=>hash!==entry.audio.hashes[i]))fail('audio checksum does not match; no conversations were imported.');
  entry.blob=blob;
 }
 signal?.throwIfAborted();return result;
}
