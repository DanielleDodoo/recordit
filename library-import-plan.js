const fold=value=>value.normalize('NFKC').trim().toLowerCase();
const keywords=rule=>JSON.stringify([...new Set(rule.keywords.map(fold))].sort());
function checkRule(rule){
 if(!rule||typeof rule.name!=='string'||!rule.name.trim()||rule.name.length>80||['all','unfiled'].includes(fold(rule.name))||!Array.isArray(rule.keywords)||rule.keywords.length>200||rule.keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>200))throw Error('Invalid collection rules in import preview.');
}

// Pure preview: keep existing rules and give different incoming rules their own
// names. No conversation or setting changes until a later explicit restore.
export function planLibraryImport(validated,currentCollections){
 if(!validated||!Array.isArray(validated.collections)||!Array.isArray(validated.conversations)||!Array.isArray(currentCollections))throw Error('Invalid library import preview.');
 if(currentCollections.length>200)throw Error('Too many existing collections.');
 const collections=structuredClone(currentCollections),byName=new Map(),mapping=new Map(),changes=[];
 for(const rule of collections){checkRule(rule);const key=fold(rule.name);if(byName.has(key))throw Error('Existing collection names are ambiguous.');byName.set(key,rule);}
 const reserve=rule=>{if(collections.length>=200)throw Error('Import would exceed 200 collections.');collections.push(rule);byName.set(fold(rule.name),rule);};
 const incoming=new Set();
 for(const original of validated.collections){
  checkRule(original);const key=fold(original.name);if(incoming.has(key))throw Error('Incoming collection names are ambiguous.');incoming.add(key);
  const same=byName.get(key);
  if(!same){const added=structuredClone(original);reserve(added);mapping.set(key,added.name);changes.push({type:'add',from:original.name,to:added.name});continue;}
  if(keywords(same)===keywords(original)){mapping.set(key,same.name);continue;}
  let name,index=1;do{const suffix=index===1?' (imported)':' (imported '+index+')';name=original.name.slice(0,80-suffix.length)+suffix;index++;}while(byName.has(fold(name)));
  reserve({name,keywords:[...original.keywords]});mapping.set(key,name);changes.push({type:'rename',from:original.name,to:name});
 }
 const mapLabel=label=>{
  if(typeof label!=='string'||!label.trim()||label.length>80||fold(label)==='all')throw Error('Invalid collection label in transfer.');
  const key=fold(label);if(key==='unfiled')return 'Unfiled';if(mapping.has(key))return mapping.get(key);
  // A label with no incoming rules must not silently adopt different local rules.
  let name=label,index=0;while(byName.has(fold(name))){index++;const suffix=' (imported label'+(index>1?' '+index:'')+')';name=label.slice(0,80-suffix.length)+suffix;}
  reserve({name,keywords:[]});mapping.set(key,name);changes.push({type:'label',from:label,to:name});return name;
 };
 const conversations=validated.conversations.map(entry=>{
  if(!entry?.note||!Array.isArray(entry.note.secondaryCategories))throw Error('Invalid conversation filing in transfer.');
  const note=structuredClone(entry.note);note.category=mapLabel(note.category);note.secondaryCategories=[...new Set(note.secondaryCategories.map(mapLabel))].filter(name=>name!==note.category);
  return {...entry,note};
 });
 return {collections,conversations,changes,warnings:structuredClone(validated.warnings||[]),previousCollections:JSON.stringify(currentCollections)};
}
