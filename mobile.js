// Native APIs are loaded only inside the packaged Capacitor app.
export const isNative = !!globalThis.Capacitor?.isNativePlatform?.();
// recordit opened on a phone from its web address. The laptop engine only ever serves it from this computer
// (127.0.0.1 / localhost), so anywhere else there is no engine: conversations stay on the device and transcripts
// are made on the laptop once a recording is sent there. ?phone forces this for testing on the laptop.
const loopback=/^(127(?:\.\d{1,3}){3}|localhost|\[::1\])$/.test(globalThis.location?.hostname||'');
export const onPhoneWeb=!isNative&&!!globalThis.location&&(!loopback||new URLSearchParams(globalThis.location.search).has('phone'));
export const noLaptop=isNative||onPhoneWeb;
let api;
export async function nativeAPI(){
 if(!isNative)throw Error('This feature requires the installed phone app.');
 if(!api){const {Capacitor,registerPlugin}=await import('./vendor/capacitor.js');api={Capacitor,recorder:registerPlugin(Capacitor.getPlatform()==='android'?'RecordMeRecorder':'CapacitorAudioRecorder'),files:registerPlugin('Filesystem'),login:registerPlugin('SocialLogin')};}
 return api;
}
export async function startNative(id){
 const {recorder}=await nativeAPI();const permission=await recorder.requestPermissions();
 if(permission.recordAudio!=='granted')throw Error('Microphone permission is needed to record.');
 await recorder.startRecording({id,sampleRate:24000,bitRate:64000,resetToPlaybackOnStop:true});
}
export async function stopNative(id){
 const {recorder,files,Capacitor}=await nativeAPI();const result=await recorder.stopRecording();
 if(!result.uri)throw Error('The recorder did not return an audio file.');
 await files.mkdir({path:'RecordMe',directory:'DATA',recursive:true}).catch(()=>{});
 const saved=await files.copy({from:result.uri,to:`RecordMe/${id}.m4a`,toDirectory:'DATA'});
 const uri=saved.uri||(await files.getUri({path:`RecordMe/${id}.m4a`,directory:'DATA'})).uri;
 const response=await fetch(Capacitor.convertFileSrc(uri));if(!response.ok)throw Error('Audio is saved on the phone but could not be opened.');
 return {uri,blob:await response.blob(),duration:(result.duration||0)/1000};
}
export async function pauseNative(paused){const {recorder}=await nativeAPI();await (paused?recorder.pauseRecording():recorder.resumeRecording());}
export async function initGoogle(config){
 const {login}=await nativeAPI();if(!config.webClientId||!config.folderId)throw Error('Phone Google Drive setup is not configured yet.');
 await login.initialize({google:{webClientId:config.webClientId,iOSClientId:config.iOSClientId,mode:'online'}});return login;
}
export async function connectGoogle(config){const login=await initGoogle(config);await login.login({provider:'google',options:{scopes:['https://www.googleapis.com/auth/drive.file']}});}
export async function googleToken(config){const login=await initGoogle(config);const auth=await login.getAuthorizationCode({provider:'google'});if(!auth.accessToken)throw Error('Open Google Drive connection and sign in again.');return auth.accessToken;}
