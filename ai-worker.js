import {pipeline,env} from './vendor/transformers.min.js';
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/';env.useBrowserCache=false;
env.backends.onnx.wasm.wasmPaths='/vendor/';env.backends.onnx.wasm.numThreads=1;
let active=null,kind=null;
async function model(type){
 if(kind!==type){if(active)await active.dispose();active=null;kind=null;
  active=await pipeline(type==='speech'?'automatic-speech-recognition':'question-answering',type==='speech'?'onnx-community/whisper-tiny.en':'Xenova/distilbert-base-cased-distilled-squad',{device:'wasm',dtype:'q8',progress_callback:p=>postMessage({type:'progress',text:p.status==='progress'?`Loading model · ${Math.round(p.progress||0)}%`:'Preparing local AI…'})});kind=type;
 }return active;
}
onmessage=async({data})=>{
 try{
  const pipe=await model(data.type==='transcribe'?'speech':'text');
  let result;
  if(data.type==='transcribe')result=await pipe(data.audio,{chunk_length_s:25,stride_length_s:5,return_timestamps:true,force_full_sequences:false});
  else {result=[];for(const source of data.sources){const output=await pipe(data.question,source.text,{top_k:1});result.push({...output,sourceId:source.id});}result.sort((a,b)=>b.score-a.score);}
  postMessage({type:'result',id:data.id,result});
 }catch(e){postMessage({type:'error',id:data.id,error:e.message||String(e)});}
};
