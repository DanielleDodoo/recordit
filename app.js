import {correctionKey,correctionRanges,correctPassage,replaceTranscript} from './transcript-correction.js';
import {bindSpeakerFilter} from './speaker-filter.js';
import {highlightMatches,addHighlight,highlightHtml} from './highlights.js';
import {bindPlayback} from './playback-controls.js';
import {subtitleIssue,subtitleText} from './subtitle-export.js';
import {isTextTranscript,parseTextTranscript} from './text-import.js';
import {speakerMatches,setSpeaker,renameSpeaker} from './speakers.js';
import {commentMatches,saveComment,removeComment} from './comments.js';
import {searchLibrary,sortLibrary} from './library-search.js';
import {bookmarkMatches,toggleBookmark} from './bookmarks.js';
import {answerCopyText} from './answer-copy.js';
import {createQuestionDrafts} from './question-drafts.js';
import {ORIGINAL_SESSION,initialSession,sessionEntries,sessionAnswers,removedSessionIndex} from './chat-sessions.js';
import {readLibraryDirectory} from './library-reader.js';
import {prepareLibraryRestore,restorePlannedLibrary} from './library-restore.js';
import {captureLibraryTransfer} from './library-capture.js';
import {writeLibraryDirectory} from './library-directory.js';
import {createDriveBackup} from './drive-backup.js';
import {restoreHistory} from './backup-history.js';
import {createTranscriptAutosave} from './transcript-autosave.js';
import {resetConversationView} from './conversation-view.js';
import {findWords} from './transcript-search.js';
import {applyTranscription,switchVersion,versionChoices,labelledTranscript} from './transcript-versions.js';
import {MIC_MODES,micMode,micConstraints,micSummary,micDescription} from './mic-modes.js';
import {voiceGroups,voiceSamples,nameVoiceGroups} from './voice-groups.js';
import {createLibrarySync,ignoreTarget} from './library-sync.js';
import {libraryStorage} from './library-settings.js';
import {moveBrowserLibrary} from './library-migrate.js';
import * as browserDb from './db-browser.js';
import * as db from './db.js';
import {segments,contextFor,validateBackup,classify,asksForAgreements,readableMarkdown,exportName} from './core.js';
import {loadCollections} from './collections.js';
import {updateCollectionRules,recoverCollectionUpdate,COLLECTION_PENDING} from './collection-update.js';
import {GROUPS,sourcesFor,sourceKey,SUMMARY_MODEL,validateSummary} from './summaries.js';
import {checkAudioSize} from './limits.js';
import {isNative,noLaptop,onPhoneWeb,startNative,stopNative,pauseNative} from './mobile.js';
import {addMoment,applyMoments,restoreMoments,removeMoment} from './moments.js';
import {keepAwake} from './keep-awake.js';
import {startLiveWords} from './live-words.js';
import {placeholderTitle,titleFromSummary} from './auto-title.js';
import {loadGoogleSignIn,driveToken,sendToDrive} from './phone-drive.js';
const nativeAiUnavailable='Summaries and AI answers are made by recordit on your laptop. Find words and saved answers work here.';
function requireGeneration(){if(noLaptop)throw Error(nativeAiUnavailable);}
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let notes=[],selected=null,filter='All',worker=null,busy=false,playerURL=null,recorder=null,stream=null,screenStream=null,recording=null,timerInterval=null,wakeLock=null,elapsed=0,lastTick=0,saving=Promise.resolve();
let collections=loadCollections(libraryStorage),editingCollection=null;
let batchMode=false,batchBusy=false,batchUndo=null;const batchIds=new Set();
const questionDrafts=createQuestionDrafts($('question'));
const activeChatSessions=new Map();
const emptyChatSessions=new Map();
const activeChat=id=>activeChatSessions.get(id)||ORIGINAL_SESSION;
const chatDraftKey=(id,session=activeChat(id))=>JSON.stringify([id,session]);
let noteOpenRequest=0;
const transcriptStatuses=new Map();let transcriptSaveError='',activeBackupFolder=null;
function setBackupDestination(folder){if(typeof folder!=='string')return;activeBackupFolder=folder;$('backup-destination').textContent=folder;showSync();}
const transcriptSaver=createTranscriptAutosave({list:()=>db.list(),onStatus:(id,text)=>{if(id){transcriptStatuses.set(id,text);transcriptSaveError='';}else transcriptSaveError=text;showTranscriptSave();}});
function showTranscriptSave(){if(!selected)return;$('transcript-save-status').textContent=noLaptop?'Automatic Markdown export is available in the Windows app.':transcriptSaveError||transcriptStatuses.get(selected.id)||(selected.transcript?'Readable Markdown copy queued for Ronnie TRANSCRIPTS.':'A readable copy will be saved after transcription.');}
const toast=text=>{$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>$('toast').hidden=true,6500);};
const updateSpeakerFilter=bindSpeakerFilter({select:$('speaker-filter'),highlightedOnly:$('highlighted-only'),status:$('speaker-filter-status'),view:$('transcript-view'),detail:$('detail')});
const refreshPlayback=bindPlayback($('player'),{panel:$('playback-tools'),speed:$('playback-speed'),back:$('skip-back'),forward:$('skip-forward')});
const clock=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const date=n=>new Date(n).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
function run(fn){return async(...args)=>{try{await fn(...args);}catch(e){console.error(e);toast(e.message||'Something went wrong. Your saved recordings are still on this device.');}};}
async function refresh(){notes=(await db.list()).sort((a,b)=>b.created-a.created);renderList();}
function renderList(){
 const query=$('search').value.trim(),withinCollection=$('library-search-collection').checked&&filter!=='All';
 $('library-search-collection').disabled=filter==='All';if(filter==='All')$('library-search-collection').checked=false;
 const visible=sortLibrary(searchLibrary(notes,{query,field:$('library-search-field').value,collection:filter,withinCollection}),$('library-sort').value);
 $('list-title').innerHTML=(query?'Search results · '+(withinCollection?esc(filter):'all collections'):'Recent conversations')+' <span id="list-count"></span>';$('count').textContent=notes.length;$('list-count').textContent=String(visible.length).padStart(2,'0');
 $('notes').innerHTML=visible.length?visible.map(n=>`${batchMode?'<div class="batch-note"><input type="checkbox" data-batch-id="'+esc(n.id)+'" aria-label="Select '+esc(n.title)+'" '+(batchIds.has(n.id)?'checked':'')+(n.recording||batchBusy?' disabled':'')+'>':''}<button class="note-row" data-note="${esc(n.id)}"><span class="note-icon">≋</span><span class="note-copy"><strong>${esc(n.title)}</strong><small>${date(n.created)} &nbsp;·&nbsp; ${n.duration?clock(n.duration):'Text note'} &nbsp;·&nbsp; ${n.recording?'Recovered recording':n.transcript?'Transcript ready':'Audio saved'}</small></span><span class="tag">${esc(n.category)}</span><span aria-hidden="true">↗</span></button>${batchMode?'</div>':''}`).join(''):`<div class="empty"><h3>${notes.length?'Nothing found here.':'Your first conversation starts here.'}</h3><p>${notes.length?'Try a different search or collection.':'Record a conversation or import an audio file.<br>Your notes will appear here, on this device.'}</p><button id="example" class="subtle">Explore a clearly labelled example →</button></div>`;
 renderBatchControls();
 $('notes').querySelectorAll('[data-batch-id]').forEach(box=>box.onchange=()=>{if(box.checked&&batchIds.size>=100){box.checked=false;toast('Select up to 100 conversations at a time.');return;}if(box.checked)batchIds.add(box.dataset.batchId);else batchIds.delete(box.dataset.batchId);renderBatchControls();});
 $('notes').querySelectorAll('[data-note]').forEach(el=>{el.disabled=batchBusy;el.onclick=run(()=>openNote(el.dataset.note));});
 if($('example'))$('example').onclick=run(addExample);
}
function renderBatchControls(){
 for(const id of batchIds)if(!notes.some(n=>n.id===id))batchIds.delete(id);
 $('batch-toggle').textContent=batchMode?'Done selecting':'Select conversations';$('batch-toggle').disabled=batchBusy;
 $('batch-controls').hidden=!batchMode;$('batch-count').textContent=batchIds.size+' selected across library';
 const previous=$('batch-target').value,names=['Unfiled',...loadCollections(libraryStorage).map(c=>c.name)];$('batch-target').innerHTML=names.map(name=>'<option>'+esc(name)+'</option>').join('');$('batch-target').value=names.includes(previous)?previous:'Unfiled';
 $('batch-apply').disabled=batchBusy||!batchIds.size;$('batch-target').disabled=batchBusy;$('batch-undo').hidden=!batchUndo;$('batch-undo').disabled=batchBusy;
}
async function changeBatch(undo=false){
 if(batchBusy)return;if(!navigator.locks?.request)throw Error('Safe batch filing needs Web Locks. Use Chrome or Edge.');
 const receipt=undo?batchUndo:null,ids=undo?receipt?.entries.map(e=>e.id):[...batchIds],target=$('batch-target').value;if(!ids?.length)return;
 batchBusy=true;renderList();
 try{const result=await navigator.locks.request('recordit-collection-rules',{mode:'exclusive'},async()=>{
  if(libraryStorage.getItem(COLLECTION_PENDING)!==null||libraryStorage.getItem('recordit-library-restore')!==null)throw Error('Finish the pending collection update or library import before filing conversations.');
  return db.fileBatch(ids,target,loadCollections(libraryStorage),receipt);
 });
 batchUndo=undo?null:result;batchIds.clear();await refresh();scheduleSync();$('batch-status').textContent=undo?'Batch undone.':ids.length+(ids.length===1?' conversation':' conversations')+' filed in '+target+'. Undo is available until another batch or reload.';
 }finally{batchBusy=false;renderList();}
}
$('batch-toggle').onclick=()=>{batchMode=!batchMode;if(!batchMode)batchIds.clear();renderList();};
$('batch-apply').onclick=run(()=>changeBatch());$('batch-undo').onclick=run(()=>changeBatch(true));
async function addExample(){const n={id:crypto.randomUUID(),title:'Example · Planning a family visit',category:'Personal',created:Date.now(),duration:0,transcript:'This is a fictional example, not a real recording. We agreed to visit Dad on Saturday afternoon. Alex will bring lunch and Sam will arrange the transport. We need to call on Friday to confirm the time. Everyone wants to leave enough time for a relaxed visit.',chunks:[],chats:[],revision:1};await db.save(n);await refresh();await openNote(n.id);}
function autoFile(note){const result=classify(note,collections);if(!note.collectionManual)note.category=result.category;note.secondaryCategories=result.matched.filter(c=>c!==note.category);note.collectionReason=result.reason;}
async function commit(note=selected){autoFile(note);note.revision=(note.revision||0)+1;note.updated=Date.now();await db.save(note);await refresh();if(selected?.id===note.id){showSync();showFiling();}scheduleSync();}
async function openNote(id){
 if(batchBusy)return;
 if(!notes.some(n=>n.id===id))return;
 const request=++noteOpenRequest;
 if(!activeChatSessions.has(id))activeChatSessions.set(id,initialSession(notes.find(n=>n.id===id)));
 questionDrafts.select(chatDraftKey(id));
 selected=notes.find(n=>n.id===id);if(!selected)return;$('attach-audio').hidden=true;resetConversationView();
 $('library').hidden=true;$('detail').hidden=false;$('title').value=selected.title;renderCollections();$('category').value=selected.category;$('tags').value=(selected.tags||[]).join(', ');$('auto-file').checked=!selected.collectionManual;showFiling();
 $('note-meta').textContent=`${date(selected.created)} · ${selected.duration?clock(selected.duration)+' recorded':'Text conversation'}${selected.recording?' · Recovered audio; ending may be incomplete':''}${selected.mic?' · '+micDescription(selected.mic):''}`;
 $('editor').hidden=true;$('transcript-view').hidden=false;$('job').hidden=!busy;
 renderTranscript();renderSummary();renderChat();showSync();$('find-words').value='';renderWordSearch();
 $('player').pause();$('player').hidden=true;$('player').removeAttribute('src');refreshPlayback();
 $('export-audio').disabled=true;$('transcribe').disabled=true;$('transcribe').textContent=selected.transcript?'Transcribe again':'Transcribe audio';
 if(playerURL)URL.revokeObjectURL(playerURL);playerURL=null;
 const audio=await db.getAudio(id);
 if(request!==noteOpenRequest||selected?.id!==id)return;
 $('attach-audio').hidden=Boolean(audio?.blob);$('attach-audio').disabled=busy;
 $('player').hidden=!audio?.blob;$('export-audio').disabled=!audio?.blob;$('transcribe').disabled=!audio?.blob||busy;
 if(audio?.blob){playerURL=URL.createObjectURL(audio.blob);$('player').src=playerURL;}else $('player').removeAttribute('src');
 window.scrollTo(0,0);
 // A recording from the phone arrives already transcribed: its summary, and so its title, is made on first opening.
 if(!noLaptop&&!busy&&selected.titleAuto&&selected.transcript?.trim()&&!selected.generatedSummary)summarise(selected).catch(()=>{});
 showSent(selected);
}
function showSync(){if(!selected)return;showTranscriptSave();$('sync-status').textContent=selected.backedRevision===selected.revision&&selected.backedFolder===activeBackupFolder&&(selected.backedTargetId||selected.id)===(selected.backupId||selected.id)?'Copied to Drive folder':libraryStorage.getItem('backupEnabled')==='true'?'Local copy · backup pending':'Saved on this device';}
function showFiling(){if(!selected)return;$('category').value=selected.category;const reason=(selected.collectionReason||'Add a transcript or tags for automatic topic matching.').replace(selected.collectionManual?'Several collections match equally. Choose a primary collection. ':'\u0000','');$('filing-reason').textContent=(selected.collectionManual?'Primary chosen by you. ':'')+reason;$('secondary-collections').textContent='Also appears in: '+((selected.secondaryCategories||[]).join(' · ')||'no secondary collections yet');}
function renderSummary(){
 const saved=selected.generatedSummary,valid=saved?.sourceKey===sourceKey(selected);
 $('summarise').textContent=valid?'Regenerate':'Generate summary';$('summarise').disabled=noLaptop||busy||!selected.transcript?.trim();
 $('summary').innerHTML=valid?Object.entries(GROUPS).map(([key,title])=>`<section><h3>${title}</h3>${saved[key].length?`<ul>${saved[key].map(b=>`<li>${esc(b.text)} <span class="citations">${b.evidence.map(e=>`<a href="#source-${e.id}" data-source="${e.id}" title="${esc(e.quote)}" aria-label="Read supporting transcript passage ${e.id}">[${e.id}]</a>`).join(' ')}</span></li>`).join('')}</ul>`:'<p class="caption">No supported '+(key==='next_steps'?'next steps':key)+' identified.</p>'}</section>`).join('')+`<p class="caption">Generated offline.${saved.parts>1?` Covers ${saved.parts} transcript sections in order; related themes may recur.`:''}${saved.rejected?' Some bullets were omitted because their source references were missing or invalid.':''} Check the sources: AI can misinterpret them.</p>`:noLaptop?'<p class="muted">'+nativeAiUnavailable+'</p>':'<p class="muted">Generate main themes, conclusions and next steps with the offline engine on your laptop. Each bullet links to its supporting transcript passage.</p>';
 $('summary').querySelectorAll('[data-source]').forEach(a=>a.onclick=e=>{e.preventDefault();$('editor').hidden=true;$('transcript-view').hidden=false;const target=$('source-'+a.dataset.source);target?.scrollIntoView({behavior:'smooth',block:'center'});document.querySelectorAll('.source-highlight').forEach(el=>el.classList.remove('source-highlight'));target?.classList.add('source-highlight');target?.focus({preventScroll:true});});
}
function renderTranscript(){
 const timingIssue=subtitleIssue(selected.chunks);$('export-srt').disabled=Boolean(timingIssue);$('export-srt').title=timingIssue||'Save timed transcript captions as SRT';
 const correctionSnapshot=correctionKey(selected),canCorrect=Boolean(correctionRanges(selected));
 const noteId=selected.id,chunks=sourcesFor(selected),bookmarks=selected.bookmarks||[],comments=selected.comments||[],speakerLabels=selected.speakerLabels||[],highlights=selected.highlights||[];
 const choices=versionChoices(selected),showing=selected.transcriptVersionId||'original';$('version-row').hidden=choices.length<2;
 $('transcript-version').innerHTML=choices.map(v=>`<option value="${esc(v.id)}"${v.current?' selected':''}>${esc((v.engineLabel||'Original transcript')+' · '+date(v.created))}${v.current?' (showing)':''}</option>`).join('');
 $('transcript-version').onchange=run(async()=>{const versionId=$('transcript-version').value;if(versionId===showing)return;
  try{const fresh=await db.editAnswers(noteId,n=>{if((n.transcriptVersionId||'original')!==showing)throw Error('This conversation changed. Reopen it and try again.');switchVersion(n,versionId,Date.now());autoFile(n);});
   if(!fresh)throw Error('This conversation no longer exists.');await refresh();scheduleSync();
   if(selected?.id===noteId){selected=fresh;renderTranscript();renderSummary();renderChat();renderWordSearch();showFiling();$('transcribe').textContent='Transcribe again';}
   toast('Now showing the '+(fresh.transcriptEngineLabel||'original')+' transcript. The other version is still kept.');
  }catch(error){if(selected?.id===noteId)$('transcript-version').value=showing;throw error;}
 });
 const groups=voiceGroups(selected);$('name-voices').hidden=!groups.length;
 // Speech the engine heard but could not turn into (enough) words is shown in place, so nothing is lost silently.
 const gaps=[...(selected.speechGaps||[])].sort((a,b)=>a.start-b.start);let nextGap=0;
 const gapHtml=g=>`<div class="speech-gap" role="note"><button class="timestamp" data-time="${g.start}">${clock(g.start)}</button> ${g.reason==='few-words'?'Fewer words than expected':'Speech heard but no words recognised'} until ${clock(g.end)}. Listen to check nothing is missing.</div>`;
 const gapsBefore=time=>{let html='';while(nextGap<gaps.length&&gaps[nextGap].start<=time)html+=gapHtml(gaps[nextGap++]);return html;};
 const list=bookmarks.length?'<details class="saved-bookmarks" open><summary>Bookmarks ('+bookmarks.length+')</summary>'+bookmarks.map((b,i)=>'<div class="bookmark-entry"><span>'+esc(b.text)+'</span> '+(chunks.some(c=>bookmarkMatches(b,c))?'<button class="subtle" data-bookmark-jump="'+b.id+'">Go to passage '+b.id+'</button>':'<small>Transcript changed · saved excerpt</small>')+' <button class="subtle" data-bookmark-remove="'+i+'" aria-label="Remove bookmark '+(i+1)+'">Remove</button></div>').join('')+'</details>':'';
 const commentList=comments.length?'<details class="saved-comments" open><summary>Your comments ('+comments.length+')</summary>'+comments.map((c,i)=>'<article class="comment-entry"><blockquote>'+esc(c.sourceText)+'</blockquote><p>'+esc(c.text)+'</p><div>'+(chunks.some(source=>commentMatches(c,source))?'<button class="subtle" data-comment-jump="'+c.sourceId+'">Go to passage '+c.sourceId+'</button>':'<small>Transcript changed · saved excerpt</small>')+' <button class="subtle" data-comment-edit="'+i+'" aria-label="Edit comment '+(i+1)+'">Edit</button> <button class="subtle" data-comment-remove="'+i+'" aria-label="Remove comment '+(i+1)+'">Remove</button></div></article>').join('')+'</details>':'';
 const staleLabels=speakerLabels.filter(label=>!chunks.some(source=>speakerMatches(label,source)));
 const staleList=staleLabels.length?'<details class="saved-speakers"><summary>Earlier speaker labels ('+staleLabels.length+')</summary><p class="caption">Transcript changed. These saved labels are not applied to the current text.</p>'+staleLabels.map(label=>'<p><strong>'+esc(label.name)+'</strong>: '+esc(label.sourceText)+'</p>').join('')+'</details>':'';
 const highlightedList=highlights.length?'<details class="saved-highlights"><summary>Your highlights ('+highlights.length+')</summary>'+highlights.map((h,i)=>'<div class="highlight-entry"><span>'+esc(h.sourceText.slice(h.start,h.end))+'</span> '+(chunks.some(c=>highlightMatches(h,c))?'<button class="subtle" data-highlight-jump="'+h.sourceId+'">Go to passage '+h.sourceId+'</button>':'<small>Transcript changed · saved excerpt</small>')+' <button class="subtle" data-highlight-remove="'+i+'" aria-label="Remove highlight '+(i+1)+'">Remove</button></div>').join('')+'</details>':'';
 $('transcript-view').innerHTML=highlightedList+list+commentList+staleList+(chunks.length?chunks.map(c=>{const saved=bookmarks.some(b=>bookmarkMatches(b,c));return `${gapsBefore(Number(c.timestamp?.[0])||0)}<div class="transcript-line" id="source-${c.id}" tabindex="-1"><span class="caption">[${c.id}] </span>${c.timestamp?`<button class="timestamp" data-time="${Number(c.timestamp[0])||0}">${clock(c.timestamp[0]||0)}</button>`:''}<button class="bookmark-toggle subtle" data-bookmark="${c.id}" aria-pressed="${saved}" aria-label="${saved?'Remove bookmark from':'Bookmark'} passage ${c.id}">${saved?'★':'☆'}</button><button class="comment-toggle subtle" data-comment-add="${c.id}" aria-label="Comment on passage ${c.id}">✎</button><button class="speaker-label subtle" data-speaker="${c.id}" aria-label="Set speaker for passage ${c.id}">${esc(speakerLabels.find(label=>speakerMatches(label,c))?.name||"Speaker")}</button>${canCorrect?`<button class="subtle" data-correct-passage="${c.id}" aria-label="Correct text in passage ${c.id}">Correct</button>`:''}<span class="passage-text">${highlightHtml(c,highlights)}</span></div>`;}).join('')+gapsBefore(Infinity):'<p class="muted">Your recording is safe here. Choose “Transcribe audio” to turn it into text on this device.</p>');
 const changed=async change=>{const fresh=await db.editAnswers(noteId,change);if(!fresh)throw Error('This conversation changed. Reopen it and try again.');await refresh();if(selected?.id===noteId){selected=fresh;renderTranscript();renderWordSearch();}scheduleSync();};
 $('transcript-view').querySelectorAll('[data-correct-passage]').forEach(button=>button.onclick=()=>{
  const id=Number(button.dataset.correctPassage),dialog=$('correction-dialog');$('correction-text').value=chunks.find(c=>c.id===id).text;dialog.showModal();$('correction-text').focus();
  $('correction-form').onsubmit=run(async event=>{event.preventDefault();if($('correction-form').dataset.saving==='true')return;const replacement=$('correction-text').value;$('correction-form').dataset.saving='true';
   try{await changed(n=>{Object.assign(n,correctPassage(n,correctionSnapshot,id,replacement));delete n.generatedSummary;autoFile(n);});dialog.close();if(selected?.id===noteId){renderSummary();renderChat();showFiling();$('source-'+id)?.focus({preventScroll:true});}toast('Passage corrected. Timing kept; earlier answers and annotations may be out of date.');}finally{delete $('correction-form').dataset.saving;}
  });
 });
 $('transcript-view').querySelectorAll('[data-bookmark]').forEach(b=>b.onclick=run(async()=>{const source=chunks.find(c=>c.id===Number(b.dataset.bookmark));await changed(n=>{if(!sourcesFor(n).some(c=>bookmarkMatches(source,c)))return false;n.bookmarks=toggleBookmark(n.bookmarks,source);});if(selected?.id===noteId)$('source-'+source.id)?.querySelector('[data-bookmark]')?.focus({preventScroll:true});}));
 $('transcript-view').querySelectorAll('[data-bookmark-remove]').forEach(b=>b.onclick=run(async()=>{const mark=bookmarks[Number(b.dataset.bookmarkRemove)];await changed(n=>{n.bookmarks=(n.bookmarks||[]).filter(x=>!bookmarkMatches(x,mark));});if(selected?.id===noteId)($('source-'+mark.id)||$('transcript-tab')).focus({preventScroll:true});}));
 $('transcript-view').querySelectorAll('[data-bookmark-jump]').forEach(b=>b.onclick=()=>{const target=$('source-'+b.dataset.bookmarkJump);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus({preventScroll:true});});
 const editComment=(source,existing=null)=>{
  const dialog=$('comment-dialog');$('comment-excerpt').textContent=existing?.sourceText||source.text;$('comment-text').value=existing?.text||'';dialog.showModal();$('comment-text').focus();
  $('comment-form').onsubmit=run(async event=>{event.preventDefault();const text=$('comment-text').value.trim();if(!text||$('comment-form').dataset.saving==='true')return;$('comment-form').dataset.saving='true';try{const comment=existing?{...existing,text}:{id:crypto.randomUUID(),sourceId:source.id,sourceText:source.text,text};
   await changed(n=>{if(!existing&&!sourcesFor(n).some(s=>commentMatches(comment,s)))throw Error('The transcript changed. Reopen the passage.');n.comments=saveComment(n.comments,comment,existing?.text??null);});dialog.close();if(selected?.id===noteId)(sourcesFor(selected).some(s=>commentMatches(comment,s))?$('source-'+comment.sourceId):$('transcript-tab')).focus({preventScroll:true});}finally{delete $('comment-form').dataset.saving;}
  });
 };
 $('transcript-view').querySelectorAll('[data-comment-add]').forEach(b=>b.onclick=()=>editComment(chunks.find(c=>c.id===Number(b.dataset.commentAdd))));
 $('transcript-view').querySelectorAll('[data-comment-edit]').forEach(b=>b.onclick=()=>editComment(null,comments[Number(b.dataset.commentEdit)]));
 $('transcript-view').querySelectorAll('[data-comment-remove]').forEach(b=>b.onclick=run(async()=>{const comment=comments[Number(b.dataset.commentRemove)];await changed(n=>{n.comments=removeComment(n.comments,comment.id,comment.text);});if(selected?.id===noteId)($('source-'+comment.sourceId)||$('transcript-tab')).focus({preventScroll:true});}));
 $('transcript-view').querySelectorAll('[data-comment-jump]').forEach(b=>b.onclick=()=>{const target=$('source-'+b.dataset.commentJump);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus({preventScroll:true});});
 $('transcript-view').querySelectorAll('[data-speaker]').forEach(button=>button.onclick=()=>{
  const source=chunks.find(c=>c.id===Number(button.dataset.speaker)),existing=speakerLabels.find(label=>speakerMatches(label,source));
  const capturedSourceKey=sourceKey(selected);$('speaker-all').checked=false;$('speaker-all-row').hidden=!existing;$('speaker-all-text').textContent=existing?'Rename all '+speakerLabels.filter(label=>label.name===existing.name&&chunks.some(c=>speakerMatches(label,c))).length+' passages named '+existing.name:'';
  $('speaker-excerpt').textContent=source.text;$('speaker-name').value=existing?.name||'';$('speaker-dialog').showModal();$('speaker-name').focus();
  $('speaker-form').onsubmit=run(async event=>{event.preventDefault();if($('speaker-form').dataset.saving==='true')return;const name=$('speaker-name').value,all=$('speaker-all').checked&&Boolean(existing);
   const merging=all?speakerLabels.filter(label=>label.name===name.trim()&&label.name!==existing.name&&chunks.some(c=>speakerMatches(label,c))).length:0;
   if(merging&&!confirm(`“${name.trim()}” is already the name on ${merging} other passage${merging>1?'s':''}. Renaming will put both speakers under that one name.${groups.length?' You can separate them again with Name speakers.':''} Continue?`))return;
   $('speaker-form').dataset.saving='true';
   try{await changed(n=>{if(!sourcesFor(n).some(s=>s.id===source.id&&s.text===source.text))throw Error('The transcript changed. Reopen the passage.');if(all){if(sourceKey(n)!==capturedSourceKey)throw Error('The transcript changed. Reopen the speaker dialog.');n.speakerLabels=renameSpeaker(n.speakerLabels,sourcesFor(n),existing.name,name,speakerLabels);}else n.speakerLabels=setSpeaker(n.speakerLabels,source,name,existing?.name??null);});$('speaker-dialog').close();if(selected?.id===noteId)$('source-'+source.id)?.querySelector('[data-speaker]')?.focus({preventScroll:true});}finally{delete $('speaker-form').dataset.saving;}
  });
 });
 $('highlight-selection').onpointerdown=e=>e.preventDefault();
 $('highlight-selection').onclick=run(async()=>{
  const selection=window.getSelection();if(!selection||selection.rangeCount!==1||selection.isCollapsed)throw Error('Select words within one transcript passage first.');
  const range=selection.getRangeAt(0),node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement,span=node.closest('.passage-text');
  if(!span||!$('transcript-view').contains(span)||!span.contains(range.endContainer))throw Error('Select words within a single transcript passage.');
  const source=chunks.find(c=>'source-'+c.id===span.closest('.transcript-line').id),prefix=document.createRange();prefix.selectNodeContents(span);prefix.setEnd(range.startContainer,range.startOffset);const start=prefix.toString().length,end=start+range.toString().length;
  if(!source||!range.toString().trim()||source.text.slice(start,end)!==range.toString())throw Error('The selected text changed. Select the passage again.');
  const highlight={id:crypto.randomUUID(),sourceId:source.id,sourceText:source.text,start,end};await changed(n=>{if(!sourcesFor(n).some(c=>highlightMatches(highlight,c)))throw Error('The transcript changed. Select the passage again.');n.highlights=addHighlight(n.highlights,highlight);});selection.removeAllRanges();if(selected?.id===noteId)$('source-'+source.id)?.focus({preventScroll:true});
 });
 $('transcript-view').querySelectorAll('[data-highlight-remove]').forEach(b=>b.onclick=run(async()=>{const h=highlights[Number(b.dataset.highlightRemove)];await changed(n=>{n.highlights=(n.highlights||[]).filter(item=>item.id!==h.id);});if(selected?.id===noteId)$('transcript-tab').focus({preventScroll:true});}));
 $('transcript-view').querySelectorAll('[data-highlight-jump]').forEach(b=>b.onclick=()=>{const target=$('source-'+b.dataset.highlightJump);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus({preventScroll:true});});
 // Naming by the engine's voice groups; reopening it later undoes any naming mistake.
 $('name-voices').onclick=()=>{
  const capturedSourceKey=sourceKey(selected);
  $('voices-list').innerHTML=groups.map(g=>`<fieldset class="voice-group"><legend>${esc(g.group)} · ${g.sources.length} passage${g.sources.length>1?'s':''}</legend>${voiceSamples(g).map(s=>`<p class="voice-sample">${s.timestamp?`<button type="button" class="timestamp" data-voice-from="${Number(s.timestamp[0])||0}" data-voice-to="${Number(s.timestamp[1])||''}">${clock(s.timestamp[0]||0)}</button> `:''}“${esc(s.text.length>140?s.text.slice(0,140)+'…':s.text)}”</p>`).join('')}<label>Name<input data-voice-group="${esc(g.group)}" value="${esc(g.name)}" maxlength="80" autocomplete="off"></label></fieldset>`).join('');
  $('voices-reset').checked=false;
  $('voices-list').querySelectorAll('[data-voice-from]').forEach(b=>b.onclick=run(async()=>{
   const player=$('player'),to=Number(b.dataset.voiceTo);player.currentTime=Number(b.dataset.voiceFrom);
   if(to){const stop=()=>{if(player.currentTime>=to){player.pause();player.removeEventListener('timeupdate',stop);}};player.addEventListener('timeupdate',stop);}
   await player.play();
  }));
  $('voices-dialog').showModal();
  $('voices-form').onsubmit=run(async event=>{event.preventDefault();if($('voices-form').dataset.saving==='true')return;
   const names=Object.fromEntries([...$('voices-list').querySelectorAll('[data-voice-group]')].map(input=>[input.dataset.voiceGroup,input.value]));
   $('voices-form').dataset.saving='true';
   try{await changed(n=>{if(sourceKey(n)!==capturedSourceKey)throw Error('The transcript changed. Reopen Name speakers.');n.speakerLabels=nameVoiceGroups(n,names,{resetIndividual:$('voices-reset').checked});});$('voices-dialog').close();toast('Speaker names saved. Use Name speakers again whenever you want to change them.');}
   finally{delete $('voices-form').dataset.saving;}
  });
 };
 $('voices-cancel').onclick=()=>$('voices-dialog').close();$('voices-dialog').onclose=()=>$('player').pause();
 updateSpeakerFilter(noteId,chunks,speakerLabels,highlights);
 $('transcript-view').querySelectorAll('[data-time]').forEach(b=>b.onclick=run(async()=>{$('player').currentTime=Number(b.dataset.time);await $('player').play();}));
}
async function summarise(note=selected){
 requireGeneration();
 if(!note?.transcript?.trim())throw Error('Add a transcript first.');
 const transcript=note.transcript,chunks=JSON.stringify(note.chunks||[]),key=sourceKey(note);
 job('Preparing the offline summary. The first run loads a large local model.');
 try{
  const result=await inference('summarise',{sources:sourcesFor(note)});
  let saved=await db.saveSummary(note.id,transcript,chunks,{...result,sourceKey:key,model:result.model||SUMMARY_MODEL,created:Date.now()});
  const named=saved?.titleAuto&&titleFromSummary(result);
  if(named)saved=await db.editAnswers(note.id,n=>{if(!n.titleAuto||n.title===named)return false;n.title=named;})||saved;
  await refresh();if(saved&&selected?.id===note.id){selected=saved;if(document.activeElement!==$('title'))$('title').value=saved.title;renderSummary();showSync();job('Summary saved. Select a numbered reference to check its transcript evidence.');}else if(!saved)job('The transcript changed while summarising. Generate again to use the latest text.');scheduleSync();
 }catch(e){job(e.message);throw e;}
}
function renderChat(){
 const session=activeChat(selected.id);
 $('chat-session').innerHTML=sessionEntries(selected,session,emptyChatSessions.get(selected.id)||[]).map(entry=>'<option value="'+esc(entry.id)+'">'+esc(entry.label)+'</option>').join('');
 $('chat-session').value=session;
 $('chat').innerHTML=(removedSessionIndex(selected,session)>=0?'<button id="undo-answer" class="subtle">Undo removed answer</button>':'')+sessionAnswers(selected,session).map(({answer:c,index})=>{
 if(c.kind==='clarification')return '<div class="answer"><div class="answer-heading"><strong>'+esc(c.question)+'</strong><span class="answer-actions"><button class="subtle" data-edit-question="'+index+'">Edit question</button><button class="subtle" data-copy-answer="'+index+'">Copy</button><button class="subtle" data-remove-answer="'+index+'">Remove answer</button></span></div><small>Clarification requested</small><p>'+esc(c.clarification)+'</p></div>';
 const current=Boolean(c.sourceKey)&&c.sourceKey===sourceKey(selected);
 return '<div class="answer"><div class="answer-heading"><strong>'+esc(c.question)+'</strong><span class="answer-actions"><button class="subtle" data-retry-question="'+index+'"'+(noLaptop?' disabled':'')+'>Ask again</button><button class="subtle" data-edit-question="'+index+'">Edit question</button><button class="subtle" data-copy-answer="'+index+'">Copy</button><button class="subtle" data-remove-answer="'+index+'">Remove answer</button></span></div><small>'+ (c.bullets?'Qwen · offline'+(c.elapsedMs?' · '+Math.round(c.elapsedMs/1000)+' seconds':''):'Earlier search result')+'</small>'+esc(c.answer)+(c.bullets||[]).map(b=>'<p>'+esc(b.text)+(current?' '+b.evidence.map(e=>'<a href="#source-'+e.id+'" data-answer-source="'+e.id+'" aria-label="Read supporting transcript passage '+e.id+'" title="'+esc(e.quote)+'">['+e.id+']</a>').join(' '):'')+'</p>').join('')+(!current?'<p>This answer has no current verified transcript references. Check the transcript before using it.</p>':'')+(c.rejected?'<small>Some unsupported bullets were omitted.</small>':'')+(c.sources||[]).map(s=>{const target=c.sourceKey&&current&&sourcesFor(selected).find(p=>p.id===s.id&&p.text===s.text);return '<details class="source"><summary>Source ['+s.id+']</summary>'+esc(s.text)+(target?'<a class="source-jump" href="#source-'+s.id+'" data-answer-source="'+s.id+'" aria-label="Go to transcript passage '+s.id+'">Go to transcript'+(Number.isFinite(target.timestamp?.[0])?' · '+clock(target.timestamp[0]):'')+' →</a>'+(Number.isFinite(target.timestamp?.[0])?'<button class="source-listen subtle" data-listen-time="'+target.timestamp[0]+'" aria-label="Listen to passage '+s.id+' at '+clock(target.timestamp[0])+'">Listen here</button>':''):'')+'</details>';}).join('')+'</div>';
 }).join('');
 if(!sessionAnswers(selected,session).length){const empty=document.createElement('p');empty.className='caption';empty.textContent=noLaptop?'No saved answers in this chat. Choose an earlier chat from Chat history.':'No answers in this chat yet. Choose an earlier chat from Chat history, or ask a question.';$('chat').append(empty);}
 $('chat').querySelectorAll('[data-listen-time]').forEach(button=>button.onclick=run(async()=>{if($('player').hidden)throw Error('This conversation has no saved audio to play.');$('player').currentTime=Number(button.dataset.listenTime);await $('player').play();}));
 $('chat').querySelectorAll('[data-retry-question]').forEach(button=>button.onclick=run(async()=>{
 const question=selected.chats[Number(button.dataset.retryQuestion)]?.question;if(typeof question!=='string')return;
 if(busy)throw Error('Please wait for the current AI task to finish.');
 await ask(question);
 }));
 $('chat').querySelectorAll('[data-edit-question]').forEach(button=>button.onclick=()=>{
 if(busy){toast('Wait for the current AI task to finish before editing another question.');return;}
 const question=selected.chats[Number(button.dataset.editQuestion)]?.question;if(typeof question!=='string')return;
 if($('question').value.trim()&&$('question').value!==question){toast('Your draft is still in the question box. Clear it first to reuse this question.');$('question').focus();return;}
 $('question').value=question;$('question').scrollIntoView({block:'center',behavior:'instant'});$('question').focus({preventScroll:true});
 toast('Edit your question, then Ask. Your previous answer will be kept.');
 });
 $('chat').querySelectorAll('[data-copy-answer]').forEach(button=>button.onclick=run(async()=>{
 const c=selected.chats[Number(button.dataset.copyAnswer)];
 const text=answerCopyText(c,selected);
 await navigator.clipboard.writeText(text);toast(c.kind==='clarification'?'Clarification copied.':'Answer and sources copied.');
 }));
 $('chat').querySelectorAll('[data-remove-answer]').forEach(button=>button.onclick=run(async()=>{
 const id=selected.id,index=Number(button.dataset.removeAnswer),expected=JSON.stringify(selected.chats[index]);
 const saved=await db.editAnswers(id,n=>{if(JSON.stringify(n.chats?.[index])!==expected)return false;const [answer]=n.chats.splice(index,1);n.removedAnswers=[...(n.removedAnswers||[]),answer];});
 if(saved&&selected?.id===id){selected=saved;renderChat();showSync();}scheduleSync();
}));
 if($('undo-answer'))$('undo-answer').onclick=run(async()=>{const id=selected.id,session=activeChat(id);const saved=await db.editAnswers(id,n=>{const index=removedSessionIndex(n,session);if(index<0)return false;n.chats=[...(n.chats||[]),n.removedAnswers.splice(index,1)[0]];});if(saved&&selected?.id===id){selected=saved;renderChat();showSync();}scheduleSync();});
 $('chat').querySelectorAll('[data-answer-source]').forEach(a=>a.onclick=e=>{e.preventDefault();$('editor').hidden=true;$('transcript-view').hidden=false;const target=$('source-'+a.dataset.answerSource);document.querySelectorAll('.source-highlight').forEach(el=>el.classList.remove('source-highlight'));target?.classList.add('source-highlight');target?.scrollIntoView({behavior:'smooth',block:'center'});target?.focus({preventScroll:true});});
}

