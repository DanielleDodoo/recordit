// The browser database is the durable queue. Files are copied locally; cloud upload is external.
export function createDriveBackup({list,getAudio,markBacked,exportData,onStatus,onSaved=()=>{},onDestination=()=>{},onConflicts=()=>{},enabled,request=fetch}){
 let active;const held=new Map();
 async function run(){
  let failures=0,copied=0;
  try{
   if(!enabled())return;
   onStatus('Checking the local Drive folder…');
   const response=await request('/api/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Laptop backup bridge unavailable.');
   const status=await response.json();
   if(!status.available)throw Error('Google Drive folder is unavailable. Connect Google Drive on the laptop.');
   if(!status.guardedBackup)throw Error('Restart the local engine to enable protected backups.');
   const folder=status.backupFolder;if(typeof folder!=='string'||!folder.trim())throw Error('Backup destination is not identified. Restart the local engine.');onDestination(folder);
   const notes=await list(),ids=new Set(notes.map(note=>note.id));
   for(const id of held.keys())if(!ids.has(id))held.delete(id);
   for(const note of notes){
    if(!enabled()){onStatus('Automatic backup paused. Uncopied conversations remain queued on this device.');return;}
    if(note.recording)continue;
    const targetId=note.backupId||note.id;
    if(note.backedRevision===note.revision&&note.backedFolder===folder&&(note.backedTargetId||note.id)===targetId){held.delete(note.id);continue;}
    try{
     const revision=note.revision,audio=await getAudio(note.id);let audioBacked=Boolean(note.audioBacked)&&note.audioBackedFolder===folder&&(note.audioBackedTargetId||note.id)===targetId;
     onStatus('Copying '+note.title+' to the local Drive folder…');
     const send=async(extension,body,type)=>{
      const result=await request('/api/backup/'+targetId+extension,{method:'PUT',headers:{'X-Record-Me-Token':status.token,'Content-Type':type,'X-Recordit-Revision':String(revision)},body,signal:AbortSignal.timeout(120000)});
      if(!result.ok){
       const reason=result.status===409&&result.text?await result.text().catch(()=>''):'';
       throw Object.assign(Error(reason.slice(0,400)||'Local Drive copy failed.'),{conflict:result.status===409,file:targetId+extension});
      }
     };
     if(audio?.blob&&!audioBacked){await send('.audio',audio.blob,audio.blob.type||'application/octet-stream');audioBacked=true;}
     await send('.json',JSON.stringify({...exportData(note),audioFile:targetId+'.audio'},null,2),'application/json');
     await markBacked(note.id,revision,audioBacked,folder,targetId);copied++;held.delete(note.id);
     onSaved(note.id,revision,audioBacked,folder,targetId);
    }catch(error){failures++;if(error.conflict){held.set(note.id,{id:note.id,title:note.title||'Untitled conversation',file:error.file,folder,targetId,reason:error.message});}}
   }
   const conflicts=held.size;onConflicts([...held.values()]);
   onStatus(conflicts?`${copied} copied; ${conflicts} backup conflict${conflicts===1?'':'s'} held for review. Existing files are preserved; other queued copies will retry.`:failures?`${copied} copied; ${failures} conversation${failures===1?'':'s'} still queued. Will retry while recordit is open. Your local recordings are safe.`:'Copied to the agreed Drive folder. Google Drive desktop controls cloud upload status.');
  }catch(error){onStatus(error.message+' Will retry while recordit is open. Your local recordings are safe.');}
 }
 return {flush(){if(active)return active;active=run().finally(()=>{active=null;});return active;}};
}
