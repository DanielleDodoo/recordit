export const highlightMatches=(h,s)=>h.sourceId===s.id&&h.sourceText===s.text;
export function restoreHighlights(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>1000)throw Error('Invalid highlights.');
 const seen=new Set();return value.map(h=>{
  if(!h||typeof h.id!=='string'||!h.id||h.id.length>100||seen.has(h.id)||!Number.isInteger(h.sourceId)||h.sourceId<1||typeof h.sourceText!=='string'||!h.sourceText.trim()||h.sourceText.length>2500||!Number.isInteger(h.start)||!Number.isInteger(h.end)||h.start<0||h.end<=h.start||h.end>h.sourceText.length)throw Error('Invalid saved highlight.');
  seen.add(h.id);return {id:h.id,sourceId:h.sourceId,sourceText:h.sourceText,start:h.start,end:h.end};
 });
}
export function addHighlight(list,h){const saved=restoreHighlights(list),next=restoreHighlights([h])[0];if(saved.some(item=>highlightMatches(item,{id:next.sourceId,text:next.sourceText})&&item.start===next.start&&item.end===next.end))return saved;return restoreHighlights([...saved,next]);}
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function highlightHtml(source,highlights,from=0,to=source.text.length){
 const ranges=highlights.filter(h=>highlightMatches(h,source)&&h.end>from&&h.start<to).map(h=>[Math.max(from,h.start),Math.min(to,h.end)]).sort((a,b)=>a[0]-b[0]);
 const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]);}
 let html='',at=from;for(const [start,end] of merged){html+=escape(source.text.slice(at,start))+'<span class="saved-highlight">'+escape(source.text.slice(start,end))+'</span>';at=end;}return html+escape(source.text.slice(at,to));
}
