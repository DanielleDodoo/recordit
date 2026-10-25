import {filingPatch} from './collection-filing.js';
import {bulkFilingPlan,applyFilingFields} from './bulk-filing.js';
const ready=new Promise((resolve,reject)=>{const r=indexedDB.open('record-me',2);let blocked=false;r.onupgradeneeded=()=>{for(const name of ['notes','audio','imports'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onblocked=()=>{blocked=true;reject(Error('Close other recordit windows, then reload to finish the storage update.'));};r.onsuccess=()=>{if(blocked){r.result.close();return;}r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);});

// Read current records and change only filing metadata in one transaction.
// Never replay conversation snapshots captured before a user's newer edits.
export async function refileCollections(rules,options={}){
 const capturedRules=structuredClone(rules),capturedOptions=structuredClone(options);
 const ids=capturedOptions.ids?new Set(capturedOptions.ids):null;
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes');let changed=0,failure;
  const request=store.openCursor();
  request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;
   try{if(!ids||ids.has(cursor.key)){const current=cursor.value;
    if(capturedOptions.rejectRecording&&current.recording)throw Error('Finish recording before changing collections.');
    const patch=filingPatch(current,capturedRules,capturedOptions);
    if(patch){cursor.update({...current,...patch,revision:(current.revision||0)+1,updated:Date.now()});changed++;}}
    cursor.continue();
   }catch(error){failure=error;tx.abort();}
  };
  tx.oncomplete=()=>resolve(changed);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Collection refiling aborted.'));
 });
}
async function op(store,mode,fn){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage write aborted'));});}
export const list=()=>op('notes','readonly',s=>s.getAll());
export async function fileBatch(ids,target,rules,receipt=null){
 const database=await ready;
 return new Promise((resolve,reject)=>{
  const tx=database.transaction('notes','readwrite'),store=tx.objectStore('notes'),request=store.getAll();let result,failure;
  request.onsuccess=()=>{try{
   result=bulkFilingPlan(request.result,ids,target,rules,receipt);
   for(const entry of result.entries){const note=request.result.find(n=>n.id===entry.id);store.put({...applyFilingFields(note,entry.after),revision:(note.revision||0)+1,updated:Date.now()});}
  }catch(error){failure=error;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Batch filing was not saved.'));
 });
}
// Take both stores at one transaction boundary; later hashing never holds an
// IndexedDB transaction open and never rereads a newer version of the audio.
export async function snapshotLibrary(){
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction(['notes','audio'],'readonly');
  const notes=tx.objectStore('notes').getAll(),audio=tx.objectStore('audio').getAll();
  tx.oncomplete=()=>{const ids=new Set(notes.result.map(note=>note.id));resolve({notes:notes.result,audio:new Map(audio.result.filter(item=>ids.has(item.id)).map(item=>[item.id,item]))});};
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Library snapshot was interrupted.'));
 });
}
export async function save(n){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes'),r=store.get(n.id);r.onsuccess=()=>{const value={...n};if(r.result?.backupId){value.backupId=r.result.backupId;if(n.backupId!==value.backupId)value.revision=Math.max(n.revision||0,(r.result.revision||0)+1);}store.put(value);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Conversation save aborted'));});}
export async function editAnswers(id,change){const db=await ready;return new Promise((resolve,reject)=>{let saved=null,failure;const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes'),r=store.get(id);r.onsuccess=()=>{try{const n=r.result;if(n&&change(n)!==false){n.revision=(n.revision||0)+1;n.updated=Date.now();store.put(n);saved=n;}}catch(error){failure=error;tx.abort();}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Answer update failed'));});}
export async function saveSummary(id,transcript,chunks,summary){const db=await ready;return new Promise((resolve,reject)=>{let saved=null;const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes'),r=store.get(id);r.onsuccess=()=>{const n=r.result;if(n&&n.transcript===transcript&&JSON.stringify(n.chunks||[])===chunks){n.generatedSummary=summary;n.revision=(n.revision||0)+1;n.updated=Date.now();store.put(n);saved=n;}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error);});}
export const getAudio=id=>op('audio','readonly',s=>s.get(id));
export const saveAudio=(id,blob)=>op('audio','readwrite',s=>s.put({id,blob}));
export async function remove(id){await op('notes','readwrite',s=>s.delete(id));await op('audio','readwrite',s=>s.delete(id));}
export async function markBacked(id,revision,audioBacked,folder,targetId=id){const db=await ready;return new Promise((resolve,reject)=>{const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes'),request=store.get(id);let failure;request.onsuccess=()=>{const current=request.result;if(current&&(current.backupId||id)!==targetId){failure=Error('Backup target changed during copying.');tx.abort();return;}if(current){current.backedRevision=revision;current.backedFolder=folder;current.backedTargetId=targetId;if(current.revision===revision&&(current.backupId||id)===targetId){current.audioBacked=audioBacked;current.audioBackedFolder=folder;current.audioBackedTargetId=targetId;}store.put(current);}};tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Backup completion aborted'));});}

export async function attachAudio(id,blob){
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction(['notes','audio'],'readwrite'),notes=tx.objectStore('notes'),audio=tx.objectStore('audio');let saved,failure;
  const fail=message=>{failure=Error(message);tx.abort();};
  const request=notes.get(id);request.onsuccess=()=>{const note=request.result;if(!note){fail('This conversation no longer exists.');return;}
   const existing=audio.get(id);existing.onsuccess=()=>{if(existing.result?.blob){fail('This conversation already has audio. Its existing recording was kept.');return;}
    const type=/^(audio\/|video\/mp4)/i.test(blob.type)?blob.type:note.audioType||'application/octet-stream';
    const storedBlob=blob.type===type?blob:new Blob([blob],{type});
    saved={...note,audioType:type,revision:(note.revision||0)+1,updated:Date.now(),audioBacked:false};
    audio.put({id,blob:storedBlob});notes.put(saved);
   };
  };
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Audio attachment was not saved.'));
 });
}

