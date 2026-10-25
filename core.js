import {restoreHighlights} from './highlights.js';
import {restoreSpeakers} from './speakers.js';
import {restoreComments} from './comments.js';
import {restoreBookmarks} from './bookmarks.js';
import {restoreVersions,restoreGaps} from './transcript-versions.js';
import {restoreMic} from './mic-modes.js';
import {restoreMoments} from './moments.js';
export const words=s=>(s.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>2&&!new Set(['the','and','that','this','with','what','was','were','for','from','you','your','have','has','are','can','how','did','about','does','said','would','should','there','they','them']).has(w));
export function asksForAgreements(question){return /\b(agree(?:d|ments)?|decisions?|next steps?|action items?)\b/i.test(question);}
export function exportName(title){const name=String(title||'').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').trim().replace(/[. ]+$/g,'').slice(0,160).replace(/[. ]+$/g,'');return !name?'Conversation':/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)?'Conversation - '+name:name;}
// transcriptText, when given, is the speaker-named transcript; it replaces the plain text and the label list.
export function readableMarkdown(note,summary=null,transcriptText=null){
 const lines=['# '+note.title,''];
 if(summary)for(const [key,title] of [['themes','Main themes'],['conclusions','Conclusions'],['next_steps','Next steps']]){lines.push('## '+title,'');for(const bullet of summary[key]||[])lines.push('- '+bullet.text);if(!summary[key]?.length)lines.push('None identified in the summary.');lines.push('');}
 if(note.highlights?.length){lines.push('## Your highlights (saved excerpts)','');for(const h of note.highlights)lines.push('- ['+h.sourceId+'] '+h.sourceText.slice(h.start,h.end));lines.push('');}
 if(note.speakerLabels?.length&&!transcriptText){lines.push('## Manual speaker labels (saved excerpts)','');for(const label of note.speakerLabels)lines.push('- ['+label.sourceId+'] '+label.name+': '+label.sourceText);lines.push('');}
 if(note.comments?.length){lines.push('## Your comments (saved excerpts)','');for(const c of note.comments)lines.push('### Passage '+c.sourceId,'',...c.sourceText.split('\n').map(line=>'> '+line),'',c.text,'');}
 if(note.bookmarks?.length){lines.push('## Bookmarked passages (saved excerpts)','');for(const bookmark of note.bookmarks)lines.push('- ['+bookmark.id+'] '+bookmark.text);lines.push('');}
 if(note.speechGaps?.length){lines.push('## Possible gaps (speech heard, few or no words recognised)','');for(const g of note.speechGaps)lines.push('- '+clockText(g.start)+'–'+clockText(g.end)+(g.reason==='few-words'?' · fewer words than expected':' · no words recognised'));lines.push('');}
 lines.push('## Transcript','',transcriptText||note.transcript||'No transcript available.','');return lines.join('\n');
}
const clockText=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
export function segments(text){return text.split(/\n+/).filter(s=>s.trim()).flatMap(s=>s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map((text,i)=>({id:i+1,text:text.trim()})).filter(s=>s.text);}
export function rank(text,query){
 const rows=segments(text),q=words(query);if(/next steps?|action|to.do/i.test(query))q.push('will','need','plan','agreed','next','call','book');if(/agree|decid/i.test(query))q.push('agreed','decided','decision','plan');const counts=new Map();
 for(const r of rows)for(const w of new Set(words(r.text)))counts.set(w,(counts.get(w)||0)+1);
 return rows.map(r=>{const ws=new Set(words(r.text));return {...r,score:q.reduce((s,w)=>s+(ws.has(w)?1+Math.log((rows.length+1)/((counts.get(w)||0)+1)):0),0)};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id-b.id);
}
export function summary(text){
 const rows=segments(text),freq=new Map();for(const r of rows)for(const w of words(r.text))freq.set(w,(freq.get(w)||0)+1);
 return rows.map(r=>({...r,score:words(r.text).reduce((s,w)=>s+(freq.get(w)||0),0)/Math.sqrt(Math.max(1,words(r.text).length))+( /\b(agreed|plan|next|will|need|appointment|exercise|follow.up|decided)\b/i.test(r.text)?4:0)})).sort((a,b)=>b.score-a.score).slice(0,6).sort((a,b)=>a.id-b.id);
}
export function contextFor(text,question,maxChars=7000){const rows=rank(text,question).slice(0,10);let used=0;return rows.filter(r=>{used+=r.text.length;return used<=maxChars;});}
export function validateBackup(value){
 if(!value||value.version!==1||typeof value.title!=='string'||typeof value.transcript!=='string'||value.transcript.length>2000000)throw Error('This is not a Record Me transcript backup.');
 return {highlights:restoreHighlights(value.highlights),speakerLabels:restoreSpeakers(value.speakerLabels),comments:restoreComments(value.comments),bookmarks:restoreBookmarks(value.bookmarks),audioType:typeof value.audioType==='string'&&/^(audio\/[a-z0-9.+-]+|video\/mp4)(;.*)?$/i.test(value.audioType)?value.audioType:null,title:value.title.slice(0,200),transcript:value.transcript,category:typeof value.category==='string'?value.category.slice(0,80):'Unfiled',tags:Array.isArray(value.tags)?value.tags.filter(t=>typeof t==='string').slice(0,30):[],collectionManual:true,created:Number(value.created)||Date.now(),duration:Number(value.duration)||0,chunks:Array.isArray(value.chunks)?value.chunks.filter(c=>typeof c.text==='string'&&Array.isArray(c.timestamp)&&c.timestamp.every(t=>t===null||typeof t==='number')):[],...restoredRecordingFields(value)};
}
// Earlier transcripts, new-engine details and microphone settings travel with backups and library transfers.
function restoredRecordingFields(value){
 const fields={},versions=restoreVersions(value.transcriptVersions),gaps=restoreGaps(value.speechGaps),mic=restoreMic(value.mic),moments=restoreMoments(value.moments);
 if(versions.length)fields.transcriptVersions=versions;if(gaps.length)fields.speechGaps=gaps;if(mic)fields.mic=mic;if(moments.length)fields.moments=moments;if(value.titleAuto===true)fields.titleAuto=true;
 if(typeof value.transcriptVersionId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(value.transcriptVersionId))fields.transcriptVersionId=value.transcriptVersionId;
 for(const key of ['transcriptEngine','transcriptEngineLabel'])if(typeof value[key]==='string'&&value[key].length<=80)fields[key]=value[key];
 if(Number.isFinite(value.transcribed))fields.transcribed=value.transcribed; return fields;
}
export function classify(note,collections){
 const text=[note.title,note.transcript,...(note.tags||[])].join(' ').normalize('NFKC').toLowerCase();
 const scored=collections.map(c=>{const matches=[...new Set([c.name,...c.keywords].map(k=>k.trim().normalize('NFKC').toLowerCase()).filter(Boolean))].filter(k=>{const escaped=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(^|[^\\p{L}\\p{N}])'+escaped+'($|[^\\p{L}\\p{N}])','u').test(text);});const tagged=(note.tags||[]).some(t=>t.toLowerCase()===c.name.toLowerCase());return {name:c.name,matches,score:matches.length+(tagged?100:0)};}).filter(c=>c.score>0).sort((a,b)=>b.score-a.score);
 const matched=scored.map(c=>c.name),reasons=scored.map(c=>c.name+': '+c.matches.join(', ')).join(' · ');
 if(!scored.length)return {category:'Unfiled',matched,reason:'No collection keywords matched.'};
 if(scored.length>1&&scored[0].score===scored[1].score)return {category:'Unfiled',matched,reason:'Several collections match equally. Choose a primary collection. '+reasons};
 return {category:scored[0].name,matched,reason:'Matched '+reasons};
}

