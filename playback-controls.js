export function seekTarget(current,delta,duration){
 if(!Number.isFinite(current)||!Number.isFinite(delta)||!Number.isFinite(duration)||duration<=0)return null;
 return Math.max(0,Math.min(duration,current+delta));
}
export function bindPlayback(player,{panel,speed,back,forward}){
 const rates=[0.75,1,1.25,1.5,2];let preferred=1;
 const refresh=()=>{const ready=!player.hidden&&Boolean(player.getAttribute('src'))&&!player.error&&player.readyState>=1;panel.hidden=!ready;back.disabled=forward.disabled=seekTarget(player.currentTime,0,player.duration)===null;};
 const jump=delta=>{const target=seekTarget(player.currentTime,delta,player.duration);if(!panel.hidden&&target!==null)player.currentTime=target;};
 back.onclick=()=>jump(-10);forward.onclick=()=>jump(10);
 speed.onchange=()=>{const value=Number(speed.value);if(rates.includes(value)||speed.querySelector('[data-custom-rate]')?.value===String(value)){preferred=value;player.playbackRate=value;}};
 player.addEventListener('ratechange',()=>{if(player.hidden||player.readyState<1)return;const value=player.playbackRate;if(!Number.isFinite(value)||value<=0)return;if(!rates.includes(value)){let custom=speed.querySelector('[data-custom-rate]');if(!custom){custom=speed.ownerDocument.createElement('option');custom.dataset.customRate='true';speed.append(custom);}custom.value=String(value);custom.textContent=value+'×';}preferred=value;speed.value=String(preferred);});
 player.addEventListener('loadedmetadata',()=>{player.playbackRate=preferred;speed.value=String(preferred);refresh();});
 for(const event of ['emptied','error','durationchange'])player.addEventListener(event,refresh);
 refresh();return refresh;
}
