import {speakerMatches} from './speakers.js';
import {highlightMatches} from './highlights.js';

// Names come only from manual labels whose original passage still matches.
export function speakerGroups(sources, labels=[]){
 const bySource=new Map(sources.map(source=>[source.id,labels.find(label=>speakerMatches(label,source))?.name||null]));
 const names=[...new Set([...bySource.values()].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
 return {bySource,names};
}

export function bindSpeakerFilter({select,status,view,detail,highlightedOnly}){
 let noteId=null,groups={bySource:new Map(),names:[]},highlighted=new Set();
 function apply(){
  let shown=0,total=0;
  for(const row of view.querySelectorAll('.transcript-line')){
   const name=groups.bySource.get(Number(row.id.slice(7))),value=select.value;
   row.hidden=value==='unlabelled'?Boolean(name):value.startsWith('name:')?name!==value.slice(5):false;
   if(highlightedOnly?.checked&&!highlighted.has(Number(row.id.slice(7))))row.hidden=true;
   total++;if(!row.hidden)shown++;
  }
  // A paragraph (one person's turn) is hidden only when every line in it is.
  for(const turn of view.querySelectorAll('.turn'))if(turn.querySelectorAll)turn.hidden=![...turn.querySelectorAll('.transcript-line')].some(row=>!row.hidden);
  const filtered=select.value!=='all'||highlightedOnly?.checked;
  status.textContent=!filtered?'':`${shown} of ${total} passages${shown?'':' · No passages match these filters'} · Find searches the whole transcript`;
 }
 function clear(){select.value='all';if(highlightedOnly)highlightedOnly.checked=false;apply();}
 select.onchange=apply;
 if(highlightedOnly)highlightedOnly.onchange=apply;
 detail.addEventListener('click',event=>{
  if(event.target.closest('[data-source],[data-answer-source],[data-listen-time],.word-hit,[data-word-nav],[data-bookmark-jump],[data-comment-jump],[data-highlight-jump]'))clear();
 },true);
 return function update(id,sources,labels,highlights=[]){
  const previous=id===noteId?select.value:'all';if(id!==noteId&&highlightedOnly)highlightedOnly.checked=false;
  noteId=id;groups=speakerGroups(sources,labels);
  highlighted=new Set(sources.filter(source=>highlights.some(h=>highlightMatches(h,source))).map(source=>source.id));
  select.replaceChildren();
  for(const [value,text] of [['all','All speakers'],['unlabelled','Unlabelled'],...groups.names.map(name=>['name:'+name,name])]){
   const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
  }
  select.value=previous==='unlabelled'||previous==='all'||groups.names.includes(previous.slice(5))?previous:'all';
  select.disabled=!sources.length;apply();
 };
}
