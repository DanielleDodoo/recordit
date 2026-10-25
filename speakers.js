export const speakerMatches=(label,source)=>label.sourceId===source.id&&label.sourceText===source.text;
export function restoreSpeakers(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>10000)throw Error('Invalid speaker labels.');
 const seen=new Set();
 return value.map(s=>{
  if(!s||!Number.isInteger(s.sourceId)||s.sourceId<1||typeof s.sourceText!=='string'||!s.sourceText.trim()||s.sourceText.length>2500||typeof s.name!=='string'||!s.name.trim()||s.name.length>80)throw Error('Invalid speaker label.');
  const key=JSON.stringify([s.sourceId,s.sourceText]);if(seen.has(key))throw Error('Duplicate speaker label.');seen.add(key);
  return {sourceId:s.sourceId,sourceText:s.sourceText,name:s.name};
 });
}
export function setSpeaker(labels,source,name,expected=null){
 const list=restoreSpeakers(labels),index=list.findIndex(s=>speakerMatches(s,source));
 if((index<0?null:list[index].name)!==expected)throw Error('This speaker label changed. Reopen it before editing.');
 if(typeof name!=='string'||name.trim().length>80)throw Error('Use a speaker name of up to 80 characters.');
 if(index>=0)list.splice(index,1);
 if(name.trim())list.push({sourceId:source.id,sourceText:source.text,name:name.trim()});
 return restoreSpeakers(list);
}

export function renameSpeaker(labels,sources,from,to,expected){
 if(typeof to!=='string'||!to.trim()||to.trim().length>80)throw Error('Enter a speaker name to rename these passages.');
 const list=restoreSpeakers(labels),snapshot=restoreSpeakers(expected);
 const relevant=items=>items.filter(label=>label.name===from&&sources.some(source=>speakerMatches(label,source)));
 const key=items=>JSON.stringify(relevant(items).map(label=>[label.sourceId,label.sourceText,label.name]).sort((a,b)=>a[0]-b[0]));
 if(!relevant(snapshot).length||key(list)!==key(snapshot))throw Error('These speaker labels changed. Reopen the speaker dialog.');
 return list.map(label=>label.name===from&&sources.some(source=>speakerMatches(label,source))?{...label,name:to.trim()}:label);
}
