import { addSceneElement, removeSceneElement, replaceSceneElement, selectSceneElement, updateSceneElement } from './commands.js';

const TYPES = Object.freeze([
  ['text', 'Текстовое поле'],
  ['weather', 'Погода'],
  ['image', 'Картинка'],
  ['video', 'Видео'],
  ['logo', 'Логотип']
]);
const FONTS = Object.freeze([
  ['arial-narrow', 'Arial Narrow'], ['tahoma-bold', 'Tahoma Bold'], ['arial', 'Arial'],
  ['dejavu-condensed', 'DejaVu Sans Condensed'], ['liberation-narrow', 'Liberation Sans Narrow'], ['system-sans', 'Системный sans-serif']
]);

function uid() {
  return globalThis.crypto?.randomUUID ? `element-${crypto.randomUUID()}` : `element-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function defaultText() {
  return {
    runs: [{ value:'Текст', font_family:'system-sans', font_size_px:64, font_weight:700, italic:false, color:'#FFFFFF', opacity:1, tracking_px:0, leading_percent:120, horizontal_scale_percent:100, vertical_scale_percent:100, baseline_shift_px:0, text_transform:'none' }],
    paragraph: { align:'left', vertical_align:'top', wrap:true },
    effects: {
      fill:{ enabled:true, mode:'solid', color:'#FFFFFF', opacity:1 },
      stroke:{ enabled:false, width_px:1, color:'#000000', opacity:1 },
      shadow:{ enabled:false, offset_x_px:0, offset_y_px:4, blur_px:12, color:'#000000', opacity:.5 },
      glow:{ enabled:false, blur_px:18, spread_px:0, color:'#FFFFFF', opacity:.5 }
    }
  };
}
function defaultWeather() {
  return { mode:'current-and-forecast', location_name:'', latitude:null, longitude:null, timezone:'auto', refresh_minutes:15, show_location:true, show_condition:true, show_feels_like:true, show_humidity:true, show_wind:true, show_forecast:true, forecast_items:3, animation_enabled:true, animation_speed:1, animation_intensity:1, widget_motion_enabled:true };
}
function defaultMedia(video=false) {
  return { source_url:'', fit:'contain', position_x_percent:50, position_y_percent:50, ...(video?{loop:true,muted:true,playback_rate:1}:{}) };
}
export function createSceneElement(type='text', index=0) {
  const common={ id:uid(), enabled:true, type, x:120+(index%5)*32, y:120+(index%5)*32, width:type==='text'?720:520, height:type==='text'?220:360, z_index:index, opacity:1, rotation_deg:0 };
  if(type==='text') return {...common,text:defaultText()};
  if(type==='weather') return {...common,weather:defaultWeather()};
  if(type==='video') return {...common,media:defaultMedia(true)};
  return {...common,media:defaultMedia(false)};
}
export function appendSceneElement(state) {
  addSceneElement(state, createSceneElement('text', state.scene?.elements?.length||0));
}
function label(text,control,className='field'){const n=document.createElement('label');n.className=className;const s=document.createElement('span');s.textContent=text;n.append(s,control);return n;}
function input(type,value,o={}){const n=document.createElement('input');n.type=type;if(value!==undefined&&value!==null)n.value=String(value);if(o.min!==undefined)n.min=String(o.min);if(o.max!==undefined)n.max=String(o.max);if(o.step!==undefined)n.step=String(o.step);if(o.placeholder)n.placeholder=o.placeholder;if(o.accept)n.accept=o.accept;return n;}
function select(value,options){const n=document.createElement('select');for(const [v,t] of options)n.append(new Option(t,v));n.value=String(value??'');return n;}
function check(v){const n=input('checkbox');n.checked=v===true;return n;}
function begin(control,cb){let done=false;const run=()=>{if(done)return;done=true;cb?.();};control.addEventListener('focus',run,{once:true});control.addEventListener('pointerdown',run,{once:true});}
function bind(control,event,fn,o){begin(control,o.onBeforeMutate);control.addEventListener(event,()=>{fn();o.onVisualChange?.();});return control;}
function item(state,id){return state.scene?.elements?.find((x)=>x.id===id)||null;}
function num(c,f=0){const v=Number(c.value);return Number.isFinite(v)?v:f;}
function patch(state,id,p){updateSceneElement(state,id,p);}
function nestedText(state,id,mutate){const current=structuredClone(item(state,id)?.text||defaultText());mutate(current);patch(state,id,{text:current});}
function common(state,element,o){
  const g=document.createElement('div');g.className='editor-element-group';
  const type=select(element.type,TYPES);type.setAttribute('aria-label','Тип элемента');begin(type,o.onBeforeMutate);type.addEventListener('change',()=>{const replacement=createSceneElement(type.value,state.scene.elements.findIndex((x)=>x.id===element.id));Object.assign(replacement,{id:element.id,enabled:element.enabled,x:element.x,y:element.y,width:element.width,height:element.height,z_index:element.z_index,opacity:element.opacity,rotation_deg:element.rotation_deg});replaceSceneElement(state,element.id,replacement);o.onStructureChange?.();});g.append(label('Тип',type));
  const enabled=check(element.enabled!==false);bind(enabled,'change',()=>patch(state,element.id,{enabled:enabled.checked}),o);g.append(label('Показывать',enabled,'editor-element-check'));
  const geometry=document.createElement('div');geometry.className='geometry-grid';
  for(const [caption,key,min,max] of [['X','x',0,1919],['Y','y',0,1079],['Ширина','width',1,1920],['Высота','height',1,1080],['Слой','z_index',-1000,1000],['Поворот','rotation_deg',-360,360]]){const c=input('number',element[key],{min,max,step:1});bind(c,'input',()=>patch(state,element.id,{[key]:num(c,element[key])}),o);geometry.append(label(caption,c));}
  g.append(geometry);const opacity=input('range',element.opacity??1,{min:0,max:1,step:.01});bind(opacity,'input',()=>patch(state,element.id,{opacity:num(opacity,1)}),o);g.append(label('Прозрачность',opacity));return g;
}
function textFields(state,element,o){
  const t=structuredClone(element.text||defaultText()), run=t.runs?.[0]||defaultText().runs[0], g=document.createElement('div');g.className='editor-element-group';
  const body=document.createElement('textarea');body.rows=3;body.maxLength=12000;body.value=run.value||'';bind(body,'input',()=>nestedText(state,element.id,(x)=>{x.runs[0]={...(x.runs[0]||run),value:body.value};}),o);g.append(label('Текст',body));
  const grid=document.createElement('div');grid.className='compact-form-grid';
  const specs=[['Шрифт','font_family',select(run.font_family,FONTS),(c)=>c.value,'change'],['Размер','font_size_px',input('number',run.font_size_px,{min:6,max:512,step:1}),(c)=>num(c,64),'input'],['Насыщенность','font_weight',input('number',run.font_weight,{min:100,max:900,step:100}),(c)=>num(c,400),'input'],['Цвет','color',input('color',run.color||'#FFFFFF'),(c)=>c.value,'input'],['Трекинг','tracking_px',input('number',run.tracking_px,{min:-20,max:100,step:.5}),(c)=>num(c,0),'input'],['Интерлиньяж, %','leading_percent',input('number',run.leading_percent,{min:50,max:400,step:1}),(c)=>num(c,120),'input'],['Масштаб X, %','horizontal_scale_percent',input('number',run.horizontal_scale_percent,{min:10,max:400,step:1}),(c)=>num(c,100),'input'],['Масштаб Y, %','vertical_scale_percent',input('number',run.vertical_scale_percent,{min:10,max:400,step:1}),(c)=>num(c,100),'input'],['Смещение базы','baseline_shift_px',input('number',run.baseline_shift_px,{min:-500,max:500,step:1}),(c)=>num(c,0),'input'],['Регистр','text_transform',select(run.text_transform,[['none','Как введено'],['uppercase','ВЕРХНИЙ'],['lowercase','нижний']]),(c)=>c.value,'change']];
  for(const [caption,key,c,read,event] of specs){bind(c,event,()=>nestedText(state,element.id,(x)=>{x.runs[0]={...(x.runs[0]||run),[key]:read(c)};}),o);grid.append(label(caption,c));}
  const italic=check(run.italic===true);bind(italic,'change',()=>nestedText(state,element.id,(x)=>{x.runs[0]={...(x.runs[0]||run),italic:italic.checked};}),o);grid.append(label('Курсив',italic,'editor-element-check'));g.append(grid);
  const pg=document.createElement('div');pg.className='compact-form-grid';
  for(const [caption,key,c] of [['Выравнивание','align',select(t.paragraph?.align,[['left','Слева'],['center','По центру'],['right','Справа']])],['По вертикали','vertical_align',select(t.paragraph?.vertical_align,[['top','Сверху'],['center','По центру'],['bottom','Снизу']])]]){bind(c,'change',()=>nestedText(state,element.id,(x)=>{x.paragraph={...x.paragraph,[key]:c.value};}),o);pg.append(label(caption,c));}
  const wrap=check(t.paragraph?.wrap!==false);bind(wrap,'change',()=>nestedText(state,element.id,(x)=>{x.paragraph={...x.paragraph,wrap:wrap.checked};}),o);pg.append(label('Перенос строк',wrap,'editor-element-check'));g.append(pg);
  const effects=document.createElement('div');effects.className='editor-element-effects';
  for(const [title,key,fields] of [['Обводка','stroke',[['width_px','Толщина',0,64],['color','Цвет']]],['Тень','shadow',[['offset_x_px','X',-500,500],['offset_y_px','Y',-500,500],['blur_px','Размытие',0,256],['color','Цвет']]],['Свечение','glow',[['blur_px','Размытие',0,256],['spread_px','Расширение',0,128],['color','Цвет']]]]){
    const box=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=title;box.append(legend);const e=t.effects?.[key]||defaultText().effects[key],enabled=check(e.enabled===true);bind(enabled,'change',()=>nestedText(state,element.id,(x)=>{x.effects[key]={...x.effects[key],enabled:enabled.checked};}),o);box.append(label('Включено',enabled,'editor-element-check'));const fg=document.createElement('div');fg.className='compact-form-grid';
    for(const [fk,caption,min,max] of fields){const color=fk==='color',c=color?input('color',e[fk]||'#000000'):input('number',e[fk],{min,max,step:1});bind(c,'input',()=>nestedText(state,element.id,(x)=>{x.effects[key]={...x.effects[key],[fk]:color?c.value:num(c,0)};}),o);fg.append(label(caption,c));}box.append(fg);effects.append(box);
  }g.append(effects);return g;
}
function weatherFields(state,element,o){
  const w=element.weather||defaultWeather(),g=document.createElement('div');g.className='editor-element-group';const grid=document.createElement('div');grid.className='compact-form-grid';
  const specs=[['Населённый пункт','location_name',input('text',w.location_name,{placeholder:'Хельсинки'}),(c)=>c.value],['Широта','latitude',input('number',w.latitude,{min:-90,max:90,step:.0001}),(c)=>c.value===''?null:num(c,null)],['Долгота','longitude',input('number',w.longitude,{min:-180,max:180,step:.0001}),(c)=>c.value===''?null:num(c,null)],['Часовой пояс','timezone',input('text',w.timezone||'auto'),(c)=>c.value],['Обновление, мин','refresh_minutes',input('number',w.refresh_minutes,{min:5,max:120,step:1}),(c)=>num(c,15)],['Прогнозов','forecast_items',input('number',w.forecast_items,{min:1,max:6,step:1}),(c)=>num(c,3)]];
  for(const [caption,key,c,read] of specs){bind(c,'input',()=>patch(state,element.id,{weather:{...(item(state,element.id)?.weather||defaultWeather()),[key]:read(c)}}),o);grid.append(label(caption,c));}g.append(grid);
  const tg=document.createElement('div');tg.className='editor-element-toggle-grid';for(const [caption,key] of [['Название места','show_location'],['Состояние','show_condition'],['Ощущается','show_feels_like'],['Влажность','show_humidity'],['Ветер','show_wind'],['Краткий прогноз','show_forecast'],['Анимация погоды','animation_enabled'],['Движение виджета','widget_motion_enabled']]){const c=check(w[key]!==false);bind(c,'change',()=>patch(state,element.id,{weather:{...(item(state,element.id)?.weather||defaultWeather()),[key]:c.checked}}),o);tg.append(label(caption,c,'editor-element-check'));}g.append(tg);return g;
}
function mediaFields(state,element,o){
  const video=element.type==='video',m=element.media||defaultMedia(video),g=document.createElement('div');g.className='editor-element-group';const st=document.createElement('small');st.className='editor-element-media-state';st.textContent=m.source_url||'Файл не загружен';const file=input('file',null,{accept:video?'video/mp4,video/webm':'image/png,image/jpeg,image/webp'}),upload=document.createElement('button');upload.type='button';upload.className='button button-secondary';upload.textContent='Загрузить файл';upload.addEventListener('click',async()=>{const f=file.files?.[0];if(!f||typeof o.onUpload!=='function')return;upload.disabled=true;upload.textContent='Загружаем…';try{const asset=await o.onUpload(f);o.onBeforeMutate?.();patch(state,element.id,{media:{...(item(state,element.id)?.media||defaultMedia(video)),source_url:asset.source_url}});st.textContent=asset.source_url;o.onVisualChange?.();}finally{upload.disabled=false;upload.textContent='Загрузить файл';}});g.append(label('Файл',file),upload,st);
  const grid=document.createElement('div');grid.className='compact-form-grid';const fit=select(m.fit,[['contain','Вписать'],['cover','Заполнить'],['fill','Растянуть']]);bind(fit,'change',()=>patch(state,element.id,{media:{...(item(state,element.id)?.media||defaultMedia(video)),fit:fit.value}}),o);grid.append(label('Вписывание',fit));
  for(const [caption,key] of [['Позиция X, %','position_x_percent'],['Позиция Y, %','position_y_percent']]){const c=input('number',m[key],{min:0,max:100,step:1});bind(c,'input',()=>patch(state,element.id,{media:{...(item(state,element.id)?.media||defaultMedia(video)),[key]:num(c,50)}}),o);grid.append(label(caption,c));}
  if(video){const rate=input('number',m.playback_rate,{min:.25,max:4,step:.05});bind(rate,'input',()=>patch(state,element.id,{media:{...(item(state,element.id)?.media||defaultMedia(true)),playback_rate:num(rate,1)}}),o);grid.append(label('Скорость',rate));for(const [caption,key] of [['Зациклить','loop'],['Без звука','muted']]){const c=check(m[key]!==false);bind(c,'change',()=>patch(state,element.id,{media:{...(item(state,element.id)?.media||defaultMedia(true)),[key]:c.checked}}),o);grid.append(label(caption,c,'editor-element-check'));}}g.append(grid);return g;
}
function renderProperties(state,o){
  const target=o.properties;if(!(target instanceof HTMLElement))return;target.replaceChildren();const element=item(state,state.selectedElementId);if(!element){const p=document.createElement('p');p.className='editor-muted';p.textContent='Добавьте элемент или выберите его в списке.';target.append(p);return;}
  const index=state.scene.elements.findIndex((x)=>x.id===element.id),head=document.createElement('div');head.className='editor-element-properties-head';const title=document.createElement('strong');title.textContent=`Элемент ${index+1}`;const del=document.createElement('button');del.type='button';del.className='button button-danger';del.textContent='Удалить';del.addEventListener('click',()=>{o.onBeforeMutate?.();removeSceneElement(state,element.id);o.onStructureChange?.();});head.append(title,del);target.append(head,common(state,element,o));if(element.type==='text')target.append(textFields(state,element,o));else if(element.type==='weather')target.append(weatherFields(state,element,o));else target.append(mediaFields(state,element,o));
}
export function renderSceneElements(state,{list,properties,onBeforeMutate,onVisualChange,onStructureChange,onUpload}){
  if(!(list instanceof HTMLElement))return;const o={properties,onBeforeMutate,onVisualChange,onStructureChange,onUpload};list.replaceChildren();const elements=Array.isArray(state.scene?.elements)?state.scene.elements:[];
  elements.forEach((element,index)=>{const row=document.createElement('button');row.type='button';row.className='editor-element-list-item';row.classList.toggle('is-selected',state.selectedElementId===element.id);row.dataset.sceneElementId=element.id;const a=document.createElement('strong');a.textContent=`Элемент ${index+1}`;const b=document.createElement('span');b.textContent=TYPES.find(([v])=>v===element.type)?.[1]||element.type;row.append(a,b);row.addEventListener('click',()=>{selectSceneElement(state,element.id);renderSceneElements(state,{list,properties,onBeforeMutate,onVisualChange,onStructureChange,onUpload});});list.append(row);});renderProperties(state,o);
}
