import { api } from '../core/api.js';

const OBJECTS = Object.freeze([
  Object.freeze({ key:'menu', label:'Основное меню', detail:'Таблица меню и её световые эффекты.', tab:'menu',
    visible:{ type:'checkbox', ids:['animation-menu-visible'] },
    motion:{ type:'menu-effects', ids:['animation-section-effect','animation-item-effect'] } }),
  Object.freeze({ key:'promotion', label:'Акция', detail:'Плашка «АКЦИЯ» и подсветка акционных строк.', tab:'promotion',
    visible:{ type:'checkbox', ids:['animation-promotion-visible'] },
    motion:{ type:'select-effect', ids:['animation-promotion-effect'] } }),
  Object.freeze({ key:'weather', label:'Погода', detail:'Погодный информер и погодные эффекты.', tab:'weather',
    visible:{ type:'checkbox', ids:['weather-enabled'] },
    motion:{ type:'checkbox', ids:['weather-animation-enabled'] } }),
  Object.freeze({ key:'announcement', label:'Объявление', detail:'Бегущая строка поверх сцены.', tab:'announcement',
    visible:{ type:'checkbox', ids:['animation-announcement-enabled'] },
    motion:{ type:'checkbox', ids:['animation-announcement-animation-enabled'] } }),
  Object.freeze({ key:'brand', label:'Бренд', detail:'Название бренда как отдельный объект сцены.', tab:'brand',
    visible:{ type:'checkbox', ids:['animation-brand-enabled'] },
    motion:{ type:'checkbox', ids:['animation-brand-animation-enabled'] } }),
  Object.freeze({ key:'aquarium', label:'Аквариум', detail:'Environment-слой: вода, рыбы, пузырьки и каустики.', tab:'aquarium',
    visible:{ type:'checkbox', ids:['animation-aquarium-enabled'] },
    motion:{ type:'checkbox', ids:['animation-aquarium-animation-enabled'] } }),
  Object.freeze({ key:'entity', label:'Объект сцены', detail:'PNG, WebP или видео поверх меню.', tab:'entity',
    visible:{ type:'checkbox', ids:['animation-entity-visible'] },
    motion:{ type:'checkbox', ids:['animation-entity-animation-enabled'] } }),
  Object.freeze({ key:'playlist', label:'Плейлист сцен', detail:'PromoScene, ContentScene и Object Story.', tab:'playlist',
    visible:{ type:'checkbox', ids:['animation-scene-playlist-enabled'] },
    motion:{ type:'checkbox', ids:['animation-scene-playlist-animation-enabled'] } })
]);

const TABS = Object.freeze([
  Object.freeze({ key:'menu', label:'Меню', selector:'.animation-motion-card' }),
  Object.freeze({ key:'promotion', label:'Акция', selector:'.animation-promotion-card' }),
  Object.freeze({ key:'weather', label:'Погода', selector:'.weather-settings-card' }),
  Object.freeze({ key:'announcement', label:'Объявление', selector:'.animation-announcement-card' }),
  Object.freeze({ key:'brand', label:'Бренд', selector:'.animation-brand-card' }),
  Object.freeze({ key:'aquarium', label:'Аквариум', selector:'.animation-aquarium-card' }),
  Object.freeze({ key:'entity', label:'Объект', selector:'.animation-entity-card' }),
  Object.freeze({ key:'playlist', label:'Плейлист', selector:'.playlist-scene-editor' })
]);

function node(id){ return document.getElementById(id); }
function nodes(source){ return source.ids.map(node).filter(Boolean); }

function readSource(source){
  const controls=nodes(source);
  if(!controls.length) return false;
  if(source.type==='checkbox') return controls[0].checked===true;
  if(source.type==='select-effect') return controls[0].value!=='none';
  if(source.type==='menu-effects') return controls.some(control=>control.value!=='none');
  return false;
}

function dispatch(control,name='change'){ control.dispatchEvent(new Event(name,{bubbles:true})); }

function writeSource(source,enabled){
  const controls=nodes(source);
  if(!controls.length) return;
  if(source.type==='checkbox'){
    controls[0].checked=enabled;
    dispatch(controls[0]);
    return;
  }
  if(source.type==='select-effect'){
    controls[0].value=enabled?'cinematic':'none';
    dispatch(controls[0]);
    return;
  }
  if(source.type==='menu-effects'){
    for(const control of controls){
      control.value=enabled?'cinematic':'none';
      dispatch(control);
    }
  }
}

