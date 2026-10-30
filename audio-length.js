// A recording made in the browser doesn't store its own length, so the player can show a few seconds (or nothing) for
// a 26-minute recording, and skip back/forward can't work. Asking once for a moment far past the end makes the
// browser read to the end and learn the real length; then the player goes back to the start. The recording itself is
// never changed. `expected` is the length recordit saved while recording, used to spot a length that's clearly short.
export function learnLength(player, expected = 0) {
 const unsure = () => !Number.isFinite(player.duration) || player.duration <= 0 || (expected > 0 && player.duration < expected * 0.8);
 player.addEventListener('loadedmetadata', () => {
  if (!unsure()) return;
  const back = () => { if (Number.isFinite(player.duration)) { player.removeEventListener('timeupdate', back); player.currentTime = 0; } };
  player.addEventListener('timeupdate', back);
  player.currentTime = 1e101;
 }, {once: true});
}
