import {defaults} from './collections.js';
import {COLLECTION_PENDING} from './collection-update.js';
import {planLibraryImport} from './library-import-plan.js';
export const IMPORT_PENDING='recordit-library-restore';
const currentRules=storage=>JSON.parse(storage.getItem('collections')??JSON.stringify(defaults));
function readJournal(storage){
 const raw=storage.getItem(IMPORT_PENDING);if(raw===null)return null;
 try{const j=JSON.parse(raw);if(j.version!==1||typeof j.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(j.id)||typeof j.digest!=='string'||!/^[a-f0-9]{64}$/.test(j.digest)||typeof j.before!=='string'||typeof j.after!=='string'||!Array.isArray(JSON.parse(j.before))||!Array.isArray(JSON.parse(j.after)))throw Error();return j;}
 catch{throw Error('The pending import record cannot be read safely. It has been kept.');}
}
export function prepareLibraryRestore(validated,{storage=globalThis.localStorage}={}){
 if(typeof validated.digest!=='string'||!/^[a-f0-9]{64}$/.test(validated.digest))throw Error('This transfer has not been fingerprinted. Preview its folder again.');
 if(storage.getItem(COLLECTION_PENDING)!==null)throw Error('Resume the interrupted collection update before importing.');
 const journal=readJournal(storage),current=JSON.stringify(currentRules(storage));
 if(journal&&(journal.digest!==validated.digest||![journal.before,journal.after].includes(current)))throw Error('An import is pending. Choose its original transfer folder; changed collection rules are kept.');
 const plan=planLibraryImport(validated,journal?JSON.parse(journal.before):currentRules(storage));
 if(journal&&JSON.stringify(plan.collections)!==journal.after)throw Error('The pending import no longer matches this preview. Nothing was restored.');
 return {...plan,digest:validated.digest,importId:journal?.id||crypto.randomUUID(),resuming:!!journal};
}
export async function restorePlannedLibrary(plan,restore,{storage=globalThis.localStorage,locks=globalThis.navigator?.locks}={}){
 if(!locks?.request)throw Error('Safe library restore needs Web Locks. Use Chrome or Edge.');
 return locks.request('recordit-collection-rules',{mode:'exclusive'},async()=>{
  if(storage.getItem(COLLECTION_PENDING)!==null)throw Error('Resume the interrupted collection update first.');
  const existing=readJournal(storage),current=JSON.stringify(currentRules(storage)),after=JSON.stringify(plan.collections);
  const journal={version:1,id:plan.importId,digest:plan.digest,before:plan.previousCollections,after};
  if(existing?(existing.id!==journal.id||existing.digest!==journal.digest||existing.before!==journal.before||existing.after!==after||![existing.before,after].includes(current)):current!==journal.before)throw Error('The library or collections changed. Preview the transfer again.');
  const raw=JSON.stringify(journal);storage.setItem(IMPORT_PENDING,raw);
  storage.setItem('collections',after);
  // Leave the journal on every failure, including cleanup after DB commit.
  // Retrying uses the same receipt and cannot add duplicate conversations.
  const restored=await restore(plan.conversations,{importId:journal.id,importDigest:journal.digest});
  if(storage.getItem(IMPORT_PENDING)!==raw||JSON.stringify(currentRules(storage))!==after)throw Error('Collection state changed during import. The import remains held for review.');
  storage.removeItem(IMPORT_PENDING);return restored;
 });
}
