// Moments marked while recording: Highlight and Note taps, kept by their time in the audio.
// Once there is a transcript they become ordinary bookmarks and comments on the passage being spoken then,
// and again on every later transcript, so a re-transcription never loses them.
import {sourcesFor} from './summaries.js';
import {restoreBookmarks} from './bookmarks.js';
import {restoreComments} from './comments.js';

export const MOMENT_KINDS=['highlight','note'];
const version=note=>note.transcriptVersionId||'original';

export function restoreMoments(value){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.length>1000)throw Error('Invalid moments.');
 const seen=new Set();
 return value.map(m=>{
  if(!m||typeof m.id!=='string'||!m.id||m.id.length>100||seen.has(m.id)||!Number.isFinite(m.t)||m.t<0||!MOMENT_KINDS.includes(m.kind))throw Error('Invalid moment.');
  const text=typeof m.text==='string'?m.text.trim().slice(0,2000):'';
  if(m.kind==='note'&&!text)throw Error('A note needs words.');
  seen.add(m.id);
  return {id:m.id,t:m.t,kind:m.kind,...(text?{text}:{}),...(typeof m.applied==='string'&&m.applied.length<=100?{applied:m.applied}:{})};
 });
}

export function addMoment(list,{t,kind,text='',id=globalThis.crypto.randomUUID()}){
 return restoreMoments([...restoreMoments(list),{id,t:Math.max(0,Math.round(t*10)/10),kind,text}]);
}

// The passage being spoken at t: the last one that had started by then. A tap usually comes just after the
// words worth keeping, so a tap in a pause marks the passage before it, not the one about to start.
export function passageAt(sources,t){
 const timed=sources.filter(s=>Number.isFinite(s.timestamp?.[0]));
 if(!timed.length)return null;
 let found=timed[0];
 for(const s of timed)if(s.timestamp[0]<=t)found=s;
 return found;
}

// Turns moments not yet placed on the current transcript into bookmarks (Highlight) and comments (Note).
export function applyMoments(note,{newId=()=>globalThis.crypto.randomUUID()}={}){
 const moments=restoreMoments(note.moments),current=version(note);
 if(!moments.some(m=>m.applied!==current))return 0;
 const sources=sourcesFor(note);
 if(!sources.some(s=>Number.isFinite(s.timestamp?.[0])))return 0;
 let bookmarks=restoreBookmarks(note.bookmarks),comments=restoreComments(note.comments),placed=0;
 for(const m of moments){
  if(m.applied===current)continue;
  const source=passageAt(sources,m.t);if(!source)continue;
  if(m.kind==='highlight'){if(!bookmarks.some(b=>b.id===source.id&&b.text===source.text))bookmarks=restoreBookmarks([...bookmarks,{id:source.id,text:source.text}]);}
  else comments=restoreComments([...comments,{id:newId(),sourceId:source.id,sourceText:source.text,text:m.text}]);
  m.applied=current;placed++;
 }
 note.moments=moments;note.bookmarks=bookmarks;note.comments=comments;
 return placed;
}

export const removeMoment=(list,id)=>restoreMoments(list).filter(m=>m.id!==id);
