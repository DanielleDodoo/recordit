export function restoreComments(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>1000)throw Error('Invalid comment list.');
 const seen=new Set();
 return value.map(c=>{
  if(!c||typeof c.id!=='string'||!c.id||c.id.length>100||seen.has(c.id)||!Number.isInteger(c.sourceId)||c.sourceId<1||typeof c.sourceText!=='string'||!c.sourceText.trim()||c.sourceText.length>2500||typeof c.text!=='string'||!c.text.trim()||c.text.length>2000)throw Error('Invalid saved comment.');
  seen.add(c.id);return {id:c.id,sourceId:c.sourceId,sourceText:c.sourceText,text:c.text};
 });
}
export const commentMatches=(c,s)=>c.sourceId===s.id&&c.sourceText===s.text;
export function saveComment(comments,comment,expected=null){
 const list=restoreComments(comments),next=restoreComments([comment])[0],index=list.findIndex(c=>c.id===next.id);
 if(expected===null){if(index>=0)throw Error('This comment already exists. Reopen it.');list.push(next);}
 else {if(index<0||list[index].text!==expected||!commentMatches(list[index],{id:next.sourceId,text:next.sourceText}))throw Error('This comment changed. Reopen it before editing.');list[index]=next;}
 return restoreComments(list);
}
export function removeComment(comments,id,expectedText){
 const list=restoreComments(comments),index=list.findIndex(c=>c.id===id);
 if(index<0||list[index].text!==expectedText)throw Error('This comment changed. Reopen it before removing.');
 list.splice(index,1);return list;
}
