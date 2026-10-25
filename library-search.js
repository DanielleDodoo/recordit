export function searchLibrary(notes,{query='',field='all',collection='All',withinCollection=false}={}){
 const needle=query.trim().normalize('NFKC').toLowerCase();
 return notes.filter(note=>{
  if((!needle||withinCollection)&&collection!=='All'&&note.category!==collection&&!(note.secondaryCategories||[]).includes(collection))return false;
  const tags=[...(note.tags||[]),note.category||'',...(note.secondaryCategories||[])].join(' ');
  const text=field==='title'?note.title:field==='transcript'?note.transcript:field==='tags'?tags:[note.title,note.transcript,tags].join(' ');
  return String(text||'').normalize('NFKC').toLowerCase().includes(needle);
 });
}

export function sortLibrary(notes,order='newest'){
 const compare=(a,b)=>a<b?-1:a>b?1:0;
 const title=n=>String(n.title||'').normalize('NFKC').toLowerCase();
 const date=n=>Number.isFinite(n.created)?n.created:0;
 return [...notes].sort((a,b)=>{
  const primary=order==='title-asc'?compare(title(a),title(b)):order==='title-desc'?compare(title(b),title(a)):order==='oldest'?date(a)-date(b):date(b)-date(a);
  return primary||compare(String(a.id),String(b.id));
 });
}