export async function forkBackup(id,expectedTarget){
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction('notes','readwrite'),store=tx.objectStore('notes');let saved,failure;
  const r=store.get(id);r.onsuccess=()=>{const current=r.result;
   if(!current||current.recording||(current.backupId||id)!==expectedTarget){failure=Error('This conversation changed. Refresh the backup report before trying again.');tx.abort();return;}
   saved={...current,backupId:crypto.randomUUID(),revision:(current.revision||0)+1,audioBacked:false};store.put(saved);
  };
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Separate backup was not queued'));
 });
}

// Input comes from validateLibraryTransfer. Allocate new local identities so a
// transfer never overwrites an existing conversation or inherits backup claims.
export async function restoreLibrary(conversations,{idFactory=()=>crypto.randomUUID(),importId,importDigest}={}){
 if(!Array.isArray(conversations)||conversations.length>10000)throw Error('Invalid library restore.');
 if(importId!==undefined&&(typeof importId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(importId)||typeof importDigest!=='string'||!/^[a-f0-9]{64}$/.test(importDigest)))throw Error('Invalid import receipt identity.');
 const fields=['title','transcript','category','tags','collectionManual','secondaryCategories','collectionReason','created','duration','chunks','chats','removedAnswers','highlights','speakerLabels','comments','bookmarks','generatedSummary','audioType','transcriptVersions','speechGaps','transcriptVersionId','transcriptEngine','transcriptEngineLabel','transcribed','mic'];
 const prepared=conversations.map(entry=>{
  if(!entry?.note||typeof entry.note.title!=='string'||typeof entry.note.transcript!=='string')throw Error('Invalid conversation in library restore.');
  if(entry.blob!=null&&(!(entry.blob instanceof Blob)||entry.blob.size===0))throw Error('Invalid audio in library restore.');
  const id=idFactory();if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Invalid restored conversation identity.');
  const note={};for(const key of fields)if(entry.note[key]!==undefined)note[key]=structuredClone(entry.note[key]);
  Object.assign(note,{id,revision:1,updated:Date.now(),recording:false,audioBacked:false});
  const blob=entry.blob?(entry.blob.type?entry.blob:new Blob([entry.blob],{type:note.audioType||'application/octet-stream'})):null;
  return {note,blob};
 });
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction(importId?['notes','audio','imports']:['notes','audio'],'readwrite');let failure,result=prepared.map(entry=>entry.note);
  const fail=error=>{if(failure)return;failure=error;tx.abort();};
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Library restore aborted; no conversations were added.'));
  const insert=()=>{try{for(const entry of prepared){tx.objectStore('notes').add(entry.note);if(entry.blob)tx.objectStore('audio').add({id:entry.note.id,blob:entry.blob});}
   if(importId)tx.objectStore('imports').add({id:importId,digest:importDigest,noteIds:prepared.map(e=>e.note.id),audioIds:prepared.filter(e=>e.blob).map(e=>e.note.id)});
  }catch(error){fail(error);}};
  if(!importId){insert();return;}
  const request=tx.objectStore('imports').get(importId);
  request.onsuccess=()=>{const receipt=request.result;if(!receipt){insert();return;}
   if(receipt.digest!==importDigest||!Array.isArray(receipt.noteIds)||receipt.noteIds.length!==prepared.length||new Set(receipt.noteIds).size!==receipt.noteIds.length||receipt.noteIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))||!Array.isArray(receipt.audioIds)||receipt.audioIds.length!==prepared.filter(e=>e.blob).length||new Set(receipt.audioIds).size!==receipt.audioIds.length||receipt.audioIds.some(id=>!receipt.noteIds.includes(id))){fail(Error('Import receipt does not match this transfer. No conversations added.'));return;}
   result=new Array(receipt.noteIds.length);
   receipt.noteIds.forEach((id,index)=>{const read=tx.objectStore('notes').get(id);read.onsuccess=()=>{if(!read.result){fail(Error('An imported conversation was removed. Retry will not recreate it.'));return;}result[index]=read.result;};});
   for(const id of receipt.audioIds){const read=tx.objectStore('audio').get(id);read.onsuccess=()=>{if(!read.result?.blob)fail(Error('Imported audio is missing. Retry will not replace it.'));};}
  };
 });
}


