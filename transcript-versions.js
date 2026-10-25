// Every transcript a conversation has had is kept. A new transcription becomes the current text and the
// previous one is archived with its speaker labels, speech gaps and summary, so it can be restored at any time.
import {sourcesFor,sourceKey,validateSummary} from './summaries.js';
import {restoreSpeakers,speakerMatches} from './speakers.js';

export const MAX_VERSIONS=50;
const labelKey=label=>JSON.stringify([label.sourceId,label.sourceText]);
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.length<=max;

export function restoreGaps(value){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length>10000)throw Error('Invalid speech gaps.');
 return value.map(g=>{if(!g||!Number.isFinite(g.start)||!Number.isFinite(g.end)||g.start<0||g.end<g.start||!['no-words','few-words'].includes(g.reason))throw Error('Invalid speech gap.');return {start:g.start,end:g.end,reason:g.reason};});
}
function restoreChunks(value){return Array.isArray(value)?value.filter(c=>c&&typeof c.text==='string'&&Array.isArray(c.timestamp)&&c.timestamp.every(t=>t===null||typeof t==='number')).map(c=>({timestamp:c.timestamp,text:c.text,...(typeof c.speaker==='string'&&c.speaker.length<=80?{speaker:c.speaker}:{})})):[];}
function restoreSummary(summary,version){
 if(!summary||summary.sourceKey!==sourceKey(version))return null;
 try{const checked=validateSummary(summary,sourcesFor(version));return checked.rejected?{...summary,...checked}:structuredClone(summary);}catch{return null;}
}
export function restoreVersions(value){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length>MAX_VERSIONS)throw Error('Invalid transcript versions.');
 const seen=new Set();
 return value.map(v=>{
  if(!v||!id(v.id)||seen.has(v.id)||!text(v.transcript,2000000)||!Number.isFinite(v.created)||(v.engine!=null&&!text(v.engine,80))||(v.engineLabel!=null&&!text(v.engineLabel,80)))throw Error('Invalid transcript version.');
  seen.add(v.id);
  const version={id:v.id,engine:v.engine??null,engineLabel:v.engineLabel??null,created:v.created,archived:Number.isFinite(v.archived)?v.archived:v.created,transcript:v.transcript,chunks:restoreChunks(v.chunks),speakerLabels:restoreSpeakers(v.speakerLabels),speechGaps:restoreGaps(v.speechGaps)};
  version.generatedSummary=restoreSummary(v.generatedSummary,version);
  return version;
 });
}

// Speaker labels use the same passage numbering as sourcesFor, so they work with naming, renaming and filtering.
export function autoSpeakerLabels(chunks){
 const labels=[];let sourceId=0;
 for(const chunk of chunks)for(const part of sourcesFor({chunks:[chunk]})){sourceId++;if(chunk.speaker)labels.push({sourceId,sourceText:part.text,name:chunk.speaker});}
 return labels;
}

function archive(note,now){
 const sources=sourcesFor(note),labels=restoreSpeakers(note.speakerLabels);
 return {id:note.transcriptVersionId||'original',engine:note.transcriptEngine||null,engineLabel:note.transcriptEngineLabel||null,created:note.transcribed||note.created||now,archived:now,transcript:note.transcript||'',chunks:restoreChunks(note.chunks),speakerLabels:labels.filter(l=>sources.some(s=>speakerMatches(l,s))),speechGaps:restoreGaps(note.speechGaps),generatedSummary:note.generatedSummary?structuredClone(note.generatedSummary):null};
}
function activate(note,version,keptLabels){
 const taken=new Set(version.speakerLabels.map(labelKey));
 note.transcript=version.transcript;note.chunks=version.chunks;note.speechGaps=version.speechGaps;
 note.transcriptVersionId=version.id;note.transcriptEngine=version.engine;note.transcriptEngineLabel=version.engineLabel;note.transcribed=version.created;
 note.speakerLabels=restoreSpeakers([...keptLabels.filter(l=>!taken.has(labelKey(l))),...version.speakerLabels]);
 if(version.generatedSummary)note.generatedSummary=version.generatedSummary;else delete note.generatedSummary;
}
// Labels that belong to the outgoing text travel with its archived version; older, already-stale labels stay put.
function keptAfterArchiving(note,archived){
 const moved=new Set((archived?.speakerLabels||[]).map(labelKey));
 return restoreSpeakers(note.speakerLabels).filter(l=>!moved.has(labelKey(l)));
}

