import { replaceChildrenCompat } from '../core/dom-compat.js';
import { ALCOHOL_WARNING_TEXT } from '../themes/menu-theme-registry.js';

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
  'mira-serif-condensed':"'MIRA Serif Condensed','MIRA Serif',Georgia,serif"
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

export class MenuThemeRenderer {
  constructor(layer) {
    this.layer=layer;
    this.clockTimer=null;
    this.clockNode=null;
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

  render(runtime) {
    this.clearClock();
    replaceChildrenCompat(this.layer);
    const { theme,preset,layout }=runtime || {};
    this.layer.dataset.menuTheme=theme?.preset_id || 'legacy';
    if(!theme || theme.preset_id==='legacy' || !layout) return;

    const panel=node('div','menu-theme-side-panel');
    const brand=node('div','menu-theme-brand');
    if(theme.brand.logo_element_id) brand.classList.add('has-logo');
    const brandName=node('strong','menu-theme-brand-name');
    brandName.textContent=theme.brand.name || preset.visual?.brandText || '';
    brandName.style.fontFamily=fontFamily(theme.brand.name_font_family,'Arial,sans-serif');
    brandName.style.fontSize=theme.brand.name_font_size_px+'px';
    brandName.style.fontWeight=String(theme.brand.name_font_weight);
    const brandCaption=node('span','menu-theme-brand-caption');
    brandCaption.textContent=theme.brand.caption || preset.visual?.brandCaption || '';
    brandCaption.style.fontFamily=fontFamily(theme.brand.caption_font_family,'Arial,sans-serif');
    brandCaption.style.fontSize=theme.brand.caption_font_size_px+'px';
    brandCaption.style.fontWeight=String(theme.brand.caption_font_weight);
    brand.append(brandName,brandCaption);

    const utility=node('div','menu-theme-utility');
    const utilityMode=theme.utility_slot.mode || 'none';
    utility.dataset.utilityMode=utilityMode;
    utility.dataset.weatherVariant=preset.weather?.variant || theme.preset_id;
    if(utilityMode==='clock'){
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
    if(preset.visual?.decorAsset){
      decor.classList.add('has-asset');
      const image=node('img','menu-theme-decor-image');
      image.src=preset.visual.decorAsset;
      image.alt='';
      image.decoding='async';
      image.loading='eager';
      decor.append(image);
    }

    const footer=node('div','menu-theme-footer');
    footer.dataset.legalWarning='alcohol';
    const age=node('span','menu-theme-age'); age.textContent='18+';
    const warning=node('span','menu-theme-warning');
    warning.textContent=ALCOHOL_WARNING_TEXT;
    footer.append(age,warning);

    rectStyle(panel,layout.panel);
    rectStyle(brand,layout.brand);
    rectStyle(utility,layout.weather);
    rectStyle(decor,layout.decor);
    rectStyle(footer,layout.footer);

    panel.style.setProperty('--theme-panel',preset.visual?.panelBackground || '#090B0D');
    panel.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');
    brand.style.setProperty('--theme-brand',preset.visual?.brandColor || '#F3B91F');
    utility.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');
    footer.style.setProperty('--theme-border',preset.visual?.border || '#E3AD2B');

    this.layer.append(panel,brand,utility,decor,footer);
  }

  destroy() {
    this.clearClock();
    if (this.layer) replaceChildrenCompat(this.layer);
    this.layer=null;
  }
}
