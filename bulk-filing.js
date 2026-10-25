import {filingPatch} from './collection-filing.js';
const fields=['category','collectionManual','secondaryCategories','collectionReason'];
export const filingSnapshot=note=>Object.fromEntries(fields.filter(key=>Object.hasOwn(note,key)).map(key=>[key,structuredClone(note[key])]));
const same=(a,b)=>fields.every(key=>Object.hasOwn(a,key)===Object.hasOwn(b,key)&&JSON.stringify(a[key])===JSON.stringify(b[key]));
export function bulkFilingPlan(notes,ids,target,rules,receipt=null){
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw Error('Select between 1 and 100 different conversations.');
 if(receipt&&JSON.stringify(rules)!==receipt.rulesKey)throw Error('Collection rules changed. This batch can no longer be undone.');
 if(!receipt&&target!=='Unfiled'&&!rules.some(rule=>rule.name===target))throw Error('This collection no longer exists. Choose it again.');
 const entries=ids.map(id=>{
  const note=notes.find(n=>n.id===id);if(!note||note.recording)throw Error('A selected conversation is missing or still recording. No conversations were changed.');
  const before=filingSnapshot(note);
  if(receipt){const old=receipt.entries.find(e=>e.id===id);if(!old||!same(before,old.after))throw Error('Filing changed since this batch. Undo was not applied to any conversation.');return {id,before,after:old.before};}
  const manual={...note,category:target,collectionManual:true};
  const after=filingSnapshot({...manual,...filingPatch(manual,rules)});
  return {id,before,after};
 });
 return {rulesKey:JSON.stringify(rules),entries};
}
export function applyFilingFields(note,fieldsToSet){
 const next={...note};for(const key of fields){if(Object.hasOwn(fieldsToSet,key))next[key]=structuredClone(fieldsToSet[key]);else delete next[key];}return next;
}