export function applyTranscription(note,result,{now,versionId}){
 const chunks=restoreChunks(result.chunks);
 if(!chunks.some(c=>c.text.trim()))throw Error('No speech was recognised in this recording. Your recording and any earlier transcript are unchanged.');
 const versions=restoreVersions(note.transcriptVersions);
 const archived=note.transcript?.trim()||note.chunks?.length?archive(note,now):null;
 if(archived){if(versions.length>=MAX_VERSIONS)throw Error('This conversation already keeps '+MAX_VERSIONS+' transcripts. Nothing was replaced.');versions.push(archived);}
 const kept=keptAfterArchiving(note,archived);
 note.transcriptVersions=versions;
 activate(note,{id:versionId,engine:result.engine||null,engineLabel:result.engineLabel||null,created:now,transcript:result.transcript||chunks.map(c=>c.text).join(' '),chunks,speakerLabels:[],speechGaps:restoreGaps(result.gaps),generatedSummary:null},kept);
 const taken=new Set(note.speakerLabels.map(labelKey));
 note.speakerLabels=restoreSpeakers([...note.speakerLabels,...autoSpeakerLabels(chunks).filter(l=>!taken.has(labelKey(l)))]);
 if(Number.isFinite(result.duration)&&result.duration>0)note.duration=result.duration;
 return note;
}

export function switchVersion(note,versionId,now){
 const versions=restoreVersions(note.transcriptVersions),index=versions.findIndex(v=>v.id===versionId);
 if(index<0)throw Error('That transcript version is no longer available. Reopen the conversation.');
 const [chosen]=versions.splice(index,1),archived=archive(note,now);
 versions.push(archived);
 const kept=keptAfterArchiving(note,archived);
 note.transcriptVersions=versions;activate(note,chosen,kept);
 return note;
}

// Versions for a picker, newest first, including the one currently shown.
export function versionChoices(note){
 const current={id:note.transcriptVersionId||'original',engineLabel:note.transcriptEngineLabel||null,created:note.transcribed||note.created,current:true};
 return [current,...(note.transcriptVersions||[]).map(v=>({id:v.id,engineLabel:v.engineLabel,created:v.created,current:false}))].sort((a,b)=>(b.created||0)-(a.created||0));
}

// Each transcript version has its own Markdown file, so a new transcript never rewrites the file of an
// earlier one and switching versions never creates copies. Original transcripts keep their existing file.
export function autosaveKey(note){
 const version=note.transcriptVersionId;
 return version&&version!=='original'?note.id+'--'+version:note.id;
}
// The time is part of the name so two transcripts made on the same day never share a file.
export function autosaveTitle(note){
 if(!note.transcriptEngine)return note.title;
 const t=new Date(note.transcribed||0),two=n=>String(n).padStart(2,'0');
 return `${note.title} · ${note.transcriptEngineLabel||'transcript'} ${t.getFullYear()}-${two(t.getMonth()+1)}-${two(t.getDate())} ${two(t.getHours())}${two(t.getMinutes())}`;
}
// Speaker-named paragraphs for new-engine transcripts; null keeps the earlier plain export unchanged.
export function labelledTranscript(note){
 if(!note.transcriptEngine)return null;
 const labels=restoreSpeakers(note.speakerLabels),named=sourcesFor(note).map(s=>({text:s.text,name:labels.find(l=>speakerMatches(l,s))?.name||null}));
 if(!named.some(s=>s.name))return null;
 const paragraphs=[];let previous;
 for(const s of named){if(paragraphs.length&&s.name===previous)paragraphs[paragraphs.length-1]+=' '+s.text;else paragraphs.push((s.name?'**'+s.name+':** ':'')+s.text);previous=s.name;}
 return paragraphs.join('\n\n');
}
