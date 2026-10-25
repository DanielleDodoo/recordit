// Send to laptop, straight into Google Drive. The phone signs in with Google (recordit may only see the files it
// creates itself), uploads the recording and its highlights and notes to the "recordit from phone" folder, and the
// laptop, which sees that folder through Google Drive, transcribes them from there.
export const GOOGLE_CLIENT_ID='718610075640-75qf0tmeudq3do8cbdetg6qk6i6bta87.apps.googleusercontent.com';
export const PHONE_FOLDER='recordit from phone';
const SCOPE='https://www.googleapis.com/auth/drive.file',FOLDER_TYPE='application/vnd.google-apps.folder';
const API='https://www.googleapis.com/drive/v3/files',UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const CHUNK=8*1024*1024; // a multiple of 256 KB, as Drive requires for all but the last piece

// Google's sign-in script is loaded ahead of time: the sign-in window must open straight from the tap.
export function loadGoogleSignIn(doc=document){
 if(globalThis.google?.accounts?.oauth2||doc.getElementById('google-sign-in'))return;
 const script=doc.createElement('script');script.id='google-sign-in';script.src='https://accounts.google.com/gsi/client';script.async=true;
 doc.head.append(script);
}

let token=null,expires=0,pending=null;
// Call this directly in the tap handler, before anything is awaited, so the Google window is allowed to open.
export function driveToken(google=globalThis.google,now=Date.now){
 if(token&&now()<expires-60_000)return Promise.resolve(token);
 if(!google?.accounts?.oauth2)return Promise.reject(Error('Google sign-in is still loading. Wait a moment, then tap Send to laptop again.'));
 return pending??=new Promise((resolve,reject)=>{
  const fail=message=>{pending=null;reject(Error(message));};
  const client=google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:SCOPE,
   callback:reply=>{
    if(reply.error||!reply.access_token)return fail(reply.error==='access_denied'?'Google access wasn’t allowed, so nothing was sent.':'Google sign-in didn’t finish, so nothing was sent.');
    if(!google.accounts.oauth2.hasGrantedAllScopes(reply,SCOPE))return fail('recordit needs permission to save to your Google Drive. Tap Send to laptop again and tick the Drive box.');
    token=reply.access_token;expires=now()+Number(reply.expires_in||3600)*1000;pending=null;resolve(token);
   },
   error_callback:error=>fail(error?.type==='popup_closed'?'The Google window was closed before it finished, so nothing was sent.':error?.type==='popup_failed_to_open'?'The Google window couldn’t open. Allow pop-ups for this page, then try again.':'Google sign-in didn’t finish, so nothing was sent.')});
  client.requestAccessToken({prompt:''});
 });
}
export function forgetDriveToken(){token=null;expires=0;}

async function call(url,options,{fetchImpl=fetch,token:bearer}){
 const response=await fetchImpl(url,{...options,headers:{...options?.headers,Authorization:'Bearer '+bearer}});
 if(response.status===401){forgetDriveToken();throw Error('Google sign-in has expired. Tap Send to laptop again.');}
 if(!response.ok&&response.status!==308)throw Error(`Google Drive didn’t accept the upload (${response.status}). Your recording is still on this phone; try again.`);
 return response;
}

// The app's own folder: found again by name (recordit only ever sees folders it made), or made the first time.
export async function phoneFolder(context,storage=globalThis.localStorage){
 let remembered=null;try{remembered=storage?.getItem('recordit.driveFolder');}catch{}
 if(remembered&&/^[\w-]+$/.test(remembered)){
  const response=await (context.fetchImpl||fetch)(API+'/'+remembered+'?fields=id,trashed',{headers:{Authorization:'Bearer '+context.token}});
  if(response.ok&&!(await response.json()).trashed)return remembered;
 }
 const q=encodeURIComponent(`name='${PHONE_FOLDER}' and mimeType='${FOLDER_TYPE}' and trashed=false`);
 const found=await (await call(`${API}?q=${q}&fields=files(id)&spaces=drive`,{},context)).json();
 const id=found.files?.[0]?.id||(await (await call(API+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:PHONE_FOLDER,mimeType:FOLDER_TYPE})},context)).json()).id;
 try{storage?.setItem('recordit.driveFolder',id);}catch{}
 return id;
}

// A resumable upload, in pieces, so a long recording on a phone connection gets there.
export async function uploadFile(file,folder,context,onProgress=()=>{}){
 const start=await call(UPLOAD+'?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':file.type||'application/octet-stream','X-Upload-Content-Length':String(file.size)},body:JSON.stringify({name:file.name,parents:[folder]})},context);
 const location=start.headers.get('Location');
 if(!location||new URL(location).origin!=='https://www.googleapis.com')throw Error('Google Drive didn’t start the upload. Your recording is still on this phone; try again.');
 if(!file.size)throw Error('This recording is empty, so there is nothing to send.');
 for(let from=0;from<file.size;from+=CHUNK){
  const to=Math.min(from+CHUNK,file.size);
  const response=await call(location,{method:'PUT',headers:{'Content-Range':`bytes ${from}-${to-1}/${file.size}`},body:file.slice(from,to)},context);
  if(to===file.size&&!response.ok)throw Error('The upload didn’t finish. Your recording is still on this phone; try again.');
  onProgress(to/file.size);
 }
}

// Sends the recording, then its highlights and notes, which the laptop pairs with it by name.
export async function sendToDrive(files,{token:bearer,fetchImpl,storage,onProgress=()=>{}}){
 const context={token:bearer,fetchImpl},folder=await phoneFolder(context,storage);
 const total=files.reduce((sum,f)=>sum+f.size,0)||1;let done=0;
 for(const file of files){await uploadFile(file,folder,context,share=>onProgress((done+share*file.size)/total));done+=file.size;}
 onProgress(1);
}
