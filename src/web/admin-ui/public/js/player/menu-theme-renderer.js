import { replaceChildrenCompat } from '../core/dom-compat.js';

const FONT_STACKS = Object.freeze({
  'arial-narrow':"'Arial Narrow','Liberation Sans Narrow',Arial,sans-serif",
  'tahoma-bold':"Tahoma,Arial,sans-serif",
  arial:"Arial,'Liberation Sans',sans-serif",
  'dejavu-condensed':"'DejaVu Sans Condensed','DejaVu Sans',sans-serif",
  'liberation-narrow':"'Liberation Sans Narrow','Arial Narrow',Arial,sans-serif",
  'system-sans':"'MIRA Sans',Arial,sans-serif",
  'mira-condensed':"'MIRA Sans Condensed','DejaVu Sans Condensed',Arial,sans-serif",
  'mira-mono':"'MIRA Sans Mono','DejaVu Sans Mono',monospace",
  'mira-serif':"'MIRA Serif',Georgia,serif",
  'mira-serif-condensed':"'MIRA Serif Condensed','MIRA Serif',Georgia,serif",
  montserrat:'"MIRA Montserrat","MIRA Sans",Arial,sans-serif',
  'roboto-condensed':'"MIRA Roboto Condensed","MIRA Sans Condensed",Arial,sans-serif',
  oswald:'"MIRA Oswald","MIRA Sans Condensed",Arial,sans-serif',
  'russo-one':'"MIRA Russo One","MIRA Sans",Arial,sans-serif',
  neucha:'"MIRA Neucha","MIRA Sans",Arial,sans-serif',
  'pt-sans-narrow':'"MIRA PT Sans Narrow","MIRA Sans Condensed",Arial,sans-serif',
  'yanone-kaffeesatz':'"MIRA Yanone Kaffeesatz","MIRA Sans Condensed",Arial,sans-serif',
  underdog:'"MIRA Underdog","MIRA Sans",Arial,sans-serif'
});

function node(tag,className='') {
  const value=document.createElement(tag);
  if(className) value.className=className;
  return value;
}

function rectStyle(target,rect) {
  if(!target || !rect) return;
  target.style.left=rect.x+'px';
  target.style.top=rect.y+'px';
  target.style.width=rect.width+'px';
  target.style.height=rect.height+'px';
}

function fontFamily(key,fallback) {
  return FONT_STACKS[key] || fallback;
}

function number(value,fallback=0) {
  const result=Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function timeLabel(value, timezone='auto') {
  const source=String(value || '').trim();
  const local=/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::\d{2})?$/.exec(source);
  if(local) return `${local[1]}:${local[2]}`;
  const date=new Date(source);
  if(!Number.isFinite(date.getTime())) return '—';
  const options={hour:'2-digit',minute:'2-digit'};
  if(timezone && timezone!=='auto') options.timeZone=timezone;
  try { return new Intl.DateTimeFormat('ru-RU',options).format(date); }
  catch { return new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(date); }
}

function iconSvg(name) {
  const common='viewBox="0 0 64 64" aria-hidden="true" focusable="false"';
  if(name==='sun') return `<svg ${common}><circle cx="32" cy="32" r="13"/><path d="M32 6v9M32 49v9M6 32h9M49 32h9M13.6 13.6l6.4 6.4M44 44l6.4 6.4M50.4 13.6 44 20M20 44l-6.4 6.4"/></svg>`;
  if(name==='moon') return `<svg ${common}><path d="M46 43A22 22 0 1 1 29 8a18 18 0 0 0 17 35Z"/></svg>`;
  if(name==='rain') return `<svg ${common}><path d="M17 39h31a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 17 39Z"/><path d="m22 47-3 8M34 47l-3 8M46 47l-3 8"/></svg>`;
  if(name==='snow') return `<svg ${common}><path d="M17 38h31a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 17 38Z"/><path d="M20 50h8M24 46v8M36 50h8M40 46v8"/></svg>`;
  if(name==='storm') return `<svg ${common}><path d="M17 39h31a11 11 0 0 0-2-22 16 16 0 0 0-29 6A8 8 0 0 0 17 39Z"/><path d="m34 42-8 11h8l-4 7 13-14h-8l4-4Z"/></svg>`;
  if(name==='fog') return `<svg ${common}><path d="M17 34h31a10 10 0 0 0-2-20 15 15 0 0 0-28 6A8 8 0 0 0 17 34Z"/><path d="M13 43h38M18 51h30"/></svg>`;
  if(name==='cloud') return `<svg ${common}><path d="M16 43h33a12 12 0 0 0-3-23 17 17 0 0 0-31 7A9 9 0 0 0 16 43Z"/></svg>`;
  if(name==='cloudy-night') return `<svg ${common}><path d="M43 23A15 15 0 0 1 31 6a17 17 0 0 0 18 24"/><path d="M14 48h34a10 10 0 0 0-2-19 15 15 0 0 0-28 6A8 8 0 0 0 14 48Z"/></svg>`;
  return `<svg ${common}><circle cx="22" cy="20" r="9"/><path d="M16 47h34a11 11 0 0 0-3-21 16 16 0 0 0-29 7A8 8 0 0 0 16 47Z"/></svg>`;
}

