import {sourcesFor} from './summaries.js';
import {subtitleIssue} from './subtitle-export.js';
export const correctionKey=note=>JSON.stringify([note.transcript,note.chunks]);
// Only offer edits when every displayed passage has one original timed chunk,
// and the transcript contains those exact words with whitespace between them.
export function correctionRanges(note){
 if(subtitleIssue(note.chunks))return null;
 const sources=sourcesFor(note);if(sources.length!==note.chunks.length)return null;
 let end=0;const ranges=[];
 for(let i=0;i<note.chunks.length;i++){
  const text=note.chunks[i].text.trim();if(sources[i].text!==text)return null;
  const start=note.transcript.indexOf(text,end);
  if(start<0||note.transcript.slice(end,start).trim())return null;
  ranges.push({start,end:start+text.length});end=start+text.length;
 }
 return note.transcript.slice(end).trim()?null:ranges;
}
export function correctPassage(note,expected,id,replacement){
 if(note.recording||correctionKey(note)!==expected)throw Error('The transcript changed or recording is active. Reopen the passage before correcting it.');
 const ranges=correctionRanges(note),index=id-1;
 if(!Number.isInteger(id)||!ranges?.[index])throw Error('This passage cannot be corrected while preserving its timing.');
 if(typeof replacement!=='string'||!replacement.trim()||replacement.trim().length>1800)throw Error('Enter between 1 and 1800 characters for this passage.');
 const text=replacement.trim(),range=ranges[index],chunks=note.chunks.map((chunk,i)=>i===index?{...chunk,text}:chunk);
 const result={...note,chunks,transcript:note.transcript.slice(0,range.start)+text+note.transcript.slice(range.end)};
 if(!correctionRanges(result))throw Error('This edit would change the passage boundaries. Shorten the correction.');
 delete result.generatedSummary;
 return result;
}

export function replaceTranscript(note,expected,text){
 if(note.recording||correctionKey(note)!==expected)throw Error('The transcript changed or recording is active. Reopen the editor before saving.');
 if(typeof text!=='string'||!text.trim()||text.length>2000000)throw Error('Enter transcript text up to 2 million characters.');
 if(text===note.transcript)return note;
 const result={...note,transcript:text,chunks:[]};delete result.generatedSummary;return result;
}
