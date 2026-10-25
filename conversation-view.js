const byId=id=>document.getElementById(id);
let active='summary',origin=null,readingOrigin=null;
const positions={summary:0,transcript:0};
let restoreFrame;
function restorePosition(y){
  cancelAnimationFrame(restoreFrame);
  window.scrollTo({top:y,left:0,behavior:'instant'});
  restoreFrame=requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:'instant'}));
}
function selectView(name){
  cancelAnimationFrame(restoreFrame);
  positions[active]=window.scrollY;
  active=name;
  for(const view of ['summary','transcript']){
    byId(view+'-panel').hidden=view!==name;
    byId(view+'-tab').setAttribute('aria-selected',String(view===name));
    byId(view+'-tab').tabIndex=view===name?0:-1;
  }
}
export function resetConversationView(){
  selectView('summary');positions.summary=positions.transcript=0;origin=null;
  byId('return-source').hidden=true;readingOrigin=null;byId('return-reading').hidden=true;
}
for(const name of ['summary','transcript']){
  const tab=byId(name+'-tab');
  tab.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();tab.focus({preventScroll:true});};
  tab.onclick=()=>{if(name===active)return;selectView(name);restorePosition(positions[name]);};
  tab.onkeydown=e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    e.preventDefault();const next=e.key==='Home'?'summary':e.key==='End'?'transcript':name==='summary'?'transcript':'summary';
    byId(next+'-tab').click();byId(next+'-tab').focus({preventScroll:true});
  };
}
// Reveal the transcript before the existing citation and word-result handlers run.
byId('detail').addEventListener('click',event=>{
  const link=event.target.closest('[data-source],[data-answer-source],.word-hit,[data-word-nav]');
  if(!link)return;
  if(!link.hasAttribute('data-word-nav')||!origin)origin={element:link,view:active,y:window.scrollY};
  selectView('transcript');byId('return-source').hidden=false;
},true);
byId('return-source').onclick=()=>{
  if(!origin)return;
  byId('return-source').hidden=true;
  selectView(origin.view);restorePosition(origin.y);
  const focusTarget=origin.element.isConnected?origin.element:byId(origin.view+'-tab');
  focusTarget.focus({preventScroll:true});
  byId('return-source').hidden=true;origin=null;
};

byId('open-questions').onclick=()=>{
  cancelAnimationFrame(restoreFrame);
  const anchor=[...byId(active+'-panel').querySelectorAll('.transcript-line, #summary section')].find(el=>el.getBoundingClientRect().bottom>160);
  readingOrigin={view:active,y:window.scrollY,anchor,offset:anchor?.getBoundingClientRect().top};
  byId('return-reading').hidden=false;
  byId('return-reading').scrollIntoView({block:'start',behavior:'instant'});
  byId('find-words').focus({preventScroll:true});
};
byId('return-reading').onclick=()=>{
  if(!readingOrigin)return;
  const saved=readingOrigin;readingOrigin=null;
  byId('return-reading').hidden=true;
  selectView(saved.view);
  const y=saved.anchor?.isConnected?window.scrollY+saved.anchor.getBoundingClientRect().top-saved.offset:saved.y;
  restorePosition(y);
  byId(saved.view+'-tab').focus({preventScroll:true});
};
