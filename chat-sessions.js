export const ORIGINAL_SESSION='original';
export function answerSession(answer){return answer.sessionId||ORIGINAL_SESSION;}
export function initialSession(note){
 const last=note.chats?.at(-1)||note.removedAnswers?.at(-1);
 return last?answerSession(last):ORIGINAL_SESSION;
}
export function sessionEntries(note,active=ORIGINAL_SESSION,emptySessions=[]){
 const entries=new Map([[ORIGINAL_SESSION,'Original chat']]);
 for(const answer of [...(note.chats||[]),...(note.removedAnswers||[])]){
  const id=answerSession(answer);
  if(!entries.has(id))entries.set(id,answer.question?.trim().slice(0,60)||'Untitled chat');
 }
 for(const id of [...emptySessions,active])if(!entries.has(id))entries.set(id,'New chat');
 return [...entries].map(([id,label])=>({id,label}));
}
export function sessionAnswers(note,active){
 return (note.chats||[]).map((answer,index)=>({answer,index})).filter(({answer})=>answerSession(answer)===active);
}
export function removedSessionIndex(note,active){
 const removed=note.removedAnswers||[];
 for(let index=removed.length-1;index>=0;index--)if(answerSession(removed[index])===active)return index;
 return -1;
}
