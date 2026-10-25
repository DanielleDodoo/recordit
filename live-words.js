// Live words while recording, from the device's own speech recognition (Safari on an iPhone; Chrome or Edge
// on a laptop). Only a rough guide to follow along and mark moments: the accurate transcript is made afterwards
// from the recording. Where a device has none, or it fails, nothing is shown and the recording is unaffected.
export function startLiveWords({onLine,onInterim=()=>{},onUnavailable=()=>{},lang='en-GB'}){
 const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
 if(!Recognition){onUnavailable('none');return {stop(){}};}
 let stopped=false,recognition=null,quickEnds=0,started=0;
 const give_up=reason=>{if(stopped)return;stopped=true;try{recognition?.abort();}catch{}onUnavailable(reason);};
 const begin=()=>{
  if(stopped)return;
  try{recognition=new Recognition();}catch{return give_up('start');}
  recognition.continuous=true;recognition.interimResults=true;recognition.lang=lang;
  recognition.onresult=event=>{
   let interim='';
   for(let i=event.resultIndex;i<event.results.length;i++){const result=event.results[i],text=result[0]?.transcript?.trim()||'';if(result.isFinal){if(text)onLine(text);}else interim+=' '+text;}
   onInterim(interim.trim());
  };
  recognition.onerror=event=>{if(['not-allowed','service-not-allowed','network','audio-capture','language-not-supported'].includes(event.error))give_up(event.error);};
  // Recognition ends by itself every so often; it restarts unless it keeps ending straight away.
  recognition.onend=()=>{if(stopped)return;quickEnds=Date.now()-started<1500?quickEnds+1:0;if(quickEnds>=5)return give_up('stopped');setTimeout(begin,200);};
  started=Date.now();
  try{recognition.start();}catch{give_up('start');}
 };
 begin();
 return {stop(){stopped=true;try{recognition?.stop();}catch{}}};
}
