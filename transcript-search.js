export function findWords(sources,query){
 const term=query.trim();if(!term)return [];
 const pattern=new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
 return sources.flatMap(source=>Array.from(source.text.matchAll(pattern),match=>({
   ...source,position:match.index,length:match[0].length,
   preview:source.text.slice(Math.max(0,match.index-60),match.index+match[0].length+100)
 })));
}
