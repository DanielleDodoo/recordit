import {classify} from './core.js';

export function filingPatch(note,rules,{rename,remove}={}){
 if(note.recording)return null;
 let category=note.category,collectionManual=!!note.collectionManual;
 if(remove&&category===remove){category='Unfiled';collectionManual=true;}
 if(rename&&category===rename.from)category=rename.to;
 const result=classify(note,rules);
 if(!collectionManual)category=result.category;
 const patch={category,collectionManual,secondaryCategories:result.matched.filter(name=>name!==category),collectionReason:result.reason};
 return Object.entries(patch).some(([key,value])=>JSON.stringify(note[key])!==JSON.stringify(value))?patch:null;
}
