// Per-file Drive access only. The existing folder must also be granted to this
// OAuth app through Google's picker; a folder URL alone does not grant access.
export class DriveBackup {
 constructor({folderId,getToken,request=fetch}){if(!/^[\w-]+$/.test(folderId||''))throw Error('A Google Drive folder ID is required.');this.folderId=folderId;this.getToken=getToken;this.request=request;}
 async call(url,options={}){const token=await this.getToken();const r=await this.request(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});if(!r.ok)throw Error(r.status===401?'Google sign-in needs to be renewed.':r.status===403||r.status===404?'Google has not granted this app access to the selected folder. Complete folder selection first.':`Drive upload failed (${r.status}); the local copy is kept.`);return r;}
 async verifyFolder(){const r=await this.call('https://www.googleapis.com/drive/v3/files/'+this.folderId+'?fields=id,name,mimeType,capabilities(canAddChildren)');const folder=await r.json();if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.name!=='RECORD ME'||!folder.capabilities?.canAddChildren)throw Error('Select the agreed writable RECORD ME folder.');return folder;}
 async upload({name,blob,fileId}){
  // Preallocate and persist fileId before calling this method so a retry cannot
  // create duplicate recordings after a lost upload response.
  if(!/^[\w-]+$/.test(fileId||''))throw Error('A persisted Drive file ID is required.');
  const existing=await this.request('https://www.googleapis.com/drive/v3/files/'+fileId+'?fields=id',{headers:{Authorization:'Bearer '+await this.getToken()}});
  if(!existing.ok&&existing.status!==404)throw Error('Unable to check the previous upload; retry later.');
  const update=existing.ok;
  const init=await this.call('https://www.googleapis.com/upload/drive/v3/files'+(update?'/'+fileId:'')+'?uploadType=resumable',{method:update?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':blob.type||'application/octet-stream','X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(update?{name}:{id:fileId,name,parents:[this.folderId]})});
  const location=init.headers.get('Location');if(!location||new URL(location).origin!=='https://www.googleapis.com')throw Error('Drive returned an unexpected upload destination.');
  if(!blob.size)throw Error('Cannot back up an empty audio file.');
  const chunk=4*1024*1024;for(let start=0;start<blob.size;start+=chunk){const end=Math.min(start+chunk,blob.size);const response=await this.request(location,{method:'PUT',headers:{Authorization:'Bearer '+await this.getToken(),'Content-Range':`bytes ${start}-${end-1}/${blob.size}`},body:blob.slice(start,end)});if((end===blob.size&&!response.ok)||(response.status!==308&&!response.ok))throw Error('Upload interrupted. Your local recording is safe and will be retried.');}
  return fileId;
 }
 async allocate(){const r=await this.call('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');return (await r.json()).ids[0];}
}
