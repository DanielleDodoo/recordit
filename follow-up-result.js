import {validateAnswer} from './questions.js';

export const CLARIFICATION_RULE='First resolve references such as it, that, the change or the second one using the prior chat. If a singular reference has two or more plausible referents and the user has not selected one, you MUST ask which one, even if you could list correct answers for every possibility. Listing every possible answer is not clarification. If there is exactly one clear referent, answer normally. If the current question has an ambiguous reference, return {"answers":[],"clarification":"a short question asking which topic or item the user means"}. Do not mix clarification with answer claims. Otherwise use the normal answers schema. Clarification is a question to the user, not a transcript fact; do not attach source IDs to it.';

// Separate from the existing answer validator until all callers can render and
// persist clarification without treating it as a supported transcript answer.
export function validateFollowUpResult(raw,sources){
 let value=raw;
 if(typeof value==='string'){
  const start=value.indexOf('{'),end=value.lastIndexOf('}');
  if(start<0||end<start)throw Error('The follow-up response was incomplete.');
  value=JSON.parse(value.slice(start,end+1));
 }
 if(value&&Object.hasOwn(value,'clarification')){
  if(typeof value.clarification!=='string'||!value.clarification.trim()||value.clarification.trim().length>300||!Array.isArray(value.answers)||value.answers.length||Object.keys(value).some(key=>!['answers','clarification'].includes(key)))throw Error('The clarification response was invalid.');
  return {kind:'clarification',clarification:value.clarification.trim(),answers:[],rejected:0};
 }
 return {kind:'answer',...validateAnswer(value,sources)};
}

