export function subtitleIssue(chunks){
 if(!Array.isArray(chunks)||!chunks.length)return 'SRT needs timestamped transcription. Plain text has no saved timing.';
 let previous=-1;
 for(const c of chunks){
  const t=c?.timestamp;
  if(typeof c?.text!=='string'||!c.text.trim()||!Array.isArray(t)||t.length!==2||!t.every(Number.isFinite)||t[0]<0||t[1]<=t[0]||t[0]<previous||!Number.isSafeInteger(Math.round(t[1]*1000))||Math.round(t[1]*1000)<=Math.round(t[0]*1000))return 'SRT needs valid start and end times for every passage. Re-transcribe the audio to restore timing.';
  previous=t[0];
 }
 return '';
}
function stamp(seconds){const ms=Math.round(seconds*1000);return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+','+String(ms%1000).padStart(3,'0');}
export function subtitleText(chunks){
 const issue=subtitleIssue(chunks);if(issue)throw Error(issue);
 return chunks.map((c,i)=>(i+1)+'\n'+stamp(c.timestamp[0])+' --> '+stamp(c.timestamp[1])+'\n'+c.text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join('\n')).join('\n\n')+'\n';
}
