// Ronnie keeps her own record of every conversation: each line she spoke and each line she heard Danielle say, with
// the time, saved word for word on the robot and backed up to Google Drive. A recording of a conversation with her is
// lined up with that record word by word, so each passage says who really spoke it: the speech engine alone can't
// tell a robot's voice through a speaker from Danielle's (30 Oct 2026). The recording's words are never changed,
// only who said them.
export const NAMES={assistant:'Ronnie',user:'Danielle'};
export const RONNIE_LABEL=' + Ronnie’s record';   // added to the transcript version’s name
const WINDOW=90_000;      // a word only lines up with a record word said within 90 s of it
const BLOCK=400;          // recording words lined up at a time, so a long recording stays quick
const PER_WORD=370;       // ms per spoken word, to place each word inside its record line
const HEARD_AFTER=1500;   // Ronnie writes down what she heard about 1.5 s after Danielle stops
const MIN_ANCHORS=5;      // phrases found in both, agreeing on the clock, before the record is trusted
const norm=w=>w.toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9']/g,'');
const tokens=text=>String(text||'').split(/\s+/).filter(Boolean);

// Ronnie's line times: her own lines are written as she starts speaking, Danielle's just after Danielle finishes.
function recordWords(lines){
 const R=[];
 lines.forEach((l,line)=>{
  const words=tokens(l.text).map(norm).filter(Boolean),n=words.length;
  words.forEach((w,k)=>R.push({w,role:l.role,line,at:l.role==='assistant'?l.at+k*PER_WORD:l.at-HEARD_AFTER-(n-1-k)*PER_WORD}));
 });
 return R;
}
function recordingWords(chunks,start){
 const C=[];
 chunks.forEach((c,chunk)=>{
  const [from,to]=c.timestamp||[],list=tokens(c.text),span=Math.max(0,(Number(to)||Number(from)||0)-(Number(from)||0));
  list.forEach((token,k)=>{const w=norm(token);if(w)C.push({w,chunk,token:k,at:start+((Number(from)||0)+span*k/list.length)*1000});});
 });
 return C;
}

// The recording's clock against Ronnie's: three-word phrases said exactly once in each, and their time difference.
function clockOffset(C,R){
 const grams=list=>{const map=new Map();for(let i=0;i+2<list.length;i++){const g=list[i].w+' '+list[i+1].w+' '+list[i+2].w;map.set(g,map.has(g)?null:i);}return map;};
 const inRecord=grams(R),deltas=[];
 for(const [g,i] of grams(C)){const j=inRecord.get(g);if(i!==null&&j!=null)deltas.push(R[j].at-C[i].at);}
 if(deltas.length<MIN_ANCHORS)return null;
 deltas.sort((a,b)=>a-b);const middle=deltas[deltas.length>>1];
 return deltas.filter(d=>Math.abs(d-middle)<=60_000).length>=MIN_ANCHORS?middle:null;
}

// The most shared words in order, a block at a time; between equally long line-ups, the one closer in time wins
// (Danielle says "fairy tales", then Ronnie repeats it). A word matched on its own (no matched neighbour) is
// dropped: lone "the"s and "yeah"s line up by chance.
function align(C,R){
 const match=new Array(C.length).fill(-1);
 for(let s=0;s<C.length;s+=BLOCK){
  const block=C.slice(s,s+BLOCK),from=block[0].at-WINDOW,to=block[block.length-1].at+WINDOW;
  let lo=0;while(lo<R.length&&R[lo].at<from)lo++;
  let hi=lo;while(hi<R.length&&R[hi].at<=to)hi++;
  const rows=block.length,cols=hi-lo,W=cols+1;if(!cols)continue;
  const score=new Float64Array((rows+1)*W),step=new Uint8Array((rows+1)*W);   // step: 1 matched, 2 skip recording word, 3 skip record word
  for(let i=1;i<=rows;i++)for(let j=1;j<=cols;j++){
   const a=block[i-1],b=R[lo+j-1],gap=Math.abs(a.at-b.at),up=score[(i-1)*W+j],left=score[i*W+j-1];
   const diagonal=a.w===b.w&&gap<=WINDOW?score[(i-1)*W+j-1]+1+0.5*(1-gap/WINDOW):-1;
   const best=Math.max(diagonal,up,left);score[i*W+j]=best;step[i*W+j]=best===diagonal?1:best===up?2:3;
  }
  for(let i=rows,j=cols;i>0&&j>0;){
   const k=step[i*W+j];
   if(k===1){match[s+i-1]=lo+j-1;i--;j--;}else if(k===2)i--;else j--;
  }
 }
 return match.map((j,i)=>j>=0&&(match[i-1]===j-1||match[i+1]===j+1)?j:-1);
}