function job(text){$('job').hidden=false;$('job').textContent=text;}
function switchChat(session){
 if(!selected)return;
 if(!emptyChatSessions.has(selected.id))emptyChatSessions.set(selected.id,new Set());
 emptyChatSessions.get(selected.id).add(session);
 activeChatSessions.set(selected.id,session);questionDrafts.select(chatDraftKey(selected.id,session));renderChat();$('question').focus();
}
$('new-chat').onclick=()=>switchChat(crypto.randomUUID());
$('chat-session').onchange=()=>switchChat($('chat-session').value);
async function localSummary(payload){
 const controller=new AbortController();$('cancel-ai').onclick=()=>controller.abort();
 try{
  if(noLaptop)throw Error('The phone summary engine is not installed yet. Generate this summary in recordit on your laptop.');
  let status;
  try{const r=await fetch('/api/status',{signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error();status=await r.json();}catch(e){if(controller.signal.aborted)throw e;throw Error('Start recordit on your laptop to run the offline summary engine. No internet is needed.');}
  if(payload.question&&!status.questions)throw Error('Restart the recordit local engine to enable Qwen questions. Your transcript is unchanged.');
  const response=await fetch('/api/summarise',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json','X-Record-Me-Token':status.token},body:JSON.stringify(payload)});
  if(!response.ok)throw Error(response.status===404?'Restart recordit to load the new offline summary engine.':await response.text());
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
  while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines){if(!line.trim())continue;const data=JSON.parse(line);if(data.type==='progress')job(data.text);else if(data.type==='error')throw Error(data.error);else if(data.type==='result')result=data.result;}if(done)break;}
  if(!result)throw Error('The offline summary was interrupted. Please retry.');return result;
 }catch(e){if(controller.signal.aborted)throw Error('AI task cancelled. Your transcript is unchanged.');throw e;}
 finally{controller.abort();busy=false;$('cancel-ai').hidden=true;$('summarise').disabled=noLaptop||!selected?.transcript?.trim();$('ask-submit').disabled=noLaptop;$('transcribe').disabled=$('player').hidden;$('attach-audio').disabled=false;}
}
function inference(type,payload){
 if(type==='summarise')requireGeneration();
 if(busy)throw Error('Please wait for the current AI task to finish.');busy=true;$('summarise').disabled=true;$('cancel-ai').hidden=false;$('ask-submit').disabled=true;$('transcribe').disabled=true;$('attach-audio').disabled=true;
 if(type==='summarise'){worker?.terminate();worker=null;return localSummary(payload);}
 const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const cleanup=()=>{busy=false;$('cancel-ai').hidden=true;$('summarise').disabled=noLaptop||!selected?.transcript?.trim();$('ask-submit').disabled=noLaptop;$('transcribe').disabled=$('player').hidden;$('attach-audio').disabled=false;worker?.removeEventListener('message',handler);worker?.removeEventListener('error',error);};
  const handler=({data})=>{if(data.type==='progress'){job(data.text);return;}if(data.id!==id)return;cleanup();data.type==='error'?reject(Error('Local AI could not finish: '+data.error)):resolve(data.result);};
  const error=()=>{cleanup();worker?.terminate();worker=null;reject(Error('The local AI worker stopped. Try a shorter recording or close other apps.'));};
  $('cancel-ai').onclick=()=>{cleanup();worker?.terminate();worker=null;reject(Error('AI task cancelled. Your transcript is unchanged.'));};
  try{
   if(!worker)worker=new Worker('/ai-worker.js',{type:'module'});
   worker.addEventListener('message',handler);worker.addEventListener('error',error);worker.postMessage({id,type,...payload});
  }catch(cause){cleanup();worker?.terminate();worker=null;reject(Error('The local AI worker could not start. Please retry.',{cause}));}
 });
}
// The laptop's offline engine (Parakeet split at pauses, with speakers) is used whenever recordit's local server has it;
// the in-browser Whisper model remains the fallback for phones and installs without the engine.
async function speechEngine(){
 if(noLaptop)return null;
 try{const r=await fetch('/api/status',{cache:'no-store',signal:AbortSignal.timeout(3000)});if(!r.ok)return null;const status=await r.json();return status.transcription?status:null;}catch{return null;}
}
function engineProgress(s){
 const pct=n=>Math.round((n||0)*100)+'%',time=s.elapsed>=60?Math.floor(s.elapsed/60)+' min '+s.elapsed%60+' s':s.elapsed+' s';
 if(s.state==='receiving'||s.state==='decoding')return 'Preparing the audio on this laptop…';
 return `Transcribing offline on this laptop · words ${pct(s.progress.speech)} · speakers ${pct(s.progress.speakers)} · ${time}. Keep recordit open.`;
}
async function engineTranscribe(blob,status){
 if(busy)throw Error('Please wait for the current AI task to finish.');
 busy=true;$('summarise').disabled=true;$('cancel-ai').hidden=false;$('ask-submit').disabled=true;$('transcribe').disabled=true;$('attach-audio').disabled=true;
 const headers={'X-Record-Me-Token':status.token},upload=new AbortController();let jobId=null,cancelled=false;
 $('cancel-ai').onclick=()=>{cancelled=true;upload.abort();if(jobId)fetch('/api/transcribe/'+jobId,{method:'DELETE',headers}).catch(()=>{});};
 try{
  job('Sending the recording to the offline engine on this laptop…');
  const start=await fetch('/api/transcribe',{method:'POST',headers,body:blob,signal:upload.signal});
  if(!start.ok)throw Error(await start.text());
  jobId=(await start.json()).id;
  while(true){
   await new Promise(resolve=>setTimeout(resolve,1000));
   const response=await fetch('/api/transcribe/'+jobId,{headers,cache:'no-store'});
   if(!response.ok)throw Error('The offline engine lost track of this transcription. Your recording is unchanged; please retry.');
   const state=await response.json();
   if(state.state==='done')return state.result;
   if(state.state==='error')throw Error(state.error+' Your recording and existing transcript are unchanged.');
   if(state.state==='cancelled'||cancelled)throw Error('Transcription cancelled. Your transcript is unchanged.');
   job(engineProgress(state));
  }
 }catch(error){if(cancelled)throw Error('Transcription cancelled. Your transcript is unchanged.');throw error;}
 finally{busy=false;$('cancel-ai').hidden=true;$('summarise').disabled=noLaptop||!selected?.transcript?.trim();$('ask-submit').disabled=noLaptop;$('transcribe').disabled=$('player').hidden;$('attach-audio').disabled=false;}
}
async function browserTranscribe(blob){
 job('Decoding your audio locally…');
 const ctx=new AudioContext();let decoded;
 try{decoded=await ctx.decodeAudioData(await blob.arrayBuffer());}finally{await ctx.close();}
 const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const mono=await offline.startRendering();
 job('Transcribing on this device. Keep the app open; longer recordings take time.');
 const result=await inference('transcribe',{audio:mono.getChannelData(0)});
 return {transcript:result.text.trim(),chunks:result.chunks||[],duration:decoded.duration,engine:'whisper-tiny-browser',engineLabel:'Whisper Tiny'};
}
// A new transcript never overwrites the old one: the current text is archived as an earlier version,
// and the result is saved against the latest stored conversation, not the snapshot taken before transcribing.
async function transcribe(){
 const noteId=selected.id;const audio=await db.getAudio(noteId);if(!audio?.blob)throw Error('This conversation has no audio.');
 let result;
 try{const engine=await speechEngine();result=engine?await engineTranscribe(audio.blob,engine):await browserTranscribe(audio.blob);}
 catch(e){job(e.message);throw e;}
 let fresh;
 try{fresh=await db.editAnswers(noteId,n=>{applyTranscription(n,result,{now:Date.now(),versionId:crypto.randomUUID()});applyMoments(n);autoFile(n);});}
 catch(e){job(e.message);throw e;}
 if(!fresh){const message='This conversation was deleted while transcribing, so the new transcript was not saved.';job(message);throw Error(message);}
 await refresh();scheduleSync();
 const gaps=fresh.speechGaps?.length||0,speakers=result.speakers?.length||0;
 const message='Transcript ready'+(speakers?` · ${speakers} speaker${speakers>1?'s':''} found; use Name speakers to name them`:'')+'.'+(gaps?` ${gaps} possible gap${gaps>1?'s are':' is'} marked for listening.`:'')+(result.speakerError?' Speakers could not be separated this time.':'')+(fresh.transcriptVersions?.length?' Your earlier transcript is kept under “Transcript version”.':'');
 if(selected?.id===noteId){await openNote(noteId);job(message);}else toast(message);
 if(!noLaptop)await summarise(fresh).catch(()=>{});
}
async function ask(questionOverride){
 requireGeneration();
 const note=selected;
 const session=note?activeChat(note.id):ORIGINAL_SESSION,draftKey=note?chatDraftKey(note.id,session):null;
 const fromComposer=typeof questionOverride!=='string',submittedDraft=$('question').value;
 const question=(fromComposer?submittedDraft:questionOverride).trim();if(!question)return;
 try{
 if(!note?.transcript?.trim())throw Error('Add a transcript before asking a question.');
 const key=sourceKey(note),started=performance.now();job('Qwen is reading “'+note.title+'” offline…');
 const result=await inference('summarise',{sources:sourcesFor(note),question});
  const ids=new Set(result.answers.flatMap(b=>b.evidence.map(e=>e.id)));
 const answer=result.answers.length?'': 'I couldn’t find enough supported evidence to answer that in this conversation. This does not prove it was never discussed; check the transcript.';
 const fresh=await db.editAnswers(note.id,n=>{if(sourceKey(n)!==key)return false;n.chats=[...(n.chats||[]),{question,sessionId:session,answer,bullets:result.answers,sources:sourcesFor(n).filter(s=>ids.has(s.id)),sourceKey:key,parts:result.parts,rejected:result.rejected,model:result.model||SUMMARY_MODEL,timings:result.timings,elapsedMs:Math.round(performance.now()-started)}];});
 if(!fresh)throw Error('The transcript changed while answering. Please ask again.');await refresh();scheduleSync();if(fromComposer)questionDrafts.complete(draftKey,submittedDraft);if(selected?.id===fresh.id){selected=fresh;renderChat();}
 const message='Answer saved in “'+fresh.title+'”. Check its numbered transcript links; Qwen can misinterpret the evidence.';
 job(message);if(!selected)toast(message);
 }catch(error){const message=(note?'Question for “'+note.title+'”: ':'')+(error.message||'The question could not be answered. Your previous answers were kept.');job(message);throw Error(message,{cause:error});}
}