function forecastItem(item, timezone) {
  const entry=node('div','theme-weather-forecast-item');
  const time=node('span','theme-weather-forecast-time');
  time.textContent=timeLabel(item?.time,timezone);
  const icon=node('i','theme-weather-forecast-icon');
  icon.innerHTML=iconSvg(item?.icon || 'cloud');
  const temperature=node('strong','theme-weather-forecast-temperature');
  temperature.textContent=`${Math.round(number(item?.temperature))}°`;
  entry.append(time,icon,temperature);
  return entry;
}

export function renderThemeWeatherWidget(layer, settings, snapshot, runtime) {
  if(!(layer instanceof HTMLElement)) return;
  replaceChildrenCompat(layer);
  const preset=runtime?.preset;
  const theme=runtime?.theme;
  if(!preset || preset.id==='legacy' || theme?.utility_slot?.mode!=='weather' || !settings?.enabled || !snapshot) return;

  const variant=preset.weather?.variant || preset.id;
  const root=node('section',`theme-weather theme-weather--${variant}`);
  root.dataset.weatherVariant=variant;

  const location=node('strong','theme-weather-location');
  location.textContent=snapshot.location_name || settings.location_name || 'Погода';
  location.style.fontFamily=fontFamily(theme.utility_slot.font_family,'Arial,sans-serif');

  const current=node('div','theme-weather-current');
  const currentIcon=node('i','theme-weather-current-icon');
  currentIcon.innerHTML=iconSvg(snapshot.icon || 'cloud');
  const temperature=node('strong','theme-weather-temperature');
  temperature.textContent=`${Math.round(number(snapshot.temperature))}°`;
  temperature.style.fontFamily=fontFamily(theme.utility_slot.temperature_font_family,'Arial,sans-serif');
  temperature.style.fontSize=`${Math.round(number(theme.utility_slot.temperature_font_size_pt,48) * 4 / 3)}px`;
  const currentCopy=node('div','theme-weather-current-copy');
  if(preset.weather?.show_now_label){
    const now=node('small','theme-weather-now');
    now.textContent='СЕЙЧАС';
    currentCopy.append(now);
  }
  if(theme.utility_slot.weather?.show_condition !== false){
    const condition=node('span','theme-weather-condition');
    condition.textContent=String(snapshot.condition || 'Погода').toUpperCase();
    currentCopy.append(condition);
  }
  current.append(currentIcon,temperature,currentCopy);

  const forecast=node('div','theme-weather-forecast');
  if(theme.utility_slot.weather?.show_forecast !== false){
    const items=Array.isArray(snapshot.forecast) ? snapshot.forecast : [];
    for(const item of items.slice(0,Number(theme.utility_slot.weather?.forecast_items) || 3)){
      forecast.append(forecastItem(item,snapshot.timezone || settings.timezone));
    }
  }

  root.append(location,current);
  if(forecast.childElementCount) root.append(forecast);
  layer.append(root);
}

export class MenuThemeRenderer {
  constructor(layer) {
    this.layer=layer;
    this.clockTimer=null;
    this.clockNode=null;
    this.weatherNode=null;
    this.runtime=null;
    layer.classList.add('tv-player-theme-layer');
    layer.setAttribute('aria-hidden','true');
  }

