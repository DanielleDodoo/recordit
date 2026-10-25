const SHELL='record-me-shell-v86',MODELS='record-me-models-v1';
const files=['./','index.html','styles.css','app.js','transcript-correction.js','answer-copy.js','question-drafts.js','chat-sessions.js','library-capture.js','library-reader.js','library-import-plan.js','library-restore.js','library-directory.js','library-transfer.js','drive-backup.js','backup-history.js','follow-up-result.js','transcript-autosave.js','transcript-versions.js','mic-modes.js','library-sync.js','voice-groups.js','conversation-view.js','core.js','bookmarks.js','comments.js','speakers.js','speaker-filter.js','highlights.js','text-import.js','subtitle-export.js','playback-controls.js','library-search.js','summaries.js','questions.js','transcript-search.js','collections.js','collection-filing.js','bulk-filing.js','collection-update.js','limits.js','mobile.js','db.js','db-browser.js','db-server.js','engine.js','library-settings.js','library-migrate.js','ai-worker.js','manifest.webmanifest','icon.svg','moments.js','live-words.js','auto-title.js'];
// The app can live in a sub-folder (its phone web address), so every path is relative to this file.
const paths=files.map(f=>new URL(f,self.location).pathname),scope=new URL('./',self.location).pathname;
self.addEventListener('install',event=>event.waitUntil(caches.open(SHELL).then(c=>c.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('record-me-shell-')&&key!==SHELL)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||url.pathname.startsWith(scope+'api/')||event.request.method!=='GET')return;
 event.respondWith((async()=>{
  if(paths.includes(url.pathname)){try{const fresh=await fetch(event.request);if(fresh.ok){const cache=await caches.open(SHELL);await cache.put(event.request,fresh.clone());return fresh;}}catch{}}
  const cached=await caches.match(event.request);if(cached)return cached;
  return fetch(event.request);
 })());
});















