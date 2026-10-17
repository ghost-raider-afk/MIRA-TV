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

function chalkIconSvg(key, common) {
  const cloud='<path class="theme-weather-icon-primary theme-weather-icon-cloud" d="M14 46c-2-8 3-14 11-14 2-9 9-14 18-13 9 1 14 7 15 15 7 1 11 6 10 12-1 6-5 10-12 10H24c-6 0-9-4-10-10Z"/><path class="theme-weather-icon-primary" d="M17 49c9 2 29 2 43 0" opacity=".38"/>';
  const sun='<g class="theme-weather-icon-accent"><path d="M21 8l1 7M9 15l6 4M6 29l8-1M12 41l5-5M29 7l-2 7M39 13l-5 5"/><path class="theme-weather-icon-sun-disc" d="M16 25c0-7 5-12 12-12 8 0 13 5 13 12 0 8-5 13-13 13-7 0-12-5-12-13Z"/></g>';
  if(key==='sun') return `<svg ${common}><g class="theme-weather-icon-accent"><path d="M31 5l1 10M14 11l7 8M6 29l11 1M11 48l8-7M31 48v11M48 43l7 7M48 22l9-5"/><path class="theme-weather-icon-sun-disc" d="M18 31c0-9 6-15 15-15 10 0 16 6 16 15 0 10-7 17-16 17-9 0-15-7-15-17Z"/><path d="M20 33c7 2 18 2 27-1" opacity=".35"/></g></svg>`;
  if(key==='moon') return `<svg ${common}><path class="theme-weather-icon-primary" d="M44 45c-15 4-28-6-28-21 0-8 4-15 10-19-1 13 8 24 21 25 5 0 9-1 12-4-2 9-7 16-15 19Z"/><path class="theme-weather-icon-primary" d="M20 22c1 11 8 18 18 21" opacity=".35"/><path class="theme-weather-icon-accent theme-weather-icon-stars" d="m50 9 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z"/></svg>`;
  if(key==='rain') return `<svg ${common}>${cloud}<path class="theme-weather-icon-accent" d="M22 57l-3 6M35 56l-3 7M49 57l-3 6"/><path class="theme-weather-icon-accent" d="M24 56l-2 4M51 56l-2 4" opacity=".38"/></svg>`;
  if(key==='snow') return `<svg ${common}>${cloud}<g class="theme-weather-icon-accent"><path d="M21 57h10M26 52v10M37 57h10M42 52v10"/><path d="m22 53 8 8M30 53l-8 8M38 53l8 8M46 53l-8 8" opacity=".55"/></g></svg>`;
  if(key==='storm') return `<svg ${common}>${cloud}<path class="theme-weather-icon-accent theme-weather-icon-bolt" d="m35 45-8 12h8l-3 7 14-15h-8l4-4Z"/><path class="theme-weather-icon-accent" d="M21 58l-2 5M51 57l-3 6" opacity=".45"/></svg>`;
  if(key==='fog') return `<svg ${common}>${cloud}<g class="theme-weather-icon-accent"><path d="M13 58c11-2 27-2 39 0M18 63c9-1 21-1 31 0"/><path d="M15 60c9 1 23 1 35 0" opacity=".35"/></g></svg>`;
  if(key==='cloud') return `<svg ${common}>${cloud}</svg>`;
  if(key==='cloudy-night') return `<svg ${common}><path class="theme-weather-icon-accent" d="M42 26c-9 1-16-5-16-14 0-4 1-7 4-10-1 8 5 15 13 16 4 0 7-1 9-3-1 6-5 10-10 11Z"/>${cloud}</svg>`;
  return `<svg ${common}>${sun}${cloud}</svg>`;
}

