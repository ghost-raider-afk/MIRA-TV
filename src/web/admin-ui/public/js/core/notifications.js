import { api } from './api.js';
import { state } from './state.js';
import { createNotificationsLayer } from '../components/notifications.js';

const BASE='/api/request-notifications';
const TITLES=Object.freeze({
  created:'Новая заявка',resubmitted:'Заявка отправлена повторно',
  approved:'Заявка завершена',rework:'Заявка на доработке',rejected:'Заявка отклонена'
});
let initialized=false,stream=null,refreshTimer=null,claiming=false,visible=new Set(),paused=false,started=false;
let soundContext=null,soundBuffer=null,nextCursor=null,rendered=[];
function el(tag,cls='',text=''){
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  node.textContent=text;
  return node;
}
function requestUrl(id) {
  const path=state.session?.role==='manager'?'/manager':'/approvals';
  return path+'?request='+encodeURIComponent(id)+(path==='/manager'?'#manager-proposals-title':'');
}
function updateCount(count) {
  const value=Number(count)||0;
  for(const badge of document.querySelectorAll('[data-notification-count],[data-request-nav-count]')) {
    badge.textContent=value>99?'99+':String(value);
    badge.classList.toggle('is-hidden',value===0);
  }
  for(const link of document.querySelectorAll('[data-header-section="approvals"],[data-header-section="manager-requests"]')) {
    if(!link.querySelector('[data-request-nav-count]')) {
      const badge=el('span','request-nav-badge is-hidden');
      badge.dataset.requestNavCount='';
      link.append(badge);
    }
    const badge=link.querySelector('[data-request-nav-count]');
    badge.textContent=value>99?'99+':String(value);
    badge.classList.toggle('is-hidden',value===0);
  }
}
function soundIcon() {
  const button=document.getElementById('request-sound-button');
  if(!button)return;
  const enabled=state.user?.request_sound_enabled===true;
  button.setAttribute('aria-label',enabled?'Выключить звук заявок':'Включить звук заявок');
  button.title=enabled?'Звук уведомлений включён':'Звук уведомлений выключен';
  button.innerHTML=enabled
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4ZM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4ZM17 9l5 6M22 9l-5 6"/></svg>';
  button.setAttribute('aria-pressed',String(!enabled));
}
// Reproduces the approved 0.46s original synth, without samples or CDN.
function prepareSound() {
  if(soundBuffer||!soundContext)return;
  const rate=44100,duration=.46;
  const notes=[[659.255,.008,.172,.046],[830.609,.151,.170,.052]];
  const samples=Math.round(rate*duration);
  const audio=soundContext.createBuffer(1,samples,rate);
  const data=audio.getChannelData(0);
  let peak=0;
  for(let i=0;i<samples;i++){
    const t=i/rate;let sample=0;
    for(const [frequency,start,amplitude,decay] of notes) {
      const elapsed=t-start;
      if(elapsed<0)continue;
      const envelope=(1-Math.exp(-elapsed/.007))*Math.exp(-elapsed/decay)*
        Math.min(1,Math.max(0,(duration-t)/.055));
      const phase=2*Math.PI*frequency*(elapsed+.0029*.024*(1-Math.exp(-elapsed/.024)));
      sample+=amplitude*envelope*(Math.sin(phase)+.12*Math.sin(2*phase+.13)+.025*Math.sin(3*phase+.27));
    }
    data[i]=sample;peak=Math.max(peak,Math.abs(sample));
  }
  const gain=peak>.16?.16/peak:1;
  for(let i=0;i<samples;i++)data[i]*=gain;
  soundBuffer=audio;
}
function playSound() {
  if(state.user?.request_sound_enabled!==true)return;
  try {
    if(!soundContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundContext=new Audio();}
    if(soundContext.state!=='running')return; // Browser gesture policy: never force autoplay.
    prepareSound();
    const source=soundContext.createBufferSource();
    source.buffer=soundBuffer;
    source.connect(soundContext.destination);
    source.start();
  }catch{/* Browser may disable audio. Notifications remain visible. */}
}
function openRequest(item) {
  void api.post(BASE+'/'+item.id+'/read').catch(()=>undefined);
  window.location.assign(requestUrl(item.proposal_id));
}
function requestRow(item) {
  const row=el('article','request-center-row'+(item.read_at?'':' is-unread'));
  const open=el('button','request-center-open');
  open.type='button';
  const title=el('strong','',TITLES[item.kind]+' №'+item.proposal_id);
  const description=el('span','',item.title+(item.location_name?' · '+item.location_name:''));
  const time=el('small','',new Date(item.created_at).toLocaleString('ru-RU'));
  open.append(title,description,time);
  open.addEventListener('click',()=>openRequest(item));
  row.append(open);
  if(!item.read_at) {
    const read=el('button','request-center-read','✓');
    read.type='button';read.title='Отметить прочитанным';
    read.setAttribute('aria-label','Отметить прочитанным');
    read.addEventListener('click',async()=>{
      try{await api.post(BASE+'/'+item.id+'/read');await loadNotifications();}
      catch{/* next refresh retries */}
    });
    row.append(read);
  }
  return row;
}
function renderCenter(items,append=false) {
  const list=document.querySelector('[data-notification-list]');
  if(!list)return;
  if(!append)list.replaceChildren();
  const fragment=document.createDocumentFragment();
  for(const item of items)fragment.append(requestRow(item));
  list.append(fragment);
  const empty=document.querySelector('[data-notification-empty]');
  if(empty)empty.classList.toggle('is-hidden',list.childElementCount!==0);
  const more=document.getElementById('request-notifications-more');
  if(more)more.hidden=!nextCursor;
}
export async function loadNotifications(limit=30) {
  const data=await api.get(BASE+'?limit='+Math.max(1,Math.min(30,Number(limit)||30)));
  rendered=data.items;
  nextCursor=data.next_cursor;
  renderCenter(rendered);
  updateCount(data.unread_count);
  return data;
}
async function loadMore() {
  if(!nextCursor)return;
  const data=await api.get(BASE+'?limit=30&cursor='+encodeURIComponent(nextCursor));
  rendered.push(...data.items);
  nextCursor=data.next_cursor;
  renderCenter(data.items,true);
  updateCount(data.unread_count);
}
function dismissToast(node) {
  if(!visible.has(node))return;
  visible.delete(node);node.remove();
  if(!visible.size)void claimPending(false);
}
function requestToast(item) {
  const region=document.querySelector('[data-request-toast-region]');
  if(!region)return;
  const node=el('article','request-popup');
  node.setAttribute('role','status');
  const open=el('button','request-popup-open');
  open.type='button';
  open.append(el('strong','',TITLES[item.kind]+' №'+item.proposal_id),
    el('span','',item.title+(item.location_name?' · '+item.location_name:'')));
  open.addEventListener('click',()=>openRequest(item));
  const close=el('button','request-popup-close','×');
  close.type='button';close.setAttribute('aria-label','Закрыть уведомление');
  close.addEventListener('click',()=>dismissToast(node));
  node.append(open,close);region.append(node);visible.add(node);
  let left=6000,startedAt=Date.now(),timer=setTimeout(()=>dismissToast(node),left);
  const pause=()=>{if(!timer)return;clearTimeout(timer);timer=null;left-=Date.now()-startedAt;};
  const resume=()=>{if(timer||left<=0)return;startedAt=Date.now();timer=setTimeout(()=>dismissToast(node),left);};
  node.addEventListener('mouseenter',pause);node.addEventListener('mouseleave',resume);
  node.addEventListener('focusin',pause);node.addEventListener('focusout',resume);
}
async function claimPending(isLive) {
  if(claiming||visible.size||paused||document.hidden)return;
  claiming=true;
  try {
    const result=await api.post(BASE+'/claim');
    const items=(result.items||[]).slice(0,3);
    items.forEach(requestToast); // 3 visible, strictly below the agreed maximum of 10.
    if(isLive&&items.some(x=>Date.now()-new Date(x.created_at).getTime()<30000))playSound();
  }catch{/* Reconnect/visibility refresh retries. */}
  finally{claiming=false;}
}
let refreshScheduled=false;
function scheduleRefresh(isLive=false) {
  if(refreshScheduled)return;
  refreshScheduled=true;
  setTimeout(async()=>{
    refreshScheduled=false;
    await loadNotifications().catch(()=>undefined);
    await claimPending(isLive);
  },200);
}
export function startNotificationPolling() {
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>{
    if(document.visibilityState==='visible')scheduleRefresh(false);
  },120000); // Rare reconciliation only; live delivery comes from PG NOTIFY/SSE.
}
export function initialiseNotifications() {
  if(initialized)return;
  const bell=document.getElementById('notifications-button');
  if(!bell)return;
  initialized=true;
  if(!document.getElementById('notifications-layer'))document.body.append(createNotificationsLayer());
  const layer=document.getElementById('notifications-layer');
  const panel=document.getElementById('notifications-panel');
  const sound=document.getElementById('request-sound-button');
  if(!document.querySelector('[data-request-toast-region]')) {
    const region=el('div','request-toast-region');region.dataset.requestToastRegion='';document.body.append(region);
  }
  soundIcon();
  sound?.addEventListener('click',async()=>{
    const enabled=state.user?.request_sound_enabled!==true;
    try {
      const result=await api.put(BASE+'/sound',{enabled});
      state.user.request_sound_enabled=result.enabled;
      soundIcon();
      if(result.enabled) {
        try {
          if(!soundContext) {
            const Audio=window.AudioContext||window.webkitAudioContext;
            if(Audio)soundContext=new Audio();
          }
          await soundContext?.resume();
        } catch {/* Audio can be unavailable; preference stays saved. */}
      }
    }catch{/* No optimistic false state if request fails. */}
  });
  function close() {
    layer.classList.add('is-hidden');bell.setAttribute('aria-expanded','false');
    document.body.classList.remove('notifications-open');
    paused=false;
    void claimPending(false);
  }
  bell.addEventListener('click',()=>{
    const open=layer.classList.contains('is-hidden');
    if(!open){close();return;}
    layer.classList.remove('is-hidden');
    bell.setAttribute('aria-expanded','true');
    document.body.classList.toggle('notifications-open',window.innerWidth<=960);
    paused=true;
    void loadNotifications().catch(()=>undefined);
  });
  layer.querySelectorAll('[data-notifications-close]').forEach(x=>x.addEventListener('click',close));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!layer.classList.contains('is-hidden'))close();});
  document.addEventListener('click',event=>{
    if(window.innerWidth<=960||layer.classList.contains('is-hidden'))return;
    if(panel.contains(event.target)||bell.contains(event.target))return;
    close();
  });
  window.addEventListener('resize',()=>{
    if(!layer.classList.contains('is-hidden'))document.body.classList.toggle('notifications-open',window.innerWidth<=960);
  },{passive:true});
  document.getElementById('mark-notifications-read')?.addEventListener('click',async()=>{
    try{
      await api.post(BASE+'/read-all');
      // Already displayed toasts are dismissed, but audit events are untouched.
      for(const node of [...visible])dismissToast(node);
      await loadNotifications();
    }catch{}
  });
  document.getElementById('request-notifications-clear')?.addEventListener('click',async()=>{
    if(!window.confirm('Очистить свои уведомления о заявках? Журнал событий останется без изменений.'))return;
    try {
      paused=true;
      await api.delete(BASE);
      for(const node of [...visible]){visible.delete(node);node.remove();}
      await loadNotifications();
      paused=!layer.classList.contains('is-hidden');
    }catch{}
  });
  document.getElementById('request-notifications-more')?.addEventListener('click',()=>void loadMore().catch(()=>undefined));
  document.getElementById('request-notifications-pause')?.addEventListener('click',event=>{
    paused=!paused;
    event.currentTarget.textContent=paused?'Продолжить показ':'Приостановить показ';
    if(!paused)void claimPending(false);
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')scheduleRefresh(false);
  });
  stream=new EventSource(BASE+'/stream');
  stream.addEventListener('changed',()=>scheduleRefresh(true));
  stream.addEventListener('open',()=>scheduleRefresh(false));
  void loadNotifications().then(()=>claimPending(false)).catch(()=>undefined);
  startNotificationPolling();
}
