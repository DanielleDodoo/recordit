// Drafts live only in this window; they are not saved into recordings or backups.
export function createQuestionDrafts(field){
 const drafts=new Map();let active=null;
 return {
  select(id){
   if(active!==null)drafts.set(active,field.value);
   active=id;field.value=id===null?'':drafts.get(id)||'';
  },
  complete(id,submitted){
   if(active===id){if(field.value===submitted){field.value='';drafts.delete(id);}}
   else if(drafts.get(id)===submitted)drafts.delete(id);
  },
  forget(id){drafts.delete(id);if(active===id){active=null;field.value='';}}
 };
}
