// One-time move: conversations a browser kept on its own (before the shared laptop library) go into the
// library. The browser's own copy is left untouched as a safety net, and the move is safe to repeat: anything
// already there is recognised and skipped, so an interrupted move simply carries on next time.
import {SYNC_FIELDS} from './library-sync.js';

const MOVED='recordit.movedToLibrary';
const LOCAL_ONLY=['backupId','backedRevision','backedFolder','backedTargetId','audioBacked','audioBackedFolder','audioBackedTargetId'];
const sameContent=(a,b)=>JSON.stringify(SYNC_FIELDS.map(key=>a[key]??null))===JSON.stringify(SYNC_FIELDS.map(key=>b[key]??null));

export async function moveBrowserLibrary({fromBrowser,toLibrary,storage=globalThis.localStorage,newId=()=>crypto.randomUUID()}){
 if(storage.getItem(MOVED))return null;
 const mine=await fromBrowser.list(),library=new Map((await toLibrary.list()).map(note=>[note.id,note]));
 const result={moved:0,already:0,copies:0};
 for(const note of mine){
  const existing=library.get(note.id);
  if(existing&&sameContent(existing,note)){result.already++;continue;}
  const blob=(await fromBrowser.getAudio(note.id))?.blob||null;
  if(!existing){if(await toLibrary.syncAdd(note,blob)){result.moved++;continue;}}
  // The library already has a different version of this conversation: keep both rather than choose.
  const copy={...note,id:newId(),title:note.title+' (from another browser)'};
  for(const key of LOCAL_ONLY)delete copy[key];
  if(await toLibrary.syncAdd(copy,blob))result.copies++;
 }
 storage.setItem(MOVED,new Date().toISOString());
 return result;
}