function remoteObjectStates(animation,weather){
  const profile=animation?.profile||{};
  const playlist=animation?.scene_playlist||{};
  return new Map([
    ['menu',{visible:profile.menu_visible!==false,animated:animation?.enabled===true&&(profile.section_effect!=='none'||profile.item_effect!=='none')}],
    ['promotion',{visible:profile.promotion_visible!==false,animated:animation?.enabled===true&&profile.promotion_effect!=='none'}],
    ['weather',{visible:weather?.enabled===true,animated:weather?.enabled===true&&weather?.animation_enabled===true}],
    ['announcement',{visible:animation?.announcement?.enabled===true,animated:animation?.announcement?.enabled===true&&animation?.announcement?.animation_enabled!==false}],
    ['brand',{visible:animation?.brand?.enabled===true,animated:animation?.brand?.enabled===true&&animation?.brand?.animation_enabled!==false}],
    ['aquarium',{visible:animation?.environment?.enabled===true&&animation?.environment?.effect==='aquarium',animated:animation?.environment?.enabled===true&&animation?.environment?.animation_enabled!==false}],
    ['entity',{visible:animation?.entity?.visible===true,animated:animation?.entity?.visible===true&&animation?.entity?.animation_enabled!==false&&animation?.entity?.animation_mode!=='none'}],
    ['playlist',{visible:playlist.enabled===true,animated:playlist.enabled===true&&playlist.animation_enabled!==false}]
  ]);
}

function hideDuplicateControls(){
  const ids=[
    'animation-menu-visible','animation-promotion-visible','weather-enabled','weather-animation-enabled',
    'animation-announcement-enabled','animation-announcement-animation-enabled',
    'animation-brand-enabled','animation-brand-animation-enabled',
    'animation-aquarium-enabled','animation-aquarium-animation-enabled',
    'animation-entity-visible','animation-entity-animation-enabled',
    'animation-scene-playlist-enabled','animation-scene-playlist-animation-enabled'
  ];
  for(const id of ids) node(id)?.closest('label')?.classList.add('animation-manager-source-hidden');
}

function rebuildTabs(inspector){
  const oldTabs=inspector.querySelector('.animation-inspector-tabs');
  const oldPanels=inspector.querySelector('.animation-inspector-panels');
  if(!(oldTabs instanceof HTMLElement)||!(oldPanels instanceof HTMLElement)) return null;

  const captured=new Map();
  for(const tab of TABS){
    const content=document.querySelector(tab.selector);
    if(content instanceof HTMLElement) captured.set(tab.key,content);
  }

  const panels=document.createElement('div');
  panels.className='animation-inspector-panels animation-object-panels';

  const openTab=(key)=>{
    panels.querySelectorAll('[data-animation-object-panel]').forEach(panel=>{
      panel.hidden=panel.dataset.animationObjectPanel!==key;
    });
  };

  TABS.forEach((tab,index)=>{
    const panel=document.createElement('div');
    panel.dataset.animationObjectPanel=tab.key; panel.setAttribute('role','tabpanel'); panel.hidden=index!==0;
    const content=captured.get(tab.key);
    if(content) panel.append(content);
    panels.append(panel);
  });

  oldTabs.remove();
  oldPanels.replaceWith(panels);
  document.querySelector('.animation-motion-grid')?.remove();
  document.querySelector('.animation-overlay-grid')?.remove();
  openTab('menu');
  return {openTab};
}

function makeSwitch(labelText,kind,key,onChange){
  const label=document.createElement('label');
  label.className='animation-object-switch';
  const input=document.createElement('input');
  input.type='checkbox'; input.className='animation-object-toggle'; input.dataset.animationObjectToggle=kind;
  input.setAttribute('aria-label',`${labelText}: ${kind==='visible'?'показывать':'анимация'}`);
  input.addEventListener('change',()=>onChange(input.checked));
  const text=document.createElement('span');
  text.textContent=kind==='visible'?'Показывать':'Анимация';
  label.append(input,text);
  return label;
}

function createOverview(inspector,openTab){
  const section=document.createElement('section');
  section.className='animation-object-manager';
  section.setAttribute('aria-label','Анимации и объекты');
  section.innerHTML=`
    <div class="animation-object-manager-head">
      <div><p class="eyebrow">АНИМАЦИИ И ОБЪЕКТЫ</p><h3>Объекты сцены</h3><p>Для каждого объекта отдельно задаются отображение и движение. Motion Runtime включается автоматически только когда он нужен.</p></div>
      <small id="animation-object-tv-name">Состояние ТВ загружается…</small>
    </div>
    <div class="animation-object-list" id="animation-object-list"></div>`;

  const list=section.querySelector('#animation-object-list');
  for(const definition of OBJECTS){
    const row=document.createElement('div');
    row.className='animation-object-row'; row.dataset.animationObject=definition.key;

    const copy=document.createElement('button');
    copy.type='button'; copy.className='animation-object-copy'; copy.addEventListener('click',()=>openTab(definition.tab));
    copy.innerHTML=`<strong></strong><small></small>`;
    copy.querySelector('strong').textContent=definition.label;
    copy.querySelector('small').textContent=definition.detail;

    const switches=document.createElement('div');
    switches.className='animation-object-switches';
    switches.append(
      makeSwitch(definition.label,'visible',definition.key,(value)=>writeSource(definition.visible,value)),
      makeSwitch(definition.label,'motion',definition.key,(value)=>writeSource(definition.motion,value))
    );

    const tv=document.createElement('span');
    tv.className='animation-object-tv-state is-unknown'; tv.dataset.animationObjectTv=definition.key; tv.textContent='ТВ: …';

    const configure=document.createElement('button');
    configure.type='button'; configure.className='button button-secondary animation-object-configure';
    configure.textContent='Настроить'; configure.addEventListener('click',()=>openTab(definition.tab));

    row.append(copy,switches,tv,configure); list.append(row);
  }

  inspector.querySelector('.animation-object-panels')?.before(section);
  return section;
}

