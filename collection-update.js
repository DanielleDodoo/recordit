import {defaults} from './collections.js';
export const COLLECTION_PENDING='recordit-collection-update';

// localStorage and IndexedDB cannot share a transaction. Keep an interruption
// marker and refuse subsequent changes rather than silently claiming atomicity.
export async function updateCollectionRules(next,expected,refile,{storage=globalThis.localStorage,locks=globalThis.navigator?.locks,operation={}}={}){
 if(!locks?.request)throw Error('Safe collection editing needs Web Locks. Use Chrome or Edge.');
 const proposed=JSON.stringify(next),previous=JSON.stringify(expected);
 return locks.request('recordit-collection-rules',{mode:'exclusive'},async()=>{
  if(storage.getItem('recordit-library-restore')!==null)throw Error('Finish the pending library import before changing collections.');
  if(storage.getItem(COLLECTION_PENDING)!==null)throw Error('An earlier collection update was interrupted. Collection changes are held for recovery.');
  const raw=storage.getItem('collections');let current;
  try{current=raw===null?defaults:JSON.parse(raw);}catch{throw Error('Stored collection rules cannot be read.');}
  if(JSON.stringify(current)!==previous)throw Error('Collections changed in another window. Reopen Manage collections and try again.');
  storage.setItem(COLLECTION_PENDING,JSON.stringify({version:1,before:raw,after:proposed,operation}));
  try{storage.setItem('collections',proposed);}catch(error){storage.removeItem(COLLECTION_PENDING);throw error;}
  try{await refile(JSON.parse(proposed));}
  catch(error){
   // Preserve the marker if an older app or another writer ignored our lock.
   if(storage.getItem('collections')!==proposed)throw Error('Collection rules changed during refiling. Changes are held for recovery.');
   if(raw===null)storage.removeItem('collections');else storage.setItem('collections',raw);
   storage.removeItem(COLLECTION_PENDING);throw error;
  }
  if(storage.getItem('collections')!==proposed)throw Error('Collection rules changed during refiling. Changes are held for recovery.');
  storage.removeItem(COLLECTION_PENDING);
 });
}

function validateRules(rules){
 if(!Array.isArray(rules)||rules.length>200)throw Error('Invalid recovery rules.');
 const names=new Set();for(const r of rules){
  if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!Array.isArray(r.keywords)||r.keywords.length>200||r.keywords.some(k=>typeof k!=='string'||!k.trim()||k.length>200))throw Error('Invalid recovery rules.');
  const name=r.name.normalize('NFKC').trim().toLowerCase();if(names.has(name)||['all','unfiled'].includes(name))throw Error('Ambiguous recovery rules.');names.add(name);
 }
}

export async function recoverCollectionUpdate(refile,{storage=globalThis.localStorage,locks=globalThis.navigator?.locks}={}){
 if(!locks?.request)throw Error('Safe collection recovery needs Web Locks.');
 return locks.request('recordit-collection-rules',{mode:'exclusive'},async()=>{
  if(storage.getItem('recordit-library-restore')!==null)throw Error('Finish the pending library import before changing collections.');
  const raw=storage.getItem(COLLECTION_PENDING);if(raw===null)return false;
  let journal,next,before;
  try{
   journal=JSON.parse(raw);if(journal.version!==1||typeof journal.after!=='string'||!(journal.before===null||typeof journal.before==='string'))throw Error();
   next=JSON.parse(journal.after);before=journal.before===null?defaults:JSON.parse(journal.before);validateRules(next);validateRules(before);
   const op=journal.operation;if(!op||typeof op!=='object'||Array.isArray(op)||Object.keys(op).some(k=>!['rename','remove'].includes(k))||op.rename&&op.remove)throw Error();
   if('rename' in op&&(!op.rename||typeof op.rename!=='object'||Object.keys(op.rename).sort().join(',')!=='from,to'||!before.some(r=>r.name===op.rename.from)||!next.some(r=>r.name===op.rename.to)))throw Error();
   if(op.rename&&op.rename.from!==op.rename.to&&(next.some(r=>r.name===op.rename.from)||before.some(r=>r.name===op.rename.to)))throw Error();
   if('remove' in op&&(typeof op.remove!=='string'||!before.some(r=>r.name===op.remove)||next.some(r=>r.name===op.remove)))throw Error();
   if(before.some(r=>!next.some(n=>n.name===r.name)&&r.name!==(op.rename?.from||op.remove)))throw Error();
  }catch{throw Error('This interrupted update cannot be safely replayed. Its recovery record has been kept.');}
  const current=storage.getItem('collections');
  if(current!==journal.before&&current!==journal.after)throw Error('Collections changed since the interruption. Recovery has not changed them.');
  storage.setItem('collections',journal.after);
  // Failure leaves the marker intact. A retry repeats only filing metadata on
  // the latest records; original transcripts and recordings are never replayed.
  await refile(next,journal.operation);
  if(storage.getItem('collections')!==journal.after||storage.getItem(COLLECTION_PENDING)!==raw)throw Error('Collection state changed during recovery. Recovery remains held.');
  storage.removeItem(COLLECTION_PENDING);return true;
 });
}