// Sync from the Drive folder: add a conversation brought in from another laptop. Never replaces one that exists.
export async function syncAdd(note,blob){
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction(['notes','audio'],'readwrite');let saved=null;
  const existing=tx.objectStore('notes').get(note.id);
  existing.onsuccess=()=>{if(existing.result)return;tx.objectStore('notes').add(note);if(blob)tx.objectStore('audio').put({id:note.id,blob});saved=note;};
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Sync import aborted; nothing was added.'));
 });
}
// apply(current) returns the updated record, or null to leave it untouched; it runs on the record as stored
// right now, so a newer local edit is never overwritten. Audio is only added where the conversation has none.
export async function syncUpdate(id,apply,blob){
 const db=await ready;return new Promise((resolve,reject)=>{
  const tx=db.transaction(['notes','audio'],'readwrite');let saved=null,failure;
  const request=tx.objectStore('notes').get(id);
  request.onsuccess=()=>{
   let next;try{next=apply(request.result);}catch(error){failure=error;tx.abort();return;}
   if(!next)return;tx.objectStore('notes').put(next);saved=next;
   if(blob){const audio=tx.objectStore('audio').get(id);audio.onsuccess=()=>{if(!audio.result?.blob)tx.objectStore('audio').put({id,blob});};}
  };
  tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error||Error('Sync update aborted; nothing was changed.'));
 });
}
