import { ValidationError } from '../shared/errors.js';
import { menuSettingsInput } from './menu-settings.js';
import { sceneInput } from './scene.js';

function templateName(value) {
  if(typeof value!=='string') throw new ValidationError('Укажите название пользовательской темы.');
  const name=value.trim();
  if(name.length<1 || name.length>80) throw new ValidationError('Название пользовательской темы должно содержать от 1 до 80 символов.');
  return name;
}

export function constructorThemeTemplateInput(value,{maxWidth=1920,maxHeight=1080,maxBytes=1024*1024}={}) {
  const source=value && typeof value==='object' && !Array.isArray(value) ? value : {};
  const rawSettings=source.settings && typeof source.settings==='object' && !Array.isArray(source.settings) ? source.settings : {};
  const settings=menuSettingsInput({
    ...rawSettings,
    theme:{schema_version:1,preset_id:'legacy',preset_version:1}
  },{allowBackgroundImage:true,maxWidth,maxHeight});
  const scene=sceneInput(source.scene,{maxWidth,maxHeight});
  const name=templateName(source.name);
  if(Buffer.byteLength(JSON.stringify({name,settings,scene}),'utf8')>maxBytes) {
    throw new ValidationError('Пользовательская тема слишком большая.');
  }
  return Object.freeze({name,settings,scene});
}
