// The speech engine's own speaker groups ("Speaker 1", "Speaker 2"…) are kept on each passage, apart from the
// names people type. Naming by group can therefore always be redone, even after a mistaken "rename all".
import {sourcesFor} from './summaries.js';
import {restoreSpeakers} from './speakers.js';

const key=(id,text)=>id+'\u0000'+text;
function mostCommon(names){
 const counts=new Map();for(const name of names)counts.set(name,(counts.get(name)||0)+1);
 let best=null,most=0;for(const [name,count] of counts)if(count>most){best=name;most=count;}
 return best;
}

// Groups in order of first appearance, each with its passages (same numbering as sourcesFor) and the name most of them carry now.
export function voiceGroups(note){
 const labels=new Map(restoreSpeakers(note.speakerLabels).map(l=>[key(l.sourceId,l.sourceText),l.name])),groups=new Map();let id=0;
 for(const chunk of note.chunks||[])for(const part of sourcesFor({chunks:[chunk]})){
  id++;if(!chunk.speaker)continue;
  if(!groups.has(chunk.speaker))groups.set(chunk.speaker,[]);
  groups.get(chunk.speaker).push({id,text:part.text,timestamp:part.timestamp,name:labels.get(key(id,part.text))||null});
 }
 return [...groups].map(([group,sources])=>({group,sources,name:mostCommon(sources.map(s=>s.name).filter(Boolean))||group}));
}

// Longer passages give a better listen; returned in time order.
export function voiceSamples(group,count=2){
 return [...group.sources].sort((a,b)=>b.text.length-a.text.length).slice(0,count).sort((a,b)=>a.id-b.id);
}

// Lines still carrying their group's current name (or no name) take the new one; lines someone changed one by one
// keep their own name unless resetIndividual is set. Passages outside any group are left alone.
export function nameVoiceGroups(note,names,{resetIndividual=false}={}){
 const labels=new Map(restoreSpeakers(note.speakerLabels).map(l=>[key(l.sourceId,l.sourceText),l]));
 for(const group of voiceGroups(note)){
  const name=String(names[group.group]??'').trim()||group.group;
  if(name.length>80)throw Error('Use speaker names of up to 80 characters.');
  for(const source of group.sources)if(resetIndividual||!source.name||source.name===group.name||source.name===group.group)labels.set(key(source.id,source.text),{sourceId:source.id,sourceText:source.text,name});
 }
 return restoreSpeakers([...labels.values()]);
}