export function initialiseAnimationObjectManager(){
  const inspector=document.querySelector('.animation-inspector');
  if(!(inspector instanceof HTMLElement)) return;
  const tabs=rebuildTabs(inspector);
  if(!tabs) return;
  hideDuplicateControls();
  const overview=createOverview(inspector,tabs.openTab);
  let disposed=false;
  let remote=new Map();
  let refreshSequence=0;
  const listeners=[];

  const syncDraft=()=>{
    if(disposed) return;
    for(const definition of OBJECTS){
      const visible=overview.querySelector(`[data-animation-object="${definition.key}"][data-animation-object-toggle="visible"]`);
      const motion=overview.querySelector(`[data-animation-object="${definition.key}"][data-animation-object-toggle="motion"]`);
      const isVisible=readSource(definition.visible);
      const isAnimated=readSource(definition.motion);
      if(visible instanceof HTMLInputElement) visible.checked=isVisible;
      if(motion instanceof HTMLInputElement){
        motion.checked=isAnimated;
      }
      const row=overview.querySelector(`.animation-object-row[data-animation-object="${definition.key}"]`);
      row?.classList.toggle('is-active',isVisible);
      row?.classList.toggle('is-hidden-object',!isVisible);
    }
  };

  const syncRemote=()=>{
    for(const definition of OBJECTS){
      const status=overview.querySelector(`[data-animation-object-tv="${definition.key}"]`);
      if(!(status instanceof HTMLElement)) continue;
      const state=remote.get(definition.key);
      status.classList.remove('is-on','is-off','is-unknown');
      if(!state){
        status.textContent='ТВ: ?'; status.classList.add('is-unknown'); continue;
      }
      status.textContent=`ТВ: ${state.visible?'вкл':'выкл'} · ${state.animated?'аним.':'стат.'}`;
      status.classList.add(state.visible?'is-on':'is-off');
    }
  };

  const refreshRemote=async()=>{
    const select=node('animation-screen-select');
    const screenId=Number(select?.value);
    const name=overview.querySelector('#animation-object-tv-name');
    if(!Number.isSafeInteger(screenId)||screenId<1){
      remote=new Map(); if(name) name.textContent='Монитор предпросмотра не выбран'; syncRemote(); return;
    }
    const sequence=++refreshSequence;
    if(name) name.textContent=`ТВ: ${select?.selectedOptions?.[0]?.textContent?.trim()||`Монитор ${screenId}`} · проверяем…`;
    try{
      const [animation,weather]=await Promise.all([
        api.get(`/api/settings/animation/screens/${screenId}`),
        api.get(`/api/weather/screens/${screenId}`)
      ]);
      if(disposed||sequence!==refreshSequence) return;
      remote=remoteObjectStates(animation,weather);
      if(name) name.textContent=`ТВ: ${select?.selectedOptions?.[0]?.textContent?.trim()||`Монитор ${screenId}`}`;
      syncRemote();
    }catch{
      if(disposed||sequence!==refreshSequence) return;
      remote=new Map(); if(name) name.textContent='Состояние ТВ не удалось загрузить'; syncRemote();
    }
  };

  for(const definition of OBJECTS){
    for(const source of [definition.visible,definition.motion]){
      for(const control of nodes(source)){
        const handler=()=>queueMicrotask(syncDraft);
        control.addEventListener('change',handler); control.addEventListener('input',handler);
        listeners.push([control,handler]);
      }
    }
  }

  const screenSelect=node('animation-screen-select');
  const onScreenChange=()=>void refreshRemote();
  screenSelect?.addEventListener('change',onScreenChange);
  const message=node('animation-message');
  const observer=message instanceof HTMLElement?new MutationObserver(()=>{
    const text=message.textContent?.trim()||'';
    if(/применен|применён|применены/i.test(text)) void refreshRemote();
  }):null;
  observer?.observe(message,{childList:true,characterData:true,subtree:true});

  syncDraft(); syncRemote(); void refreshRemote();

  return { dispose(){
    disposed=true; refreshSequence+=1;
    listeners.forEach(([control,handler])=>{ control.removeEventListener('change',handler); control.removeEventListener('input',handler); });
    screenSelect?.removeEventListener('change',onScreenChange); observer?.disconnect();
  }};
}

export { OBJECTS as ANIMATION_OBJECT_DEFINITIONS };
