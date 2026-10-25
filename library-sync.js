// Brings conversations from your other laptops in through the shared Drive backup folder. Each laptop already
// pushes its own changes there (drive-backup.js); this is the other direction. Rules, so nothing is ever lost:
// - a conversation this laptop doesn't have is added, with its audio;
// - a newer copy replaces the local one only if the local one has no changes that haven't been backed up yet;
// - if both laptops changed it, both versions are kept: the local one moves to its own backup file;
// - conversations deleted on this laptop are not brought back here (the Drive copy is kept).
import {validateBackup} from './core.js';
import {restoreHistory} from './backup-history.js';
import {sourceKey,sourcesFor,validateSummary,SUMMARY_MODEL} from './summaries.js';

// Every conversation field a backup carries; anything missing from a newer copy is removed locally too.
export const SYNC_FIELDS=['title','category','tags','collectionManual','secondaryCategories','collectionReason','created','duration','transcript','chunks','chats','removedAnswers','generatedSummary','highlights','speakerLabels','comments','bookmarks','audioType','transcriptVersions','speechGaps','moments','titleAuto','transcriptVersionId','transcriptEngine','transcriptEngineLabel','transcribed','mic'];

const IGNORED='recordit.syncIgnored';
export function ignoredTargets(storage=globalThis.localStorage){try{const list=JSON.parse(storage?.getItem(IGNORED)||'[]');return new Set(Array.isArray(list)?list.filter(t=>typeof t==='string'):[]);}catch{return new Set();}}
export function ignoreTarget(target,storage=globalThis.localStorage){try{const list=[...ignoredTargets(storage),target].slice(-5000);storage?.setItem(IGNORED,JSON.stringify([...new Set(list)]));}catch{}}

export function planSync({notes,backups,ignored=new Set()}){
 const byTarget=new Map(notes.map(n=>[n.backupId||n.id,n])),actions=[];
 for(const backup of backups){
  if(ignored.has(backup.target)||!['ready','legacy'].includes(backup.state))continue;
  const local=byTarget.get(backup.target);
  if(!local){actions.push({type:'add',backup});continue;}
  // Copies made before protection records have no known revision: they are only ever added, never applied over a conversation.
  if(local.recording||backup.state==='legacy')continue;
  const base=Number.isSafeInteger(local.backedRevision)&&(local.backedTargetId||local.id)===backup.target?local.backedRevision:null;
  if(base!==null&&backup.revision<=base)continue;
  actions.push({type:base!==null&&local.revision===base?'update':'conflict',backup,note:local});
 }
 return actions;
}

// A local conversation from a backup file, marked as already backed up so it isn't copied straight back.
export function noteFromBackup(raw,{id,backup,folder,now=Date.now()}){
 const note={id,chats:[],chunks:[],...validateBackup(raw)};
 if(typeof raw.collectionManual==='boolean')note.collectionManual=raw.collectionManual;
 if(Array.isArray(raw.secondaryCategories))note.secondaryCategories=raw.secondaryCategories.filter(c=>typeof c==='string').slice(0,30);
 if(typeof raw.collectionReason==='string')note.collectionReason=raw.collectionReason.slice(0,10000);
 Object.assign(note,restoreHistory(raw,note));
 if(raw.generatedSummary?.sourceKey===sourceKey(note)){try{note.generatedSummary={...validateSummary(raw.generatedSummary,sourcesFor(note)),sourceKey:sourceKey(note),parts:Number(raw.generatedSummary.parts)||1,created:Number(raw.generatedSummary.created)||now,model:typeof raw.generatedSummary.model==='string'?raw.generatedSummary.model:SUMMARY_MODEL};}catch{}}
 const revision=backup.state==='ready'?backup.revision:1;
 Object.assign(note,{revision,backedRevision:revision,backedFolder:folder,backedTargetId:backup.target,audioBacked:Boolean(backup.audio),audioBackedFolder:folder,audioBackedTargetId:backup.target,recording:false,updated:now});
 if(id!==backup.target)note.backupId=backup.target;
 return note;
}

// Applied inside the database transaction to the record as it is right then.
export function mergeIncoming(current,incoming){
 const next={...current};
 for(const key of SYNC_FIELDS)if(incoming[key]===undefined)delete next[key];else next[key]=incoming[key];
 for(const key of ['revision','backedRevision','backedFolder','backedTargetId','audioBacked','audioBackedFolder','audioBackedTargetId','updated'])next[key]=incoming[key];
 return next;
}

export function createLibrarySync({list,getAudio,syncAdd,syncUpdate,forkBackup,enabled,onStatus=()=>{},request=fetch,newId=()=>crypto.randomUUID(),storage=globalThis.localStorage}){
 let active;
 async function run(){
  const result={added:0,updated:0,kept:0,failed:0,changed:new Set()};
  if(!enabled())return result;
  const response=await request('/api/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Laptop backup bridge unavailable.');
  const status=await response.json();
  if(!status.available)throw Error('Google Drive folder is unavailable. Connect Google Drive on this laptop.');
  if(!status.librarySync)throw Error('Restart the recordit engine to sync with your other laptops.');
  const headers={'X-Record-Me-Token':status.token};
  const read=async(name,signal)=>{const r=await request('/api/backup/'+name,{headers,cache:'no-store',signal});if(!r.ok)throw Error('Could not read '+name+' from the Drive folder.');return r;};
  const indexResponse=await request('/api/backup-index',{headers,cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!indexResponse.ok)throw Error('Could not read the Drive folder.');
  const {folder,backups}=await indexResponse.json(),notes=await list();
  const actions=planSync({notes,backups,ignored:ignoredTargets(storage)});
  for(const action of actions){
   const {backup}=action;
   try{
    onStatus('Bringing in changes from your other laptop…');
    const raw=await (await read(backup.target+'.json',AbortSignal.timeout(60000))).json();
    const audioFor=async type=>backup.audio?new Blob([await (await read(backup.target+'.audio',AbortSignal.timeout(600000))).blob()],{type:type||'application/octet-stream'}):null;
    if(action.type==='update'){
     const incoming=noteFromBackup(raw,{id:action.note.id,backup,folder});
     const blob=(await getAudio(action.note.id))?.blob?null:await audioFor(incoming.audioType);
     const saved=await syncUpdate(action.note.id,current=>current&&!current.recording&&current.revision===action.note.revision&&current.revision===current.backedRevision?mergeIncoming(current,incoming):null,blob);
     if(saved){result.updated++;result.changed.add(saved.id);}
     continue;
    }
    // Both laptops changed it: this laptop's version moves to its own backup file, and the other version comes in beside it.
    if(action.type==='conflict'){const forked=await forkBackup(action.note.id,action.note.backupId||action.note.id);result.kept++;result.changed.add(forked.id);}
    const id=action.type==='add'&&!notes.some(n=>n.id===backup.target)?backup.target:newId();
    const note=noteFromBackup(raw,{id,backup,folder});
    const saved=await syncAdd(note,await audioFor(note.audioType));
    if(saved){if(action.type==='add')result.added++;result.changed.add(saved.id);}
   }catch(error){result.failed++;}
  }
  const parts=[result.added&&`${result.added} conversation${result.added>1?'s':''} added`,result.updated&&`${result.updated} updated`,result.kept&&`${result.kept} edited on both laptops, so both versions were kept`,result.failed&&`${result.failed} will retry`].filter(Boolean);
  onStatus(parts.length?'From your other laptop: '+parts.join(' · ')+'.':'Up to date with your other laptops.');
  return result;
 }
 return {flush(){if(active)return active;active=run().finally(()=>{active=null;});return active;}};
}
