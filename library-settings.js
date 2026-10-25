// Choices that belong to the library (collections, backup and sync, and the journals that protect collection
// changes) are kept with it, so every browser and laptop shares them. Per-browser conveniences such as the
// sidebar or microphone mode stay in localStorage. The installed phone app keeps everything on the device.
import {noLaptop} from './mobile.js';
import {engineFetch,failed} from './engine.js';

// The first time a browser meets the library, it brings these choices along if the library has none yet.
const BROUGHT_ALONG=['collections','backupEnabled','recordit.syncIgnored'];

export async function createLibraryStorage({fetchJson,patch,local=globalThis.localStorage,onError=()=>{}}){
 let values=await fetchJson();
 const arrival={};
 for(const key of BROUGHT_ALONG){
  let mine=null;try{mine=local?.getItem(key)??null;}catch{}
  if(mine===null)continue;
  if(!Object.hasOwn(values,key))arrival[key]=mine;
  else if(key==='recordit.syncIgnored'){
   // Conversations deleted in any browser stay deleted for the whole library.
   try{const merged=[...new Set([...JSON.parse(values[key]),...JSON.parse(mine)])];if(merged.length!==JSON.parse(values[key]).length)arrival[key]=JSON.stringify(merged);}catch{}
  }
 }
 if(Object.keys(arrival).length)values=await patch(arrival);
 let queue=Promise.resolve();
 const persist=change=>{queue=queue.then(()=>patch(change)).catch(onError);return queue;};
 return {
  getItem:key=>Object.hasOwn(values,key)?values[key]:null,
  setItem(key,value){values={...values,[key]:String(value)};persist({[key]:String(value)});},
  removeItem(key){const {[key]:gone,...rest}=values;values=rest;persist({[key]:null});},
  flush:()=>queue
 };
}

async function fromEngine(){
 const read=async()=>{const r=await engineFetch('/api/library/settings');if(!r.ok)await failed(r,'Library settings are unavailable.');return r.json();};
 const patch=async change=>{const r=await engineFetch('/api/library/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(change)});if(!r.ok)await failed(r,'Could not save library settings.');return r.json();};
 try{return await createLibraryStorage({fetchJson:read,patch,onError:error=>dispatchEvent(new CustomEvent('library-settings-error',{detail:error}))});}
 catch{
  // Without the engine nothing else in the library works either; the app reports that. Fall back quietly.
  return globalThis.localStorage;
 }
}
export const libraryStorage=noLaptop?globalThis.localStorage:await fromEngine();