// Who spoke each word of a passage, with unmatched words taking their neighbours' speaker; stretches of fewer than
// three words join the stretch before them, and a change of speaker moves to a sentence end close by.
function stretches(roles,list){
 const filled=[...roles];let last=null;
 for(let k=0;k<filled.length;k++){if(filled[k])last=filled[k];else filled[k]=last;}
 const first=filled.find(Boolean)||null;for(let k=0;k<filled.length&&!filled[k];k++)filled[k]=first;
 const join=runs=>runs.reduce((all,r)=>{const prev=all[all.length-1];if(prev&&prev.role===r.role)prev.to=r.to;else all.push({...r});return all;},[]);
 let runs=join(filled.map((role,k)=>({role,from:k,to:k+1})));
 for(let k;runs.length>1&&(k=runs.findIndex(r=>r.to-r.from<3))>=0;){
  if(k>0)runs[k-1].to=runs[k].to;else runs[1].from=runs[0].from;
  runs.splice(k,1);runs=join(runs);
 }
 for(let k=1;k<runs.length;k++){
  const at=runs[k].from,ends=[];
  for(let b=Math.max(runs[k-1].from+1,at-3);b<=Math.min(runs[k].to-1,at+3);b++)if(/[.?!]["”’)]*$/.test(list[b-1]))ends.push(b);
  if(ends.length){const b=ends.sort((x,y)=>Math.abs(x-at)-Math.abs(y-at))[0];runs[k-1].to=b;runs[k].from=b;}
 }
 return runs;
}

// chunks: the transcript's passages ({timestamp:[from,to] in seconds, text, speaker}); lines: Ronnie's record
// ({at: ms, role: 'assistant'|'user', text}); start: when the recording began (ms). Returns null when the record
// doesn't cover this recording. split:false keeps every passage whole (so highlights and comments stay on them).
export function whoSaidWhat(chunks,lines,start,{split=true}={}){
 if(!Array.isArray(chunks)||!chunks.length||!Array.isArray(lines)||!lines.length||!Number.isFinite(start))return null;
 if(!chunks.every(c=>Array.isArray(c.timestamp)&&Number.isFinite(Number(c.timestamp[0]))))return null;
 const R=recordWords(lines),C=recordingWords(chunks,start);
 const offset=clockOffset(C,R);if(offset===null)return null;
 for(const c of C)c.at+=offset;
 const match=align(C,R),matched=C.filter((c,i)=>match[i]>=0);
 if(matched.length<MIN_ANCHORS*3)return null;
 // The conversation with Ronnie runs from the first to the last word lined up with her record; outside it (someone
 // else on a call, say) passages keep what the speech engine said.
 const from=Math.min(...matched.map(c=>c.at))-10_000,to=Math.max(...matched.map(c=>c.at))+10_000;
 const inside=C.filter(c=>c.at>=from&&c.at<=to).length;
 if(matched.length<inside*0.4)return null;
 // Where each of Ronnie's lines sits in the recording: anything unmatched inside one is hers.
 const hers=new Map();C.forEach((c,i)=>{const r=R[match[i]];if(!r||r.role!=='assistant')return;const s=hers.get(r.line)||[c.at,c.at];hers.set(r.line,[Math.min(s[0],c.at),Math.max(s[1],c.at)]);});
 const inHerLine=at=>[...hers.values()].some(([a,b])=>at>=a-1000&&at<=b+1000);
 const roleOf=new Map();C.forEach((c,i)=>{if(match[i]>=0)roleOf.set(c.chunk+':'+c.token,R[match[i]].role);});
 const out=[],counts={ronnie:0,danielle:0,kept:0};
 chunks.forEach((c,i)=>{
  const list=tokens(c.text),roles=list.map((_,k)=>roleOf.get(i+':'+k)||null);
  const [t0,t1]=[Number(c.timestamp[0])||0,Number(c.timestamp[1])||Number(c.timestamp[0])||0],mid=start+offset+(t0+t1)/2*1000;
  const said={assistant:roles.filter(r=>r==='assistant').length,user:roles.filter(r=>r==='user').length};
  let role=null;
  if(said.assistant+said.user>=2||(said.assistant+said.user===1&&list.length<=2))role=said.assistant>said.user?'assistant':said.user>said.assistant?'user':null;
  if(!role&&mid>=from&&mid<=to)role=inHerLine(mid)?'assistant':'user';   // everything Ronnie says is in her record
  if(!role){out.push({...c});counts.kept++;return;}
  const runs=split&&said.assistant>=3&&said.user>=3?stretches(roles,list):[];
  if(runs.length<2){out.push({...c,speaker:NAMES[role]});counts[role==='assistant'?'ronnie':'danielle']++;return;}
  // Both spoke in this passage: it becomes one passage each, timed by their share of the words.
  for(const run of runs){
   const at=k=>Math.round((t0+(t1-t0)*k/list.length)*100)/100;
   out.push({timestamp:[at(run.from),at(run.to)],text:list.slice(run.from,run.to).join(' '),speaker:NAMES[run.role]});
   counts[run.role==='assistant'?'ronnie':'danielle']++;
  }
 });
 return {chunks:out,...counts};
}
