// A conversation starts with a placeholder title (when it was recorded) and is renamed from what was said:
// the first main theme of its offline summary. Once Danielle renames it herself it is never changed again.
export const placeholderTitle=(time,stamp=new Date(time).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))=>'Recording · '+stamp;

export function titleFromSummary(summary,limit=70){
 const theme=summary?.themes?.find(t=>typeof t?.text==='string'&&t.text.trim());
 if(!theme)return null;
 let text=theme.text.trim().replace(/\s+/g,' ').replace(/\.+$/,'');
 if(text.length>limit)text=text.slice(0,limit).replace(/\s+\S*$/,'')+'…';
 return text.charAt(0).toUpperCase()+text.slice(1);
}
