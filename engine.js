// Requests to this laptop's recordit engine. The access token comes from /api/status and changes whenever
// the engine restarts, so a refused request fetches a fresh token once and tries again.
let token=null;
export async function engineFetch(path,options={},{request=fetch}={}){
 for(let attempt=0;attempt<2;attempt++){
  if(!token){
   const status=await request('/api/status',{cache:'no-store'}).catch(()=>null);
   if(!status?.ok)throw Error('The recordit engine on this laptop is not running. Start recordit, then reload this page.');
   token=(await status.json()).token;
  }
  const response=await request(path,{cache:'no-store',...options,headers:{...options.headers,'X-Record-Me-Token':token}});
  if(response.status!==403)return response;
  token=null;
 }
 throw Error('The recordit engine refused this request. Reload the page.');
}
export async function failed(response,fallback){throw Object.assign(Error((await response.text().catch(()=>''))||fallback),{status:response.status});}