function iconSvg(name, variant='premium') {
  const allowed=new Set(['sun','moon','rain','snow','storm','fog','cloud','cloudy-night','partly-cloudy']);
  const key=allowed.has(String(name || '')) ? String(name) : 'partly-cloudy';
  const common=`viewBox="0 0 64 64" class="theme-weather-icon-svg" data-icon="${key}" aria-hidden="true" focusable="false"`;
  if(variant==='chalk') return chalkIconSvg(key,common);
  const sun=`<g class="theme-weather-icon-accent"><circle class="theme-weather-icon-sun-disc" cx="22" cy="20" r="9"/><path d="M22 5v6M22 29v6M7 20h6M31 20h6M11.5 9.5l4.2 4.2M28.3 26.3l4.2 4.2M32.5 9.5l-4.2 4.2"/></g>`;
  const cloud=`<path class="theme-weather-icon-primary theme-weather-icon-cloud" d="M16 47h34a11 11 0 0 0-3-21 16 16 0 0 0-29 7A8 8 0 0 0 16 47Z"/>`;
  if(key==='sun') return `<svg ${common}><g class="theme-weather-icon-accent"><circle class="theme-weather-icon-sun-disc" cx="32" cy="32" r="13"/><path d="M32 6v9M32 49v9M6 32h9M49 32h9M13.6 13.6l6.4 6.4M44 44l6.4 6.4M50.4 13.6 44 20M20 44l-6.4 6.4"/></g></svg>`;
  if(key==='moon'){
    const stars=variant==='premium' ? '' : '<path class="theme-weather-icon-accent theme-weather-icon-stars" d="m49 16 1.8 4 4.2 1.8-4.2 1.8-1.8 4-1.8-4-4.2-1.8 4.2-1.8 1.8-4Zm-6 15 1.2 2.7 2.8 1.2-2.8 1.2-1.2 2.7-1.2-2.7-2.8-1.2 2.8-1.2L43 31Z"/>';
    return `<svg ${common}><path class="theme-weather-icon-primary" d="M46 43A22 22 0 1 1 29 8a18 18 0 0 0 17 35Z"/>${stars}</svg>`;
  }
  if(key==='rain') return `<svg ${common}>${cloud}<path class="theme-weather-icon-accent" d="m22 51-3 7M34 51l-3 7M46 51l-3 7"/></svg>`;
  if(key==='snow') return `<svg ${common}>${cloud}<path class="theme-weather-icon-accent" d="M19 54h10M24 49v10M36 54h10M41 49v10"/></svg>`;
  if(key==='storm') return `<svg ${common}>${cloud}<path class="theme-weather-icon-accent theme-weather-icon-bolt" d="m34 43-8 11h8l-4 7 13-14h-8l4-4Z"/></svg>`;
  if(key==='fog') return `<svg ${common}><path class="theme-weather-icon-primary" d="M17 36h31a10 10 0 0 0-2-20 15 15 0 0 0-28 6A8 8 0 0 0 17 36Z"/><path class="theme-weather-icon-accent" d="M13 46h38M18 54h30"/></svg>`;
  if(key==='cloud') return `<svg ${common}>${cloud}</svg>`;
  if(key==='cloudy-night') return `<svg ${common}><path class="theme-weather-icon-accent" d="M43 23A15 15 0 0 1 31 6a17 17 0 0 0 18 24"/>${cloud}</svg>`;
  return `<svg ${common}>${sun}${cloud}</svg>`;
}

function brandWeatherMarkSvg() {
  return '<svg viewBox="0 0 34 26" aria-hidden="true" focusable="false"><path d="M17 2c-3 4-5 7-5 10-3-2-5-2-7-1 1 5 4 8 8 10-1 1-1 2-1 3h10c0-1 0-2-1-3 4-2 7-5 8-10-2-1-4-1-7 1 0-3-2-6-5-10Zm0 4c2 3 3 5 3 8l-3 4-3-4c0-3 1-5 3-8Z"/></svg>';
}

