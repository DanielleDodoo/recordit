import {sourceKey} from './summaries.js';

export function answerCopyText(answer,note){
 if(answer.kind==='clarification')return [answer.question,'Clarification requested',answer.clarification].filter(Boolean).join('\n\n');
 const current=Boolean(answer.sourceKey)&&answer.sourceKey===sourceKey(note);
 const warning=current?'':'References are not verified against the current transcript. Ask again for current evidence.';
 return [answer.question,warning,answer.answer,
  ...(answer.bullets||[]).map(b=>b.text+' '+(b.evidence||[]).map(e=>'['+e.id+']').join(' ')),
  ...(answer.sources||[]).map(s=>'['+s.id+'] '+s.text)
 ].filter(Boolean).join('\n\n');
}
