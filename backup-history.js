import {sourceKey,sourcesFor} from './summaries.js';
import {validateFollowUpResult} from './follow-up-result.js';

// Restore readable history without granting imported evidence unverified live links.
export function restoreHistory(backup,note){
 const sources=sourcesFor(note),key=sourceKey(note),byId=new Map(sources.map(s=>[s.id,s]));
 const text=(value,max,optional=false)=>{if(optional&&value==null)return '';if(typeof value!=='string'||value.length>max)throw Error('This backup contains invalid or oversized answer text.');return value;};
 const array=(value,max)=>{if(!Array.isArray(value)||value.length>max)throw Error('This backup contains invalid or oversized answer history.');return value;};
 function restore(item){
  if(!item||typeof item!=='object')throw Error('This backup contains an invalid saved answer.');
  const result={question:text(item.question,20000),answer:text(item.answer,200000,true)};
  if(item.sessionId!==undefined){
   if(typeof item.sessionId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(item.sessionId))throw Error('This backup contains an invalid chat session.');
   result.sessionId=item.sessionId;
  }
  if(item.kind==='clarification'){
   if(result.answer.trim()||(item.bullets!=null&&(!Array.isArray(item.bullets)||item.bullets.length))||(item.sources!=null&&(!Array.isArray(item.sources)||item.sources.length)))throw Error('This backup mixes clarification with answer evidence.');
   const validated=validateFollowUpResult({answers:[],clarification:item.clarification},[]);
   return {...result,kind:'clarification',clarification:validated.clarification,...(item.contextSourceKey===key?{contextSourceKey:key}:{})};
  }
  if(item.clarification!==undefined)throw Error('This backup contains an untyped clarification.');
  let verified=item.sourceKey===key,ids=new Set();
  if(item.bullets!=null)result.bullets=array(item.bullets,200).map(b=>{
   if(!b||typeof b!=='object')throw Error('This backup contains an invalid answer bullet.');
   const bullet={text:text(b.text,10000),evidence:array(b.evidence,200).map(e=>{
    if(!e||typeof e!=='object')throw Error('This backup contains invalid answer evidence.');
    const quote=text(e.quote,10000),source=byId.get(e.id);
    if(!Number.isInteger(e.id)||!quote.trim()||!source?.text.includes(quote))verified=false;
    ids.add(e.id);return {id:Number.isInteger(e.id)?e.id:0,quote};
   })};
   if(!bullet.evidence.length)verified=false;
   return bullet;
  });
  const oldSources=item.sources==null?[]:array(item.sources,1000).map(s=>{
   if(!s||typeof s!=='object')throw Error('This backup contains invalid source text.');
   const value={id:Number.isInteger(s.id)?s.id:0,text:text(s.text,10000)};
   if(!byId.has(value.id)||byId.get(value.id).text!==value.text)verified=false;
   ids.add(value.id);return value;
  });
  if(verified){result.sourceKey=key;result.sources=sources.filter(s=>ids.has(s.id));}
  else result.sources=oldSources;
  for(const name of ['elapsedMs','parts','rejected','created'])if(Number.isFinite(item[name])&&item[name]>=0)result[name]=item[name];
  if(typeof item.model==='string')result.model=item.model.slice(0,200);
  return result;
 }
 return Object.fromEntries(['chats','removedAnswers'].map(name=>[name,backup[name]===undefined?[]:array(backup[name],1000).map(restore)]));
}