function forecastItem(item, timezone, variant) {
  const entry=node('div','theme-weather-forecast-item');
  const time=node('span','theme-weather-forecast-time');
  time.textContent=timeLabel(item?.time,timezone);
  const icon=node('i','theme-weather-forecast-icon');
  icon.innerHTML=iconSvg(item?.icon || 'cloud',variant);
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
  root.dataset.iconStyle=preset.weather?.icon_style || variant;
  root.style.setProperty('--theme-weather-icon-scale',String(Math.max(.8,Math.min(2,number(theme.utility_slot.icon_scale_percent,100)/100))));
  root.style.setProperty('--theme-weather-condition-font',fontFamily(preset.weather?.condition_font_family,'Arial,sans-serif'));
  root.style.setProperty('--theme-weather-forecast-font',fontFamily(preset.weather?.forecast_font_family,'Arial,sans-serif'));

  const location=node('strong','theme-weather-location');
  location.textContent=snapshot.location_name || settings.location_name || 'Погода';
  location.style.fontFamily=fontFamily(theme.utility_slot.font_family,'Arial,sans-serif');
  location.style.fontSize=`${Math.round(number(theme.utility_slot.location_font_size_pt,14) * 4 / 3)}px`;
  location.style.fontWeight=String(number(preset.weather?.location_font_weight,900));

  const current=node('div','theme-weather-current');
  const currentIcon=node('i','theme-weather-current-icon');
  currentIcon.innerHTML=iconSvg(snapshot.icon || 'cloud',variant);
  const temperature=node('strong','theme-weather-temperature');
  temperature.textContent=`${Math.round(number(snapshot.temperature))}°`;
  temperature.style.fontFamily=fontFamily(theme.utility_slot.temperature_font_family,'Arial,sans-serif');
  temperature.style.fontSize=`${Math.round(number(theme.utility_slot.temperature_font_size_pt,48) * 4 / 3)}px`;
  temperature.style.fontWeight=String(number(preset.weather?.temperature_font_weight,900));
  const currentCopy=node('div','theme-weather-current-copy');
  if(preset.weather?.show_now_label){
    const now=node('small','theme-weather-now');
    now.textContent='СЕЙЧАС';
    currentCopy.append(now);
  }
  if(theme.utility_slot.weather?.show_condition !== false){
    const condition=node('span','theme-weather-condition');
    condition.textContent=String(snapshot.condition || 'Погода');
    currentCopy.append(condition);
  }
  current.append(currentIcon,temperature,currentCopy);

  const forecast=node('div','theme-weather-forecast');
  if(theme.utility_slot.weather?.show_forecast !== false){
    const items=Array.isArray(snapshot.forecast) ? snapshot.forecast : [];
    for(const item of items.slice(0,Number(theme.utility_slot.weather?.forecast_items) || 3)){
      forecast.append(forecastItem(item,snapshot.timezone || settings.timezone,variant));
    }
  }

  root.append(location);
  if(variant==='brand-premium'){
    const brandMark=node('span','theme-weather-brand-mark');
    brandMark.innerHTML=brandWeatherMarkSvg();
    root.append(brandMark);
  }
  root.append(current);
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
    const presetDecor=String(preset.visual?.decorAsset || '');
    const configuredDecor=String(theme.decor?.source_url || '').trim();
    const managedThemeAsset=configuredDecor.startsWith('/brand/themes/');
    const decorSource=(managedThemeAsset ? presetDecor : configuredDecor) || presetDecor;
    if(decorSource){
      decor.classList.add('has-asset');
      const image=node('img','menu-theme-decor-image');
      image.src=decorSource;
      image.alt='';
      image.decoding='async';
      image.loading='eager';
      image.style.objectFit=preset.visual?.decorFit || 'cover';
      const handleDecorError=()=>{
        if(presetDecor && image.dataset.presetFallback!=='true' && image.getAttribute('src')!==presetDecor){
          image.dataset.presetFallback='true';
          image.src=presetDecor;
          return;
        }
        image.removeEventListener('error',handleDecorError);
        image.remove();
        decor.classList.remove('has-asset');
        decor.classList.add('is-missing');
      };
      image.addEventListener('error',handleDecorError);
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
