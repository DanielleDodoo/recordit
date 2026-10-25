// Microphone processing for in-room recordings. Browsers default to video-call settings, whose noise
// suppression can treat quiet or synthetic voices (such as a robot's own speaker) as background noise.
export const MIC_MODES={
 standard:{label:'Standard · call settings',constraints:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}},
 research:{label:'Research · keeps quiet voices (noise suppression off)',constraints:{echoCancellation:false,noiseSuppression:false,autoGainControl:true}},
 raw:{label:'Raw · no processing at all',constraints:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}
};
const NAMES={standard:'Standard',research:'Research',raw:'Raw'};
const KEYS=['noiseSuppression','echoCancellation','autoGainControl'];
export const micMode=value=>Object.hasOwn(MIC_MODES,value)?value:'standard';
export const micConstraints=mode=>({audio:{...MIC_MODES[micMode(mode)].constraints},video:false});

// What the browser actually applied, which can differ from what was asked for.
export function micSummary(mode,applied={}){
 const summary={mode:micMode(mode)};
 for(const key of KEYS)if(typeof applied[key]==='boolean')summary[key]=applied[key];
 return summary;
}
export function micDescription(mic){
 const parts=[['noiseSuppression','noise suppression'],['echoCancellation','echo cancellation'],['autoGainControl','auto volume']].filter(([key])=>typeof mic[key]==='boolean').map(([key,name])=>name+' '+(mic[key]?'on':'off'));
 const asked=MIC_MODES[mic.mode].constraints,ignored=KEYS.some(key=>typeof mic[key]==='boolean'&&mic[key]!==asked[key]);
 return 'Mic: '+NAMES[mic.mode]+(parts.length?' ('+parts.join(', ')+')':'')+(ignored?' · the browser did not apply every setting':'');
}
export function restoreMic(value){
 if(!value||typeof value!=='object'||!Object.hasOwn(MIC_MODES,value.mode))return null;
 return micSummary(value.mode,value);
}
