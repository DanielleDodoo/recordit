import {readableMarkdown} from './core.js';
import {sourceKey} from './summaries.js';
import {autosaveKey,autosaveTitle,labelledTranscript} from './transcript-versions.js';

export function createTranscriptAutosave({list,onStatus,request=fetch}){
 const saved=new Map();let timer,running=false,again=false;
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(flush,1000);};
 async function flush(){
  if(running){again=true;return;}running=true;
  try{
   const response=await request('/api/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('Local engine unavailable.');
   const status=await response.json();
   if(!status.transcriptAutosave)throw Error('Restart recordit to enable automatic Markdown saving.');
   onStatus(null,'');
   for(const note of await list()){
    if(note.recording||!note.transcript?.trim())continue;
    try{
    const summary=note.generatedSummary?.sourceKey===sourceKey(note)?note.generatedSummary:null;
    const markdown=readableMarkdown(note,summary,labelledTranscript(note)),title=autosaveTitle(note);
    const fingerprint=JSON.stringify([status.exportFolder,note.revision||0,title,markdown]);
    if(saved.get(note.id)===fingerprint)continue;
    onStatus(note.id,'Saving readable transcript…');
    const result=await request('/api/transcript-autosave',{method:'PUT',headers:{'Content-Type':'application/json','X-Record-Me-Token':status.token},body:JSON.stringify({id:autosaveKey(note),title,markdown,revision:note.revision||0}),signal:AbortSignal.timeout(30000)});
    if(!result.ok){onStatus(note.id,'Markdown save pending · retrying while recordit is open.');throw Error(result.status===409?'A newer transcript is already saved. Retrying the current version.':'Could not save the Markdown copy. Your conversation remains saved in recordit.');}
    const file=await result.json();saved.set(note.id,fingerprint);
    onStatus(note.id,'Markdown saved · '+file.path);
    }catch(error){onStatus(note.id,error.message+' Will retry while recordit is open.');}
   }
  }catch(error){onStatus(null,error.message+' Will retry while recordit is open.');}
  finally{running=false;if(again){again=false;schedule();}}
 }
 return {schedule,flush};
}
