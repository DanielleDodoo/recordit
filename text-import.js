export const isTextTranscript=name=>/\.(txt|md|markdown)$/i.test(name);
export function parseTextTranscript(text){
 if(typeof text!=='string'||text.length>2000000)throw Error('Text transcripts must be no longer than 2 million characters.');
 const value=text.replace(/^\uFEFF/,'');
 if(!value.trim())throw Error('This transcript is empty. Choose a file containing conversation text.');
 if(value.includes('\u0000'))throw Error('This file is not supported text. Save it as UTF-8 text and try again.');
 return value;
}