function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),20000);}
async function saveToRonnie(blob,title,extension){
 const statusResponse=await fetch('/api/status',{cache:'no-store'});
 if(!statusResponse.ok)throw Error('Start recordit on this laptop to save to the Ronnie folder.');
 const status=await statusResponse.json();
 if(extension==='srt'&&(!Array.isArray(status.exportFormats)||!status.exportFormats.includes('srt')))throw Error('SRT export needs the updated local engine. Finish any recording, then restart the local recordit engine and try again. Reloading this page alone will not update the engine. Your transcript is unchanged.');
 if(!status.exportFolder)throw Error('Restart the recordit local engine to enable saving to the Ronnie folder.');
 const response=await fetch('/api/export?'+new URLSearchParams({title,extension}),{method:'PUT',headers:{'X-Record-Me-Token':status.token},body:blob});
 if(!response.ok)throw Error('Could not save to the Ronnie folder: '+await response.text()+'. Your recording is still saved in the app.');
 const result=await response.json();toast('Saved: '+result.path);
}
function exportData(n){return {version:1,title:n.title,category:n.category,secondaryCategories:n.secondaryCategories||[],tags:n.tags||[],collectionManual:n.collectionManual||false,collectionReason:n.collectionReason||null,created:n.created,duration:n.duration,transcript:n.transcript,chunks:n.chunks||[],generatedSummary:n.generatedSummary||null,chats:n.chats||[],removedAnswers:n.removedAnswers||[],bookmarks:n.bookmarks||[],comments:n.comments||[],speakerLabels:n.speakerLabels||[],highlights:n.highlights||[],audioFile:n.id+'.audio',audioType:n.audioType||null,...Object.fromEntries(['transcriptVersions','speechGaps','moments','titleAuto','transcriptVersionId','transcriptEngine','transcriptEngineLabel','transcribed','mic'].filter(key=>n[key]!==undefined&&n[key]!==null).map(key=>[key,n[key]]))};}
async function importFile(file){
 if(!file)return;let n={id:crypto.randomUUID(),title:file.name.replace(/\.[^.]+$/,''),category:'Personal',created:Date.now(),duration:0,transcript:'',chunks:[],chats:[],revision:1};
 if(/\.json$/i.test(file.name)){const backup=JSON.parse(await file.text());Object.assign(n,validateBackup(backup));Object.assign(n,restoreHistory(backup,n));if(backup.generatedSummary?.sourceKey===sourceKey(n)){try{n.generatedSummary={...validateSummary(backup.generatedSummary,sourcesFor(n)),sourceKey:sourceKey(n),parts:Number(backup.generatedSummary.parts)||1,created:Number(backup.generatedSummary.created)||Date.now(),model:SUMMARY_MODEL};}catch{}}}
 else if(isTextTranscript(file.name)){if(file.size>8000000)throw Error('Text file is too large. Split it before importing.');n.transcript=parseTextTranscript(await file.text());}
 else if(file.type.startsWith('audio/')||/\.(wav|mp3|m4a|mp4|webm|ogg|flac|audio)$/i.test(file.name)){checkAudioSize(file.size);await db.saveAudio(n.id,file);n.audioType=file.type;}
 else throw Error('Choose audio, a .txt/.md transcript, or a recordit .json backup.');
 autoFile(n);await db.save(n);await refresh();await openNote(n.id);scheduleSync();if(!n.transcript)toast('Audio imported. Choose Transcribe audio when you are ready.');else if(!noLaptop&&!n.generatedSummary&&!file.name.toLowerCase().endsWith('.json'))await summarise(n);
}
// The chosen microphone mode is remembered per browser; recordings store what was actually applied.
$('mic-mode').innerHTML=Object.entries(MIC_MODES).map(([value,mode])=>`<option value="${value}">${esc(mode.label)}</option>`).join('');
try{$('mic-mode').value=micMode(localStorage.micMode);}catch{}
$('mic-mode').onchange=()=>{try{localStorage.micMode=$('mic-mode').value;}catch{}};$('record-source').onchange=()=>{$('mic-mode-label').hidden=$('mic-help').hidden=$('record-source').value!=='microphone';};
function openRecorder(source='microphone'){
 if(recording)return $('record-dialog').showModal();
 if(busy){toast('Please wait for the AI task to finish before starting a recording.');return;}
 $('record-category').value='Unfiled';$('record-title').value='';$('record-source').value=source;
 $('record-dialog').showModal();beginRecording();
}
async function startRecording(){
 if(recording)throw Error('A recording is already active.');
 if(isNative)return startPhoneRecording();
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Recording requires HTTPS or localhost. Use a secure installation on your phone.');
 $('record-start').disabled=true;$('record-close').disabled=true;let mic=null;
 try{
  if($('record-source').value==='computer'){
   if(!navigator.mediaDevices.getDisplayMedia)throw Error('This browser cannot capture computer audio. Open recordit in desktop Chrome or Edge, or import an audio file.');
   screenStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:1},audio:true,systemAudio:'include'});
   if(!screenStream.getAudioTracks().length){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;throw Error('No audio was shared. Select the video’s browser tab and enable Share audio, then try again.');}
   stream=new MediaStream(screenStream.getAudioTracks());
   screenStream.getVideoTracks().forEach(track=>track.onended=()=>{if(recorder&&recorder.state!=='inactive')recorder.stop();});
  }else{$('record-status').textContent='Asking to use the microphone…';stream=await navigator.mediaDevices.getUserMedia(micConstraints($('mic-mode').value));mic=micSummary($('mic-mode').value,stream.getAudioTracks()[0]?.getSettings?.()||{});}
  if(typeof MediaRecorder==='undefined')throw Error('This browser cannot record audio. Update your phone, or open recordit in Safari.');const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));try{recorder=new MediaRecorder(stream,mime?{mimeType:mime}:{});}catch{recorder=new MediaRecorder(stream);}
  recording={id:crypto.randomUUID(),title:$('record-title').value.trim()||placeholderTitle(Date.now()),titleAuto:!$('record-title').value.trim(),category:$('record-category').value,collectionManual:$('record-category').value!=='Unfiled',created:Date.now(),duration:0,transcript:'',chunks:[],chats:[],revision:1,recording:true,audioType:recorder.mimeType,...(mic?{mic}:{})};
  await db.save(recording);let parts=[];elapsed=0;lastTick=Date.now();const note=recording;
  // Each few seconds only the new piece is added to the library's copy; if that copy is ever out of step,
  // the whole recording so far is saved instead, so nothing recorded is ever missing from it.
  let stored=0;
  recorder.ondataavailable=e=>{lastAudioAt=Date.now();if(e.data.size){const part=e.data;parts.push(part);const blob=new Blob(parts,{type:recorder.mimeType});saving=saving.then(async()=>{if(await db.appendAudio(note.id,part,stored,recorder.mimeType))stored+=part.size;else{await db.saveAudio(note.id,blob);stored=blob.size;}note.duration=elapsed;await db.save(note);}).catch(error=>{toast('Storage error: finish and export your audio now. '+error.message);download(blob,note.id+'.'+(blob.type.includes('mp4')?'m4a':'webm'));});}};
  recorder.onerror=()=>toast('The microphone reported an error. Finish and save the available audio.');
  recorder.onstop=()=>run(async()=>{endMoments();await saving;note.recording=false;note.duration=elapsed;await commit(note);stream.getTracks().forEach(t=>t.stop());screenStream?.getTracks().forEach(t=>t.stop());screenStream=null;await wakeLock?.stop();wakeLock=null;clearInterval(timerInterval);recording=null;recorder=null;$('record-dialog').close();resetRecorder();await openNote(note.id);toast(onPhoneWeb?'Recording saved on this phone. Choose Send to laptop when you’re ready for the transcript.':'Recording saved on this device.');if(localStorage.modelsReady==='true'||await speechEngine())await transcribe();})();
  recorder.start(5000);wakeLock=keepAwake({onChange:showAwake});
  // If the microphone is taken away while live words are running, live words stop so the recording can carry on.
  stream.getAudioTracks()[0]?.addEventListener('mute',()=>{if(document.visibilityState==='visible')endLiveWords('Live words were switched off to keep your recording safe.');});
  // Highlight, Note and live words are extras: a problem with them must never stop the recording.
  try{beginMoments(note,{live:$('record-source').value==='microphone'});}catch(error){console.error(error);}
  timerInterval=setInterval(()=>{const now=Date.now();if(recorder?.state==='recording')elapsed+=(now-lastTick)/1000;lastTick=now;$('timer').textContent=clock(elapsed);},250);
  $('record-start').hidden=true;$('record-stop').hidden=false;$('record-pause').hidden=false;$('record-close').disabled=true;$('record-title').disabled=true;$('record-category').disabled=true;$('record-source').disabled=true;$('mic-mode').disabled=true;$('record-heading').textContent='Just be here. We’re listening.';$('record-status').textContent='Recording'+(mic?' · '+MIC_MODES[mic.mode].label.split(' · ')[0]+' mic':'')+' · audio saved locally every few seconds';
 }catch(e){stream?.getTracks().forEach(t=>t.stop());screenStream?.getTracks().forEach(t=>t.stop());screenStream=null;recording=null;recorder=null;throw e;}finally{$('record-start').disabled=false;$('record-close').disabled=Boolean(recording);}
}
async function startPhoneRecording(){
 $('record-start').disabled=true;$('record-close').disabled=true;
 const note={id:crypto.randomUUID(),title:$('record-title').value.trim()||placeholderTitle(Date.now()),titleAuto:!$('record-title').value.trim(),category:$('record-category').value,collectionManual:$('record-category').value!=='Unfiled',created:Date.now(),duration:0,transcript:'',chunks:[],chats:[],revision:1,recording:true,audioType:'audio/mp4'};
 try{
  await db.save(note);await startNative(note.id);recording=note;elapsed=0;lastTick=Date.now();
  recorder={state:'recording',pause:()=>run(async()=>{await pauseNative(true);recorder.state='paused';})(),resume:()=>run(async()=>{await pauseNative(false);lastTick=Date.now();recorder.state='recording';})(),stop:()=>run(async()=>{
   try{endMoments();const audio=await stopNative(note.id);note.nativeURI=audio.uri;note.duration=audio.duration;await db.saveAudio(note.id,audio.blob);note.recording=false;await commit(note);clearInterval(timerInterval);recording=null;recorder=null;$('record-dialog').close();resetRecorder();await openNote(note.id);await transcribe();}
   catch(error){$('record-stop').disabled=false;throw error;}
  })()};
  timerInterval=setInterval(()=>{const now=Date.now();if(recorder?.state==='recording')elapsed+=(now-lastTick)/1000;lastTick=now;$('timer').textContent=clock(elapsed);},250);
  beginMoments(note,{live:false});
  $('record-start').hidden=true;$('record-stop').hidden=false;$('record-pause').hidden=false;$('record-close').disabled=true;$('record-title').disabled=true;$('record-category').disabled=true;$('record-source').disabled=true;$('record-heading').textContent='Recording on your phone.';$('record-status').textContent='Native recorder active · finish here when you return';
 }catch(error){if(!recording){note.recording=false;await db.save(note);}throw error;}finally{$('record-start').disabled=false;$('record-close').disabled=Boolean(recording);}
}
// Highlight and Note while recording, kept by their time in the audio (moments.js), and live words where the
// device can provide them. Live words are only a preview: the recording always comes first.
const liveWordsSupported=!isNative&&!!(globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition);
let liveWords=null,liveWanted=false,lastAudioAt=0,momentWatch=null,noteMomentAt=0;
function showMomentCount(note){const marked=restoreMoments(note.moments),h=marked.filter(m=>m.kind==='highlight').length,n=marked.length-h;$('moment-count').hidden=!marked.length;$('moment-count').textContent=[h&&`${h} highlight${h>1?'s':''}`,n&&`${n} note${n>1?'s':''}`].filter(Boolean).join(' · ')+' marked';}
function addLiveLine(text,className,t){const line=document.createElement('p');line.textContent=text;if(className)line.className=className;if(Number.isFinite(t)){line.dataset.t=t;line.dataset.added=Date.now();line.tabIndex=0;line.setAttribute('role','button');line.setAttribute('aria-pressed','false');}$('live-words').append(line);while($('live-words').children.length>40)$('live-words').firstChild.remove();$('live-words').scrollTop=$('live-words').scrollHeight;return line;}
function endLiveWords(message){liveWanted=false;commitInterim();if(!liveWords)return;liveWords.stop();liveWords=null;if(message)addLiveLine(message,'live-note');}
function pauseLive(){commitInterim();if(!liveWords)return;liveWords.stop();liveWords=null;addLiveLine('Paused','live-note');}
function resumeLive(){if(liveWanted&&!liveWords&&recording&&recorder?.state==='recording')startLive();}
function beginMoments(note,{live=true}={}){
 note.moments=restoreMoments(note.moments);lastAudioAt=0;lastHighlightAt=-Infinity;$('moment-actions').hidden=false;$('live-words').replaceChildren();$('live-words-option').hidden=true;showMomentCount(note);
 if(!live||!$('live-words-on').checked)return;
 $('live-words').hidden=false;liveWanted=true;
 if(liveWordsSupported)addLiveLine('Tap any line to highlight it.','live-note');
 startLive();
 // If the recording stops receiving audio while live words run, live words stop and the recording carries on.
 momentWatch=setInterval(()=>{if(liveWords&&lastAudioAt&&recorder?.state==='recording'&&document.visibilityState==='visible'&&Date.now()-lastAudioAt>15000)endLiveWords('Live words were switched off to keep your recording safe.');},3000);
}
function startLive(){
 const unavailable=()=>{liveWords=null;liveWanted=false;if(!$('live-words').querySelector('p:not(.live-note)'))addLiveLine('Live words aren’t available in this browser. Your full transcript comes after you finish.','live-note');};
 if(!liveWordsSupported)return unavailable();
 interimShown=0;interimSaid=null;
 liveWords=startLiveWords({onLine:finishLine,onInterim:showInterim,onUnavailable:unavailable});
}
// Words still in progress (grey). A phone can keep a whole stretch of talk in progress without finishing it, so what
// is showing becomes its own line at each pause, or when tapped, and the words after it carry on below. Each line is
// placed at the moment its first words appeared, so a tap marks the passage it was said in.
let interimLine=null,interimSaid=null,interimShown=0,interimHead='',interimPause=null;
function showInterim(text){
 clearTimeout(interimPause);
 if(interimShown&&!text.startsWith(interimHead))interimShown=0;   // a new stretch, not more of the last one
 const fresh=text.slice(interimShown).trim();
 if(!fresh){interimLine?.remove();interimLine=null;return;}
 interimSaid??=elapsed;
 if(!interimLine){interimLine=document.createElement('p');interimLine.className='interim';interimLine.tabIndex=0;interimLine.setAttribute('role','button');$('live-words').append(interimLine);}
 interimLine.textContent=fresh;interimLine.dataset.upto=text.length;interimLine.dataset.head=text.slice(0,12);$('live-words').scrollTop=$('live-words').scrollHeight;
 interimPause=setTimeout(commitInterim,2000);
}
function commitInterim(){
 clearTimeout(interimPause);if(!interimLine)return null;
 const text=interimLine.textContent;interimShown=Number(interimLine.dataset.upto)||0;interimHead=interimLine.dataset.head||'';interimLine.remove();interimLine=null;
 const line=addLiveLine(text,'',interimSaid??Math.max(0,elapsed-2));interimSaid=null;return line;
}
function finishLine(text){
 clearTimeout(interimPause);interimLine?.remove();interimLine=null;
 const rest=(interimShown&&text.startsWith(interimHead)?text.slice(interimShown):text).trim();
 if(rest)addLiveLine(rest,'',interimSaid??Math.max(0,elapsed-2));
 interimSaid=null;interimShown=0;
}
function endMoments(){endLiveWords();liveWanted=false;clearInterval(momentWatch);momentWatch=null;$('moment-actions').hidden=true;$('moment-note-form').hidden=true;$('moment-count').hidden=true;$('live-words').hidden=true;$('live-words-option').hidden=!liveWordsSupported;}
function markMoment(kind,text='',t=elapsed,line=null){
 const note=recording;if(!note)return;const id=crypto.randomUUID();
 note.moments=addMoment(note.moments,{t,kind,text,id});saving=saving.then(()=>db.save(note)).catch(()=>{});showMomentCount(note);
 if(kind!=='highlight')return;
 if(line){line.classList.add('marked');line.dataset.moment=id;line.setAttribute('aria-pressed','true');}
}
function toggleLineHighlight(line){
 const note=recording;if(!note)return;
 if(line.dataset.moment){note.moments=removeMoment(note.moments,line.dataset.moment);delete line.dataset.moment;line.classList.remove('marked');line.setAttribute('aria-pressed','false');saving=saving.then(()=>db.save(note)).catch(()=>{});showMomentCount(note);}
 else{markMoment('highlight',line.textContent,Number(line.dataset.t),line);lastHighlightAt=elapsed;}
}
// A tap on grey words in progress makes them a line of their own and highlights it.
const tapped=target=>{const line=target.closest('p[data-t], p.interim');return line?.classList.contains('interim')?commitInterim():line;};
$('live-words').onclick=event=>{const line=tapped(event.target);if(line)toggleLineHighlight(line);};
$('live-words').onkeydown=event=>{if(event.key!=='Enter'&&event.key!==' ')return;const line=tapped(event.target);if(line){event.preventDefault();toggleLineHighlight(line);}};
// The screen staying on, said plainly; and if recordit was left or the phone locked anyway, how long for.
function showAwake(how){$('awake-note').hidden=how!=='none';$('awake-note').textContent='Keep your screen on until you finish: this phone may lock it, and recordit can’t hear while it’s locked.';}
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{
 if(!recording||isNative)return;
 if(document.visibilityState==='hidden'){hiddenAt=Date.now();return;}
 const away=hiddenAt?(Date.now()-hiddenAt)/1000:0;hiddenAt=0;lastAudioAt=Date.now();
 if(away>=3){$('away-note').hidden=false;$('away-note').textContent='recordit was in the background for '+clock(away)+'. The phone may not have let it hear during that time.';}
 resumeLive();
});
$('live-words-option').hidden=!liveWordsSupported;try{$('live-words-on').checked=localStorage.liveWords!=='off';}catch{}
$('live-words-on').onchange=()=>{try{localStorage.liveWords=$('live-words-on').checked?'on':'off';}catch{}};
// ★ Highlight turns yellow for a moment and says what it did. Pressed again with nothing new said, it doesn't mark twice.
let highlightFlash=null,lastHighlightAt=-Infinity;
function flashHighlight(text){const button=$('mark-highlight');button.textContent=text;button.classList.add('done');clearTimeout(highlightFlash);highlightFlash=setTimeout(()=>{button.textContent='★ Highlight';button.classList.remove('done');},1600);}
$('mark-highlight').onclick=()=>{
 if(elapsed-lastHighlightAt<4)return flashHighlight('★ Already highlighted');   // a second press straight after is a check, not a new highlight
 const last=[...$('live-words').querySelectorAll('p[data-t]')].at(-1),recent=last&&!last.dataset.moment&&Date.now()-Number(last.dataset.added)<8000?last:null;
 const line=commitInterim()??recent;
 if(line){markMoment('highlight',line.textContent,Number(line.dataset.t),line);lastHighlightAt=elapsed;return flashHighlight('★ Highlighted');}
 if(elapsed-lastHighlightAt<8)return flashHighlight('★ Already highlighted');
 markMoment('highlight');lastHighlightAt=elapsed;flashHighlight('★ Highlighted');
};
$('mark-note').onclick=()=>{noteMomentAt=elapsed;$('moment-note-form').hidden=false;$('moment-note-text').value='';$('moment-note-text').focus();};
$('moment-note-cancel').onclick=()=>{$('moment-note-form').hidden=true;};
$('moment-note-form').onsubmit=event=>{event.preventDefault();const text=$('moment-note-text').value.trim();if(text)markMoment('note',text,noteMomentAt);$('moment-note-form').hidden=true;};
// On a phone, a recording reaches the laptop through Google Drive: the share sheet sends the audio and its marked
// moments to the "recordit inbox" folder, where the laptop transcribes it and places the moments.
// The recording and its highlights and notes, named alike (with when it was made, so names never clash).
function laptopFiles(note,audio){
 const made=new Date(note.created||Date.now()),two=n=>String(n).padStart(2,'0'),stamp=`${made.getFullYear()}-${two(made.getMonth()+1)}-${two(made.getDate())} ${two(made.getHours())}${two(made.getMinutes())}`;
 const base=((note.title||'Recording').replace(/[\\/:*?"<>|]+/g,'-').trim().slice(0,90)||'Recording')+' · '+stamp;
 const type=audio.blob.type||note.audioType||'audio/mp4',ext=/mp4|m4a|aac/.test(type)?'m4a':/ogg/.test(type)?'ogg':'webm';
 const marks={app:'recordit',version:1,title:note.title,titleAuto:note.titleAuto===true,created:note.created,duration:note.duration,moments:restoreMoments(note.moments)};
 return [new File([audio.blob],`${base}.${ext}`,{type}),new File([JSON.stringify(marks)],`${base}.marks.json`,{type:'application/json'})];
}
// The fallback: the phone's share sheet, to put both files in Google Drive by hand.
async function shareToLaptop(){
 const note=selected,audio=note&&await db.getAudio(note.id);if(!audio?.blob)throw Error('This conversation has no audio to send.');
 const files=laptopFiles(note,audio);
 if(navigator.canShare?.({files})){
  try{await navigator.share({files,title:note.title});}catch(error){if(error.name==='AbortError')return;throw error;}
  toast('In the share sheet choose Drive, then the recordit inbox folder.');
 }else{for(const file of files)download(file,file.name);toast('Saved. Put both files in the recordit inbox folder in Google Drive.');}
}
// Send to laptop: straight into Google Drive, where the laptop picks it up. Progress and problems stay under the button.
function sendSay(text,problem=false){$('send-status').hidden=false;$('send-status').textContent=text;$('send-status').classList.toggle('problem',problem);$('send-share').hidden=!problem;}
function showSent(note){if(!onPhoneWeb)return;$('send-share').hidden=true;$('send-status').classList.remove('problem');$('send-status').hidden=!note?.sentToLaptop;if(note?.sentToLaptop)$('send-status').textContent='Sent to your laptop ✓ '+date(note.sentToLaptop);}
async function sendDirect(note,signedIn){
 $('send-laptop').disabled=true;
 try{
  sendSay('Signing in to Google…');
  const token=await signedIn,audio=await db.getAudio(note.id);if(!audio?.blob)throw Error('This conversation has no audio to send.');
  sendSay('Sending to your laptop… 0%');
  await sendToDrive(laptopFiles(note,audio),{token,onProgress:share=>sendSay('Sending to your laptop… '+Math.round(share*100)+'%')});
  note.sentToLaptop=Date.now();await commit(note);
  if(selected?.id===note.id)sendSay('Sent ✓ Your laptop will transcribe it in a few minutes, while it’s on with recordit running.');
 }catch(error){console.error(error);if(selected?.id===note.id)sendSay(error.message||'Sending didn’t work. Your recording is still on this phone.',true);}
 finally{$('send-laptop').disabled=false;}
}
$('send-laptop').hidden=!onPhoneWeb;
$('send-laptop').onclick=()=>{
 const note=selected;if(!note||$('send-laptop').disabled)return;
 if(note.sentToLaptop&&!confirm('This recording was already sent to your laptop. Send it again?'))return;
 sendDirect(note,driveToken());   // asked for straight from the tap, so the Google window is allowed to open
};
$('send-share').onclick=run(shareToLaptop);
if(onPhoneWeb)loadGoogleSignIn();
function resetRecorder(){$('mic-mode').disabled=false;$('record-start').hidden=true;$('record-close').hidden=true;$('record-stop').hidden=true;$('record-stop').disabled=false;$('record-pause').hidden=true;$('record-close').disabled=false;$('record-title').disabled=false;$('record-category').disabled=false;$('record-source').disabled=false;$('record-heading').textContent='Recording';$('record-status').textContent='';$('record-title').value='';$('timer').textContent='00:00';$('record-pause').textContent='Pause';$('awake-note').hidden=$('away-note').hidden=true;}
async function prepare(){
 if(onPhoneWeb){$('model-status').textContent='On this phone, transcripts are made by your laptop: open a recording and choose Send to laptop.';return;}
 if(isNative){localStorage.modelsReady='true';$('model-status').textContent=nativeAiUnavailable+' Speech assets are bundled; physical-device transcription is not yet verified.';return;}
 $('prepare').disabled=true;localStorage.removeItem('modelsReady');
 try{
  if(!('serviceWorker'in navigator))throw Error('This browser cannot install the offline app.');
  await navigator.serviceWorker.ready;const res=await fetch('/assets.json');if(!res.ok)throw Error('Run the model setup on the laptop first.');const manifest=await res.json();
  const cache=await caches.open('record-me-models-v1');let done=0;const total=manifest.files.reduce((s,f)=>s+f.bytes,0);
  for(const file of manifest.files){$('model-status').textContent=`Saving offline files · ${Math.round(done/total*100)}% · ${Math.round(total/1e6)} MB total`;if(!await cache.match(file.url)){const r=await fetch(file.url);if(!r.ok)throw Error('Could not download '+file.url);await cache.put(file.url,r);}done+=file.bytes;}
  await cache.put('/assets.json',new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
  await navigator.storage?.persist?.();localStorage.modelsReady='true';$('model-status').textContent='Offline files saved. Speech and AI run on this device. A first run can take a moment.';toast('Offline models are ready on this device.');
 }finally{$('prepare').disabled=false;}
}
function scheduleSync(){if(!noLaptop)transcriptSaver.schedule();clearTimeout(scheduleSync.timer);scheduleSync.timer=setTimeout(()=>run(sync)(),2000);}
function showBackupConflicts(items){
 $('backup-conflicts').hidden=!items.length;$('backup-conflict-list').replaceChildren();
 for(const item of items){
  const row=document.createElement('div');row.className='backup-conflict';
  const title=document.createElement('strong');title.textContent=item.title;
  const reason=document.createElement('p');reason.className='caption';reason.textContent=item.reason;
  const file=document.createElement('small');file.textContent=item.folder+' · '+item.file;
  const open=document.createElement('button');open.type='button';open.textContent='Open conversation';open.onclick=run(async()=>{$('settings').close();await openNote(item.id);});
  const keep=document.createElement('button');keep.type='button';keep.textContent='Keep both · save separate copy';keep.disabled=item.folder!==activeBackupFolder;keep.title='Preserve the existing backup and use a separate file for future copies.';
  keep.onclick=run(async()=>{keep.disabled=true;try{
   if(item.folder!==activeBackupFolder)throw Error('The backup folder changed. Run backup again to refresh this report.');
   await saving;const note=await db.forkBackup(item.id,item.targetId);if(selected?.id===note.id)selected=note;
   await driveBackup.flush();await sync();showSync();toast('Separate backup queued. The previous copy is preserved.');
  }finally{if(keep.isConnected)keep.disabled=item.folder!==activeBackupFolder;}});
  row.append(title,reason,file,open,keep);$('backup-conflict-list').append(row);
 }
}
const driveBackup=createDriveBackup({list:db.list,getAudio:db.getAudio,markBacked:db.markBacked,exportData,enabled:()=>!noLaptop&&libraryStorage.getItem('backupEnabled')==='true',onStatus:text=>{$('drive-status').textContent=text;},onDestination:setBackupDestination,onConflicts:showBackupConflicts,onSaved:(id,revision,audioBacked,folder,targetId)=>{if(selected?.id===id){selected.backedRevision=revision;selected.backedFolder=folder;selected.backedTargetId=targetId;if(selected.revision===revision&&(selected.backupId||id)===targetId){selected.audioBacked=audioBacked;selected.audioBackedFolder=folder;selected.audioBackedTargetId=targetId;}showSync();}}});
async function sync(){
 if(noLaptop){$('drive-status').textContent='Direct phone Drive backup is not activated. Google app registration and folder permission are still required.';return;}
 // Bring in your other laptops' changes first, so this laptop's own edits are copied on top of them.
 const pulled=await librarySync.flush().catch(error=>{$('drive-status').textContent=error.message+' Will retry while recordit is open.';return null;});
 await driveBackup.flush();await refresh();
 if(pulled?.changed.size){
  const fresh=selected&&pulled.changed.has(selected.id)&&notes.find(n=>n.id===selected.id);
  if(fresh&&$('editor').hidden){selected=fresh;if(document.activeElement!==$('title'))$('title').value=fresh.title;if(document.activeElement!==$('tags'))$('tags').value=(fresh.tags||[]).join(', ');renderTranscript();renderSummary();renderChat();showFiling();}
  toast([pulled.added&&`${pulled.added} conversation${pulled.added>1?'s':''} added from your other laptop`,pulled.updated&&`${pulled.updated} updated from your other laptop`,pulled.kept&&`${pulled.kept} changed on both laptops: both versions kept`].filter(Boolean).join(' · ')+'.');
 }
 showSync();
}
// Check for your other laptops' changes when you come back to recordit (it also checks every minute).
const librarySync=createLibrarySync({list:db.list,getAudio:db.getAudio,syncAdd:db.syncAdd,syncUpdate:db.syncUpdate,forkBackup:db.forkBackup,enabled:()=>!noLaptop&&libraryStorage.getItem('backupEnabled')==='true',storage:libraryStorage,onStatus:text=>{$('drive-status').textContent=text;}});
if(!noLaptop)addEventListener('focus',()=>scheduleSync());
addEventListener('library-settings-error',event=>toast('A library setting could not be saved: '+(event.detail?.message||'the recordit engine did not respond')+'. Reload to try again.'));
async function settings(){
 $('settings').showModal();$('backup-enabled').checked=libraryStorage.getItem('backupEnabled')==='true';$('model-status').textContent=noLaptop?nativeAiUnavailable:localStorage.modelsReady==='true'?'Speech and question-answering files were saved here. Summaries use the offline laptop engine; keep recordit running.':'Prepare speech and question-answering files for offline use (133 MB). Summaries use the laptop engine.';
 const estimate=await navigator.storage?.estimate?.();$('storage-status').textContent=estimate?`${Math.round(estimate.usage/1e6)} MB used · ${Math.round(estimate.quota/1e6)} MB available quota`:'Storage estimate unavailable.';
 if(noLaptop){$('drive-status').textContent='Direct phone Drive backup is not activated. Recordings stay on this device.';}else try{const status=await(await fetch('/api/status',{cache:'no-store'})).json();setBackupDestination(status.backupFolder);$('drive-status').textContent=status.available?'Laptop Drive bridge is available. Backups contain audio and a readable JSON transcript.':'Google Drive is not accessible on the laptop yet.';}catch{$('drive-status').textContent='Laptop bridge unavailable. Recordings remain on this device.';}
}
$('new').onclick=()=>openRecorder();$('record-hero').onclick=()=>openRecorder();$('new-tab').onclick=()=>openRecorder('computer');$('new-tab').hidden=noLaptop||!navigator.mediaDevices?.getDisplayMedia;$('record-close').onclick=()=>{if(!recording)$('record-dialog').close();};$('record-dialog').addEventListener('cancel',e=>{if(recording||$('record-start').disabled)e.preventDefault();});
// recordit is a web page, so the microphone permission belongs to the browser it is open in.
function micBlockedHelp(agent){
 const browser=/CriOS/.test(agent)?'Chrome':/FxiOS/.test(agent)?'Firefox':/EdgiOS/.test(agent)?'Edge':'Safari';
 if(/iPhone|iPad|iPod/.test(agent)||/Macintosh/.test(agent)&&navigator.maxTouchPoints>1)return browser==='Safari'?'Safari isn’t allowed to use the microphone. On your iPhone: Settings → Apps → Safari → Settings for Websites → Microphone → Allow. Then close recordit, open it again and tap Start.':browser+' isn’t allowed to use the microphone. On your iPhone: Settings → Apps → '+browser+' → turn Microphone on. Then close recordit, open it again and tap Start.';
 return 'This browser isn’t allowed to use the microphone. Click the icon at the left of the address bar, allow the microphone for this site, then try again.';
}
async function beginRecording(){
 $('record-start').hidden=$('record-close').hidden=true;$('record-status').textContent=$('record-source').value==='computer'?'Choose the tab with the video, and tick Share tab audio.':'Starting…';
 try{await startRecording();}catch(e){$('record-start').hidden=$('record-close').hidden=false;console.error(e);const why=e?.name==='NotAllowedError'?micBlockedHelp(navigator.userAgent):e?.name==='NotFoundError'?'No microphone was found.':(e?.message||'Something went wrong.');$('record-status').textContent='Recording didn’t start. '+why;}
}
$('record-start').onclick=beginRecording;$('record-stop').onclick=()=>{if(!recorder)return;$('record-stop').disabled=true;recorder.stop();};$('record-pause').onclick=()=>{if(recorder.state==='recording'){recorder.pause();pauseLive();$('record-pause').textContent='Resume';$('record-status').textContent='Paused · nothing is being recorded';}else{recorder.resume();lastTick=lastAudioAt=Date.now();$('record-pause').textContent='Pause';$('record-status').textContent='Recording · audio saved every few seconds';resumeLive();}};
$('back').onclick=()=>{$('detail').hidden=true;$('library').hidden=false;$('player').pause();questionDrafts.select(null);selected=null;refresh();};
function bindFilters(){document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;$('breadcrumb').textContent=filter==='All'?'All conversations':filter;$('detail').hidden=true;$('library').hidden=false;$('player').pause();questionDrafts.select(null);selected=null;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderList();});}
$('library-sort').onchange=renderList;$('library-search-field').onchange=renderList;$('library-search-collection').onchange=renderList;$('search').oninput=renderList;$('import').onclick=()=>$('file').click();$('file').onchange=run(async e=>{try{await importFile(e.target.files[0]);}finally{e.target.value='';}});
$('title').oninput=run(async()=>{selected.title=$('title').value.trim()||'Untitled conversation';selected.titleAuto=false;await commit();});$('category').onchange=run(async()=>{selected.category=$('category').value;selected.collectionManual=true;$('auto-file').checked=false;await commit();});
$('tags').oninput=run(async()=>{selected.tags=$('tags').value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,30);await commit();});$('auto-file').onchange=run(async()=>{selected.collectionManual=!$('auto-file').checked;await commit();});
$('correction-cancel').onclick=()=>{if($('correction-form').dataset.saving!=='true')$('correction-dialog').close();};
$('correction-dialog').oncancel=e=>{if($('correction-form').dataset.saving==='true')e.preventDefault();};
$('speaker-cancel').onclick=()=>{if($('speaker-form').dataset.saving!=='true')$('speaker-dialog').close();};
$('speaker-dialog').oncancel=e=>{if($('speaker-form').dataset.saving==='true')e.preventDefault();};
$('comment-cancel').onclick=()=>{if($('comment-form').dataset.saving!=='true')$('comment-dialog').close();};
$('comment-dialog').oncancel=e=>{if($('comment-form').dataset.saving==='true')e.preventDefault();};
let transcriptEditSnapshot=null;
$('edit').onclick=()=>{if($('save-transcript').disabled)return;transcriptEditSnapshot={id:selected.id,key:correctionKey(selected)};$('transcript-edit').value=selected.transcript;$('editor').hidden=false;$('transcript-view').hidden=true;};
$('cancel-transcript-edit').onclick=()=>{if($('save-transcript').disabled)return;transcriptEditSnapshot=null;$('editor').hidden=true;$('transcript-view').hidden=false;};
$('save-transcript').onclick=run(async()=>{
 const snapshot=transcriptEditSnapshot,text=$('transcript-edit').value;if(!snapshot||snapshot.id!==selected?.id)throw Error('Reopen this transcript editor before saving.');if($('save-transcript').disabled)return;$('save-transcript').disabled=true;
 try{let found=false;const fresh=await db.editAnswers(snapshot.id,n=>{found=true;const corrected=replaceTranscript(n,snapshot.key,text);if(corrected===n)return false;Object.assign(n,corrected);delete n.generatedSummary;autoFile(n);});
 if(!found)throw Error('This conversation no longer exists.');if(fresh){await refresh();scheduleSync();}if(selected?.id===snapshot.id&&transcriptEditSnapshot===snapshot){if(fresh)selected=fresh;transcriptEditSnapshot=null;$('editor').hidden=true;$('transcript-view').hidden=false;renderTranscript();renderWordSearch();renderSummary();renderChat();showFiling();}toast(fresh?'Text saved. Earlier answers are kept; check them against the corrected transcript.':'No text changes to save.');
 }finally{$('save-transcript').disabled=false;}
});
// Transcribing again first explains that the current transcript is kept.
$('transcribe').onclick=()=>{if(!selected)return;if(selected.transcript?.trim())$('transcribe-dialog').showModal();else run(transcribe)();};
$('transcribe-cancel').onclick=()=>$('transcribe-dialog').close();
$('transcribe-form').onsubmit=event=>{event.preventDefault();$('transcribe-dialog').close();run(transcribe)();};$('summarise').onclick=run(()=>summarise());$('ask-form').onsubmit=e=>{e.preventDefault();run(ask)();};document.querySelectorAll('[data-question]').forEach(b=>b.onclick=()=>{$('question').value=b.dataset.question;run(ask)();});
$('export-srt').onclick=run(()=>saveToRonnie(new Blob([subtitleText(selected.chunks)],{type:'application/x-subrip;charset=utf-8'}),selected.title,'srt'));
$('export-text').onclick=run(()=>saveToRonnie(new Blob([JSON.stringify(exportData(selected),null,2)],{type:'application/json'}),selected.title,'json'));
$('export-transcript').onclick=run(async()=>{if(!selected.transcript?.trim()){toast('Transcribe the recording first.');return;}const summary=selected.generatedSummary?.sourceKey===sourceKey(selected)?selected.generatedSummary:null;await saveToRonnie(new Blob([readableMarkdown(selected,summary,labelledTranscript(selected))],{type:'text/markdown;charset=utf-8'}),selected.title,'md');});
$('export-audio').onclick=run(async()=>{const note=selected,audio=await db.getAudio(note.id);if(audio?.blob)await saveToRonnie(audio.blob,note.title,audio.blob.type.includes('mp4')?'m4a':audio.blob.type.includes('wav')?'wav':audio.blob.type.includes('mpeg')?'mp3':audio.blob.type.includes('ogg')?'ogg':audio.blob.type.includes('flac')?'flac':'webm');});
$('delete').onclick=run(async()=>{if(busy)throw Error('Wait for the AI task to finish before deleting.');if(!confirm('Delete this conversation and its audio from this device? Export first if needed. Drive backups and your other laptops keep their copies, and it will not come back here.'))return;const deletedId=selected.id;ignoreTarget(selected.backupId||deletedId,libraryStorage);await db.remove(deletedId);for(const entry of sessionEntries(selected,activeChat(deletedId),emptyChatSessions.get(deletedId)||[]))questionDrafts.forget(chatDraftKey(deletedId,entry.id));activeChatSessions.delete(deletedId);emptyChatSessions.delete(deletedId);$('back').click();});
$('settings-open').onclick=run(settings);$('settings-close').onclick=()=>$('settings').close();$('prepare').onclick=run(prepare);$('backup-enabled').onchange=()=>{libraryStorage.setItem('backupEnabled',String($('backup-enabled').checked));scheduleSync();};$('sync-now').onclick=run(async()=>{if(libraryStorage.getItem('backupEnabled')!=='true')throw Error('Enable automatic backup first.');await sync();});$('persist').onclick=run(async()=>toast(await navigator.storage?.persist?.()?'Persistent storage granted. Keep backups too.':'Browser did not grant persistence. Keep exported backups.'));
window.addEventListener('online',scheduleSync);window.addEventListener('beforeunload',e=>{if(recording){e.preventDefault();e.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording&&!noLaptop)toast('Keep the app visible while recording. Mobile browsers may suspend the microphone.');});
if(!isNative&&'serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>toast('Offline shell installation failed: '+e.message));
if(noLaptop){$('ask-submit').disabled=true;document.querySelectorAll('[data-question]').forEach(b=>b.disabled=true);$('ai-caption').textContent=isNative?'On-device AI unavailable':'AI runs on your laptop';$('ai-help').textContent=nativeAiUnavailable;$('summary-help').textContent=nativeAiUnavailable;$('record-source-label').hidden=true;$('source-help').hidden=true;$('backup-enabled').disabled=true;}
if(onPhoneWeb){$('offline-help').textContent='On this phone recordit records and keeps your recordings. Transcripts are made by recordit on your laptop: open a recording and choose Send to laptop.';$('record-caption').textContent='Keep recordit open and your screen on while recording. Your audio is saved on this phone as you record.';}
if(isNative){$('offline-help').textContent='Speech assets are bundled, but physical-device transcription has not been verified. This build does not include an on-device summary or AI answer engine.';$('mic-mode-label').hidden=true;$('mic-help').hidden=true;localStorage.modelsReady='true';$('record-caption').textContent='Native background audio is configured. This development build still needs a physical-device lock-screen test. Do not force-close the app while recording.';}
function renderCollections(){
 const names=[...new Set(['Unfiled',...collections.map(c=>c.name),...(selected?[selected.category]:[])])];
 for(const id of ['category','record-category']){const value=$(id).value;$(id).innerHTML=names.map(n=>`<option>${esc(n)}</option>`).join('');$(id).value=names.includes(value)?value:'Unfiled';}
 $('collection-nav').innerHTML=['Unfiled',...collections.map(c=>c.name)].map(n=>`<button class="nav ${filter===n?'active':''}" data-filter="${esc(n)}" aria-label="${esc(n)}" title="${esc(n)}"><span class="nav-icon" aria-hidden="true">${({Ronnie:"✦",AI:"✧",Consciousness:"◉",Finance:"◈",Personal:"○",Unfiled:"◇"})[n]||"▱"}</span><span>${esc(n)}</span></button>`).join('');bindFilters();
}
function renderCollectionEditor(){
 $('collection-recovery').hidden=libraryStorage.getItem(COLLECTION_PENDING)===null;
 $('collection-list').innerHTML=collections.map((c,i)=>`<div class="collection-item"><div><strong>${esc(c.name)}</strong><small>${esc(c.keywords.join(', ')||'Manual filing only · no keywords')}</small></div><button data-edit="${i}">Edit</button><button data-remove="${i}" aria-label="Remove ${esc(c.name)} collection">×</button></div>`).join('');
 $('collection-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{editingCollection=Number(b.dataset.edit);$('collection-name').value=collections[editingCollection].name;$('collection-keywords').value=collections[editingCollection].keywords.join(', ');$('collection-save').textContent='Save changes';});
 $('collection-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=run(async()=>{const i=Number(b.dataset.remove),name=collections[i].name;if(!confirm(`Remove the ${name} collection? Its conversations will move to Unfiled; recordings are kept.`))return;const next=structuredClone(collections);next.splice(i,1);await updateCollectionRules(next,collections,rules=>db.refileCollections(rules,{remove:name,rejectRecording:true}),{operation:{remove:name},storage:libraryStorage});collections=next;await refresh();scheduleSync();if(selected)selected=(await db.list()).find(n=>n.id===selected.id);if(filter===name)filter='All';clearCollectionForm();renderCollections();showFiling();renderList();renderCollectionEditor();}));
}
function clearCollectionForm(){editingCollection=null;$('collection-name').value='';$('collection-keywords').value='';$('collection-save').textContent='Create collection';}
$('manage-collections').onclick=()=>{collections=loadCollections(libraryStorage);clearCollectionForm();renderCollections();renderCollectionEditor();$('collections-dialog').showModal();};$('collections-close').onclick=()=>$('collections-dialog').close();$('collection-cancel').onclick=clearCollectionForm;
$('collection-form').onsubmit=e=>{e.preventDefault();run(async()=>{
 const name=$('collection-name').value.trim().slice(0,80),keywords=$('collection-keywords').value.split(',').map(k=>k.trim()).filter(Boolean).slice(0,30);
 if(!name)throw Error('Give this collection a name.');if(['unfiled','all'].includes(name.toLowerCase())||collections.some((c,i)=>i!==editingCollection&&c.name.toLowerCase()===name.toLowerCase()))throw Error('Choose a different, unique collection name.');
 const old=editingCollection===null?null:collections[editingCollection].name,c={name,keywords},next=structuredClone(collections);if(editingCollection===null)next.push(c);else next[editingCollection]=c;
 await updateCollectionRules(next,collections,rules=>db.refileCollections(rules,{rename:old?{from:old,to:name}:undefined,rejectRecording:true}),{operation:old?{rename:{from:old,to:name}}:{},storage:libraryStorage});collections=next;await refresh();scheduleSync();
 if(selected)selected=(await db.list()).find(n=>n.id===selected.id);renderCollections();showFiling();clearCollectionForm();renderCollectionEditor();toast('Collection saved. Automatic conversations have been refiled using the current rules.');
 })();};
if(!noLaptop){try{const moved=await moveBrowserLibrary({fromBrowser:browserDb,toLibrary:db});if(moved?.moved||moved?.copies)toast(`${moved.moved+moved.copies} conversation${moved.moved+moved.copies===1?'':'s'} moved from this browser into your recordit library. Every browser now shows the same conversations.`+(moved.copies?` ${moved.copies} also existed in the library with different content, so both versions were kept.`:''));}catch(error){toast('Could not move this browser’s conversations into the recordit library yet ('+error.message+'). They are safe here and the move will be retried.');}}
renderCollections();await refresh();setInterval(()=>{run(sync)();if(!noLaptop)transcriptSaver.schedule();},60000);scheduleSync();

let wordMatches=[],wordIndex=-1;
function goToWord(index){
 if(!wordMatches.length)return;
 wordIndex=(index+wordMatches.length)%wordMatches.length;
 $('editor').hidden=true;$('transcript-view').hidden=false;
 document.querySelectorAll('.source-highlight,.active-match').forEach(el=>el.classList.remove('source-highlight','active-match'));
 const match=wordMatches[wordIndex],target=$('source-'+match.id),mark=$('word-match-'+wordIndex);
 target?.classList.add('source-highlight');mark?.classList.add('active-match');
 (mark||target)?.scrollIntoView({behavior:'instant',block:'center'});target?.focus({preventScroll:true});
 $('match-position').textContent=(wordIndex+1)+' / '+wordMatches.length;
}
function renderWordSearch(){
 const query=$('find-words').value,sources=sourcesFor(selected||{});
 wordMatches=findWords(sources,query);wordIndex=-1;
 const grouped=new Map();wordMatches.forEach((m,i)=>{if(!grouped.has(m.id))grouped.set(m.id,[]);grouped.get(m.id).push({...m,index:i});});
 for(const source of sources){
  const span=$('source-'+source.id)?.querySelector('.passage-text');if(!span)continue;
  let html='',offset=0;for(const match of grouped.get(source.id)||[]){html+=highlightHtml(source,selected.highlights||[],offset,match.position)+'<mark id="word-match-'+match.index+'">'+highlightHtml(source,selected.highlights||[],match.position,match.position+match.length)+'</mark>';offset=match.position+match.length;}
  span.innerHTML=html+highlightHtml(source,selected.highlights||[],offset);
 }
 $('match-nav').hidden=!wordMatches.length;$('match-position').textContent=wordMatches.length+' matches';
 $('word-results').innerHTML=!query.trim()?'':('<p class="caption">'+wordMatches.length+' occurrences</p>'+wordMatches.slice(0,100).map((s,i)=>'<button class="word-hit" data-word-index="'+i+'"><strong>'+(s.timestamp?clock(s.timestamp[0]||0):'Passage '+s.id)+'</strong> '+esc(s.preview)+'</button>').join('')+(wordMatches.length>100?'<p class="caption">First 100 previews shown. Previous and Next reach every occurrence.</p>':''));
 $('word-results').querySelectorAll('[data-word-index]').forEach(b=>b.onclick=()=>goToWord(Number(b.dataset.wordIndex)));
}
$('word-previous').onclick=()=>goToWord(wordIndex<0?wordMatches.length-1:wordIndex-1);
$('word-next').onclick=()=>goToWord(wordIndex+1);
$('find-words').oninput=renderWordSearch;

let attachingNote=null;
$('attach-audio').onclick=()=>{if(!selected||busy)return;attachingNote=selected.id;$('attach-audio-file').click();};
$('attach-audio-file').onchange=run(async event=>{
 const file=event.target.files[0],id=attachingNote;attachingNote=null;event.target.value='';if(!file||!id)return;
 if(!file.type.startsWith('audio/')&&!/\.(wav|mp3|m4a|mp4|webm|ogg|flac|audio)$/i.test(file.name))throw Error('Choose the audio file that belongs to this conversation.');
 checkAudioSize(file.size);if(!file.size)throw Error('This audio file is empty.');
 await db.attachAudio(id,file);await refresh();if(selected?.id===id)await openNote(id);scheduleSync();toast('Audio attached. Your existing transcript and notes were kept.');
});

function setSidebarCollapsed(collapsed){
 document.body.classList.toggle('sidebar-collapsed',collapsed);
 const button=$('sidebar-toggle');button.setAttribute('aria-expanded',String(!collapsed));
 button.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');button.title=collapsed?'Expand sidebar':'Collapse sidebar';
 try{localStorage.setItem('sidebarCollapsed',String(collapsed));}catch{}
}
let sidebarCollapsed=false;try{sidebarCollapsed=localStorage.getItem('sidebarCollapsed')==='true';}catch{}
setSidebarCollapsed(sidebarCollapsed);
$('sidebar-toggle').onclick=()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));

let libraryExportController=null;
$('export-library').disabled=typeof window.showDirectoryPicker!=='function';
if($('export-library').disabled)$('library-transfer-status').textContent='Folder export needs Chrome or Edge on Windows. Open recordit in your regular browser.';
$('cancel-library-export').onclick=()=>libraryExportController?.abort();
$('export-library').onclick=async()=>{
 if(libraryExportController)return;
 const control=$('export-library');control.disabled=true;let writing=false;
 try{
  if(recording)throw Error('Finish recording before exporting your library.');
  const parent=await window.showDirectoryPicker({mode:'readwrite'});
  libraryExportController=new AbortController();const signal=libraryExportController.signal;$('cancel-library-export').hidden=false;
  $('library-transfer-status').textContent='Preparing your library…';await saving;
  const transfer=await captureLibraryTransfer({snapshotLibrary:db.snapshotLibrary,loadCollections,exportData,signal,onProgress:p=>{$('library-transfer-status').textContent='Checking '+p.completed+' of '+p.total+' conversations · '+Math.round(p.checkedBytes/1048576)+' MB';}});
  writing=true;const result=await writeLibraryDirectory(transfer,parent,{signal,onProgress:p=>{$('library-transfer-status').textContent='Saving library · '+Math.round(p.writtenBytes/1048576)+' MB';}});
  const warnings=(await import('./library-transfer.js')).inspectLibraryManifest(transfer.manifest).warnings;
  $('library-transfer-status').textContent=result.conversations+' conversations saved in '+result.name+'.'+(warnings.length?' Review: '+warnings.map(w=>w.message).join(' '):' Audio and collection rules included.');
 }catch(error){$('library-transfer-status').textContent=(error.name==='AbortError'?'Export cancelled.':error.message)+(writing?' A partial folder may remain; it is not a complete transfer without a valid manifest.':'')+' Your local library is unchanged.';}
 finally{libraryExportController=null;control.disabled=typeof window.showDirectoryPicker!=='function';$('cancel-library-export').hidden=true;}
};

let pendingLibraryImport=null,libraryImportController=null;
$('preview-library-import').disabled=typeof window.showDirectoryPicker!=='function';
$('cancel-library-import').onclick=()=>libraryImportController?.abort();
$('preview-library-import').onclick=async()=>{
 const button=$('preview-library-import');button.disabled=true;pendingLibraryImport=null;$('library-import-preview').hidden=true;
 try{
  const directory=await window.showDirectoryPicker({mode:'read'});libraryImportController=new AbortController();$('cancel-library-import').hidden=false;
  $('library-import-status').textContent='Checking transfer files…';
  const validated=await readLibraryDirectory(directory,{signal:libraryImportController.signal,onProgress:p=>{$('library-import-status').textContent='Checking audio · '+Math.round(p.checkedBytes/1048576)+' MB';}});
  pendingLibraryImport=prepareLibraryRestore(validated,{storage:libraryStorage});
  $('library-import-preview').hidden=false;
  const count=pendingLibraryImport.conversations.length,audioCount=pendingLibraryImport.conversations.filter(c=>c.blob).length;
  $('library-import-count').textContent=count+' conversation'+(count===1?'':'s')+' · '+audioCount+' audio file'+(audioCount===1?'':'s');
  $('library-import-changes').textContent=pendingLibraryImport.changes.map(c=>c.type==='rename'?c.from+' → '+c.to:c.type==='label'?'Keep label without rules: '+c.to:'Add collection: '+c.to).join('\n')||'Existing collection rules can be reused.';
  $('library-import-warnings').textContent=pendingLibraryImport.warnings.map(w=>w.message).join('\n');
  $('library-import-status').textContent=pendingLibraryImport.resuming?'Ready to resume the pending import. Existing imported copies will be reused.':'Preview checked. Restore adds separate conversations and preserves your existing recordings.';
 }catch(error){$('library-import-status').textContent=(error.name==='AbortError'?'Preview cancelled.':error.message)+' Your library has not changed.';}
 finally{libraryImportController=null;button.disabled=typeof window.showDirectoryPicker!=='function';$('cancel-library-import').hidden=true;}
};



$('resume-collections').onclick=run(async()=>{
 await recoverCollectionUpdate((rules,operation)=>db.refileCollections(rules,{...operation,rejectRecording:true}),{storage:libraryStorage});
 collections=loadCollections(libraryStorage);clearCollectionForm();await refresh();if(selected)selected=(await db.list()).find(n=>n.id===selected.id);renderCollections();renderCollectionEditor();showFiling();scheduleSync();toast('Collection update completed.');
});

$('restore-library').onclick=async()=>{
 if(!pendingLibraryImport)return;const button=$('restore-library');button.disabled=true;$('preview-library-import').disabled=true;
 try{if(recording)throw Error('Finish recording before restoring a library.');await saving;
 const restored=await restorePlannedLibrary(pendingLibraryImport,db.restoreLibrary,{storage:libraryStorage});
 collections=loadCollections(libraryStorage);renderCollections();await refresh();scheduleSync();
 $('library-import-status').textContent=restored.length+' conversation'+(restored.length===1?'':'s')+' restored. Your existing conversations were kept.';pendingLibraryImport=null;$('library-import-preview').hidden=true;
 }catch(error){$('library-import-status').textContent=error.message+' If an import is pending, preview the same folder and retry; completed copies will be reused.';}
 finally{button.disabled=false;$('preview-library-import').disabled=typeof window.showDirectoryPicker!=='function';}
};














// The quick guide: every feature in a few plain steps, one tap from the sidebar.
$('help-open').onclick=()=>$('help-dialog').showModal();$('help-close').onclick=()=>$('help-dialog').close();
