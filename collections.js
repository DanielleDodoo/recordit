export const defaults=[{name:'Ronnie',keywords:['Ronnie','Reety Mini','Reachy Mini']},{name:'AI',keywords:['AI','artificial intelligence','machine learning','language model','LLM','neural network']},{name:'Consciousness',keywords:['consciousness','conscious','sentience','sentient','self-awareness','qualia']},{name:'Finance',keywords:['finance','financial','financial sovereignty','money','banking','bitcoin','investment']},{name:'Personal',keywords:[]}];
export function loadCollections(storage=globalThis.localStorage){try{const v=JSON.parse(storage.getItem('collections'));if(Array.isArray(v)&&v.every(c=>typeof c.name==='string'&&Array.isArray(c.keywords)))return v;}catch{}return structuredClone(defaults);}
export function saveCollections(value,storage=globalThis.localStorage){storage.setItem('collections',JSON.stringify(value));}

// Restore foundation; not yet used by the editor. Every writer must adopt this
// lock before cross-window protection can be claimed for the application.
export async function saveCollectionsGuarded(value,expected,{storage=globalThis.localStorage,locks=globalThis.navigator?.locks}={}){
 if(!locks?.request)throw Error('Safe collection editing needs Web Locks.');
 if(!Array.isArray(value)||!Array.isArray(expected))throw Error('Invalid collection update.');
 const next=JSON.stringify(value),previous=JSON.stringify(expected);
 return locks.request('recordit-collection-rules',{mode:'exclusive'},()=>{
  const raw=storage.getItem('collections');let current;
  if(raw===null)current=defaults;
  else{try{current=JSON.parse(raw);}catch{throw Error('Stored collection rules cannot be read. No changes saved.');}}
  if(JSON.stringify(current)!==previous)throw Error('Collections changed in another window. Reopen Manage collections and try again.');
  storage.setItem('collections',next);
 });
}
