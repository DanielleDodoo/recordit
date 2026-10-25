// The laptop library: conversations are kept by this laptop's recordit engine, so every browser shows the same
// ones (and the Drive folder carries them to your other laptops). Same functions as db-browser.js. Where that
// store used one database transaction, this reads the latest copy, applies the change and writes it back only
// if nobody else saved in between; if someone did, it starts again from the newer copy.
import {engineFetch,failed} from './engine.js';
import {filingPatch} from './collection-filing.js';
import {bulkFilingPlan,applyFilingFields} from './bulk-filing.js';

const ID=/^[a-zA-Z0-9-]{1,80}$/;
const unavailable='The recordit library is unavailable. Start recordit on this laptop, then reload.';

export async function list(){const r=await engineFetch('/api/library/notes');if(!r.ok)await failed(r,unavailable);return r.json();}
async function get(id){const r=await engineFetch('/api/library/notes/'+id);if(r.status===404)return undefined;if(!r.ok)await failed(r,unavailable);return r.json();}
// ifRevision: undefined = plain save, null = create only, number = only if still at that revision. Returns null on a clash.
async function put(note,ifRevision){
 const headers={'Content-Type':'application/json'};
 if(ifRevision!==undefined)headers['X-If-Revision']=ifRevision===null?'none':String(ifRevision);
 const r=await engineFetch('/api/library/notes/'+note.id,{method:'PUT',headers,body:JSON.stringify(note)});
 if(r.status===409)return null;if(!r.ok)await failed(r,'Could not save to the recordit library.');return r.json();
}
async function batch(puts){
 const r=await engineFetch('/api/library/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({puts})});
 if(r.status===409)return null;if(!r.ok)await failed(r,'Could not save to the recordit library.');return r.json();
}
// change(copy) returns the record to write, or null to leave it alone. Errors it throws are passed on unchanged.
async function update(id,change){
 for(let attempt=0;attempt<8;attempt++){
  const current=await get(id),next=change(current===undefined?undefined:structuredClone(current));
  if(!next)return null;
  const saved=await put(next,current===undefined?null:current.revision);
  if(saved)return saved;
 }
 throw Error('This conversation kept changing while saving. Please try again.');
}

export const save=note=>put(note);
export function editAnswers(id,change){return update(id,n=>{if(!n||change(n)===false)return null;n.revision=(n.revision||0)+1;n.updated=Date.now();return n;});}
export function saveSummary(id,transcript,chunks,summary){return update(id,n=>{if(!n||n.transcript!==transcript||JSON.stringify(n.chunks||[])!==chunks)return null;n.generatedSummary=summary;n.revision=(n.revision||0)+1;n.updated=Date.now();return n;});}
export async function markBacked(id,revision,audioBacked,folder,targetId=id){
 await update(id,current=>{
  if(!current)return null;
  if((current.backupId||id)!==targetId)throw Error('Backup target changed during copying.');
  current.backedRevision=revision;current.backedFolder=folder;current.backedTargetId=targetId;
  if(current.revision===revision){current.audioBacked=audioBacked;current.audioBackedFolder=folder;current.audioBackedTargetId=targetId;}
  return current;
 });
}
export function forkBackup(id,expectedTarget){
 return update(id,current=>{
  if(!current||current.recording||(current.backupId||id)!==expectedTarget)throw Error('This conversation changed. Refresh the backup report before trying again.');
  return {...current,backupId:crypto.randomUUID(),revision:(current.revision||0)+1,audioBacked:false};
 });
}
export async function remove(id){const r=await engineFetch('/api/library/notes/'+id,{method:'DELETE'});if(!r.ok)await failed(r,'Could not delete from the recordit library.');}

export async function getAudio(id){
 const r=await engineFetch('/api/library/audio/'+id);
 if(r.status===404)return undefined;if(!r.ok)await failed(r,unavailable);
 const blob=await r.blob();return {id,blob:blob.type?blob:new Blob([blob],{type:r.headers.get('Content-Type')||'application/octet-stream'})};
}
async function hasAudio(id){const r=await engineFetch('/api/library/audio/'+id+'?info');if(r.status===404)return false;if(!r.ok)await failed(r,unavailable);return true;}
async function sendAudio(id,blob,mode,offset){
 const r=await engineFetch(`/api/library/audio/${id}?mode=${mode}${offset!==undefined?'&offset='+offset:''}`,{method:'PUT',headers:{'Content-Type':blob.type||'application/octet-stream'},body:blob});
 if(r.status===409&&mode==='append')return null;
 if(!r.ok)await failed(r,'Could not save audio to the recordit library.');return r.json();
}
export async function saveAudio(id,blob){await sendAudio(id,blob,'replace');}
// While recording, only each new piece is sent. Returns false if the library's copy is out of step, so the
// caller sends the whole recording instead.
export async function appendAudio(id,part,offset,type){return Boolean(await sendAudio(id,part.type?part:new Blob([part],{type}),'append',offset));}
export async function attachAudio(id,blob){
 const type=/^(audio\/|video\/mp4)/i.test(blob.type)?blob.type:'application/octet-stream';
 const result=await sendAudio(id,blob.type===type?blob:new Blob([blob],{type}),'attach');return result.note;
}

export async function refileCollections(rules,options={}){
 const capturedRules=structuredClone(rules),capturedOptions=structuredClone(options),ids=capturedOptions.ids?new Set(capturedOptions.ids):null;
 for(let attempt=0;attempt<5;attempt++){
  const puts=[];
  for(const current of await list()){
   if(ids&&!ids.has(current.id))continue;
   if(capturedOptions.rejectRecording&&current.recording)throw Error('Finish recording before changing collections.');
   const patch=filingPatch(current,capturedRules,capturedOptions);
   if(patch)puts.push({note:{...current,...patch,revision:(current.revision||0)+1,updated:Date.now()},ifRevision:current.revision});
  }
  if(!puts.length||await batch(puts))return puts.length;
 }
 throw Error('Conversations kept changing while refiling. Please try again.');
}
export async function fileBatch(ids,target,rules,receipt=null){
 for(let attempt=0;attempt<5;attempt++){
  const notes=await list(),result=bulkFilingPlan(notes,ids,target,rules,receipt);
  const puts=result.entries.map(entry=>{const note=notes.find(n=>n.id===entry.id);return {note:{...applyFilingFields(note,entry.after),revision:(note.revision||0)+1,updated:Date.now()},ifRevision:note.revision};});
  if(!puts.length||await batch(puts))return result;
 }
 throw Error('Batch filing was not saved because conversations kept changing. Please try again.');
}
export async function snapshotLibrary(){
 const notes=await list(),audio=new Map();
 for(const note of notes){const item=await getAudio(note.id);if(item)audio.set(note.id,item);}
 return {notes,audio};
}

// Input comes from validateLibraryTransfer. New identities mean a transfer never overwrites an existing
// conversation; the receipt makes a retried import reuse the copies it already made.
export async function restoreLibrary(conversations,{idFactory=()=>crypto.randomUUID(),importId,importDigest}={}){
 if(!Array.isArray(conversations)||conversations.length>10000)throw Error('Invalid library restore.');
 if(importId!==undefined&&(typeof importId!=='string'||!ID.test(importId)||typeof importDigest!=='string'||!/^[a-f0-9]{64}$/.test(importDigest)))throw Error('Invalid import receipt identity.');
 const fields=['title','transcript','category','tags','collectionManual','secondaryCategories','collectionReason','created','duration','chunks','chats','removedAnswers','highlights','speakerLabels','comments','bookmarks','generatedSummary','audioType','transcriptVersions','speechGaps','transcriptVersionId','transcriptEngine','transcriptEngineLabel','transcribed','mic'];
 const prepared=conversations.map(entry=>{
  if(!entry?.note||typeof entry.note.title!=='string'||typeof entry.note.transcript!=='string')throw Error('Invalid conversation in library restore.');
  if(entry.blob!=null&&(!(entry.blob instanceof Blob)||entry.blob.size===0))throw Error('Invalid audio in library restore.');
  const id=idFactory();if(typeof id!=='string'||!ID.test(id))throw Error('Invalid restored conversation identity.');
  const note={};for(const key of fields)if(entry.note[key]!==undefined)note[key]=structuredClone(entry.note[key]);
  Object.assign(note,{id,revision:1,updated:Date.now(),recording:false,audioBacked:false});
  const blob=entry.blob?(entry.blob.type?entry.blob:new Blob([entry.blob],{type:note.audioType||'application/octet-stream'})):null;
  return {note,blob};
 });
 if(importId){
  const r=await engineFetch('/api/library/imports/'+importId);
  if(r.ok){
   const receipt=await r.json();
   if(receipt.digest!==importDigest||!Array.isArray(receipt.noteIds)||receipt.noteIds.length!==prepared.length||new Set(receipt.noteIds).size!==receipt.noteIds.length||receipt.noteIds.some(id=>typeof id!=='string'||!ID.test(id))||!Array.isArray(receipt.audioIds)||receipt.audioIds.length!==prepared.filter(e=>e.blob).length||new Set(receipt.audioIds).size!==receipt.audioIds.length||receipt.audioIds.some(id=>!receipt.noteIds.includes(id)))throw Error('Import receipt does not match this transfer. No conversations added.');
   const notes=[];
   for(const id of receipt.noteIds){const note=await get(id);if(!note)throw Error('An imported conversation was removed. Retry will not recreate it.');notes.push(note);}
   for(const id of receipt.audioIds)if(!await hasAudio(id))throw Error('Imported audio is missing. Retry will not replace it.');
   return notes;
  }
  if(r.status!==404)await failed(r,unavailable);
 }
 for(const entry of prepared)if(entry.blob)await sendAudio(entry.note.id,entry.blob,'replace');
 if(!await batch(prepared.map(entry=>({note:entry.note,ifRevision:null}))))throw Error('Library restore aborted; no conversations were added.');
 if(importId){
  const r=await engineFetch('/api/library/imports/'+importId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:importId,digest:importDigest,noteIds:prepared.map(e=>e.note.id),audioIds:prepared.filter(e=>e.blob).map(e=>e.note.id)})});
  if(!r.ok)await failed(r,'The import receipt could not be saved.');
 }
 return prepared.map(entry=>entry.note);
}

// Sync from the Drive folder (library-sync.js). syncAdd never replaces an existing conversation, and takes
// the conversation back out if its audio can't be stored, so the next sync tries again cleanly.
export async function syncAdd(note,blob){
 const saved=await put(note,null);if(!saved)return null;
 if(blob){try{await sendAudio(note.id,blob,'replace');}catch(error){await remove(note.id).catch(()=>{});throw error;}}
 return saved;
}
export async function syncUpdate(id,apply,blob){
 const saved=await update(id,current=>apply(current??null)||null);
 if(saved&&blob)await sendAudio(id,blob,'ifMissing');
 return saved;
}