  clearClock() {
    if(this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer=null;
    this.clockNode=null;
  }

  renderClock() {
    if(!this.clockNode) return;
    const now=new Date();
    const time=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(now);
    const date=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'long'}).format(now);
    replaceChildrenCompat(this.clockNode);
    const strong=node('strong'); strong.textContent=time;
    const small=node('span'); small.textContent=date;
    this.clockNode.append(strong,small);
  }

  weatherMount() {
    return this.weatherNode;
  }

  renderWeather(layer, settings, snapshot) {
    renderThemeWeatherWidget(layer,settings,snapshot,this.runtime);
  }

  render(runtime) {
    this.clearClock();
    this.weatherNode=null;
    this.runtime=runtime || null;
    replaceChildrenCompat(this.layer);
    const { theme,preset,layout }=runtime || {};
    this.layer.dataset.menuTheme=theme?.preset_id || 'legacy';
    if(!theme || theme.preset_id==='legacy' || !layout) return;

    const panel=node('div','menu-theme-side-panel');
    panel.dataset.themeVariant=preset.id;

    const logo=node('div','menu-theme-logo');
    if(theme.brand.logo_url){
      const image=node('img','menu-theme-logo-image');
      image.src=theme.brand.logo_url;
      image.alt='';
      image.decoding='async';
      image.loading='eager';
      logo.append(image);
    }

    const brand=node('div','menu-theme-brand');
    brand.dataset.brandVariant=preset.id;
    const brandName=node('strong','menu-theme-brand-name');
    brandName.textContent=theme.brand.name || preset.visual?.brandText || '';
    brandName.style.fontFamily=fontFamily(theme.brand.name_font_family,'Arial,sans-serif');
    brandName.style.fontSize=theme.brand.name_font_size_px+'px';
    brandName.style.fontWeight=String(theme.brand.name_font_weight);
    const divider=node('span','menu-theme-brand-divider');
    divider.dataset.divider=preset.visual?.brandDivider || 'none';
    const brandCaption=node('span','menu-theme-brand-caption');
    brandCaption.textContent=theme.brand.caption || preset.visual?.brandCaption || '';
    brandCaption.style.fontFamily=fontFamily(theme.brand.caption_font_family,'Arial,sans-serif');
    brandCaption.style.fontSize=theme.brand.caption_font_size_px+'px';
    brandCaption.style.fontWeight=String(theme.brand.caption_font_weight);
    brand.append(brandName,divider,brandCaption);

    const utility=node('div','menu-theme-utility');
    const utilityMode=theme.utility_slot.mode || 'none';
    utility.dataset.utilityMode=utilityMode;
    utility.dataset.weatherVariant=preset.weather?.variant || theme.preset_id;
    if(utilityMode==='weather'){
      this.weatherNode=utility;
    }else if(utilityMode==='clock'){
      utility.classList.add('is-clock');
      utility.style.fontFamily=fontFamily(theme.utility_slot.font_family,'Arial,sans-serif');
      utility.style.setProperty('--theme-clock-size',(Number(preset.visual?.clockFontSizePx)||78)+'px');
      this.clockNode=utility;
      this.renderClock();
      this.clockTimer=setInterval(()=>this.renderClock(),60000);
    }else if(utilityMode==='text'){
      utility.classList.add('is-text');
      utility.style.fontFamily=fontFamily(theme.utility_slot.font_family,'Arial,sans-serif');
      utility.style.fontSize=theme.utility_slot.font_size_px+'px';
      utility.style.fontWeight=String(theme.utility_slot.font_weight);
      utility.textContent=theme.utility_slot.text || '';
    }

    const decor=node('div','menu-theme-decor');
    const decorSource=theme.decor?.source_url || preset.visual?.decorAsset || '';
    if(decorSource){
      decor.classList.add('has-asset');
      const image=node('img','menu-theme-decor-image');
      image.src=decorSource;
      image.alt='';
      image.decoding='async';
      image.loading='eager';
      image.style.objectFit=preset.visual?.decorFit || 'cover';
      decor.append(image);
    }

    const footer=node('div','menu-theme-footer');
    footer.dataset.legalWarning='alcohol';
    footer.dataset.legalVariant=preset.visual?.legalVariant || preset.id;
    const age=node('span','menu-theme-age');
    age.textContent=theme.legal?.age_text || preset.visual?.ageText || '18+';
    const warning=node('span','menu-theme-warning');
    warning.textContent=theme.legal?.text || preset.visual?.footerText || '';
    warning.style.fontFamily=fontFamily(theme.legal?.font_family,'Arial,sans-serif');
    warning.style.fontSize=(Number(theme.legal?.font_size_px)||30)+'px';
    warning.style.fontWeight=String(Number(theme.legal?.font_weight)||600);
    warning.style.letterSpacing=(Number(theme.legal?.letter_spacing_px)||0)+'px';
    footer.append(age,warning);

    rectStyle(panel,layout.panel);
    rectStyle(logo,layout.logo);
    rectStyle(brand,layout.brand);
    rectStyle(utility,layout.weather);
    rectStyle(decor,layout.decor);
    rectStyle(footer,layout.footer);

    panel.style.setProperty('--theme-panel',preset.visual?.panelBackground || '#090B0D');
    panel.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');
    brand.style.setProperty('--theme-brand',preset.visual?.brandColor || '#F3B91F');
    utility.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');
    footer.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');

    this.layer.append(panel);
    if(logo.childElementCount) this.layer.append(logo);
    this.layer.append(brand,utility,decor,footer);
  }

  destroy() {
    this.clearClock();
    if(this.layer) replaceChildrenCompat(this.layer);
    this.weatherNode=null;
    this.runtime=null;
    this.layer=null;
  }
}
