export function restoreBookmarks(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>1000)throw Error('Invalid bookmark list.');
 const seen=new Set();
 return value.map(item=>{
  if(!item||!Number.isInteger(item.id)||item.id<1||typeof item.text!=='string'||!item.text.trim()||item.text.length>2500)throw Error('Invalid saved bookmark.');
  const key=JSON.stringify([item.id,item.text]);if(seen.has(key))throw Error('Duplicate saved bookmark.');seen.add(key);
  return {id:item.id,text:item.text};
 });
}
export const bookmarkMatches=(bookmark,source)=>bookmark.id===source.id&&bookmark.text===source.text;
export function toggleBookmark(bookmarks,source){
 const saved=restoreBookmarks(bookmarks),index=saved.findIndex(b=>bookmarkMatches(b,source));
 if(index>=0){saved.splice(index,1);return saved;}
 return restoreBookmarks([...saved,{id:source.id,text:source.text}]);
}
