import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { PayloadTooLargeError, ValidationError } from '../shared/errors.js';
import { validateImage } from './image-validation.js';

const execFileAsync = promisify(execFile);
const SCENE_DIR = 'scene';
const MEDIA = Object.freeze({
  'image/png': { kind: 'image', extension: 'png' },
  'image/jpeg': { kind: 'image', extension: 'jpg' },
  'image/webp': { kind: 'image', extension: 'webp' },
  'video/mp4': { kind: 'video', extension: 'mp4' },
  'video/webm': { kind: 'video', extension: 'webm' }
});

function normalizedContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}
function limitText(config) {
  const megabytes = config.sceneAssetMaxBytes / (1024 * 1024);
  return Number.isInteger(megabytes) ? `${megabytes} МБ` : `${megabytes.toFixed(1)} МБ`;
}
function tooLarge(config) {
  return new PayloadTooLargeError(`Медиафайл элемента превышает допустимый размер ${limitText(config)}.`);
}
function assertSize(size, config) {
  if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError('Медиафайл элемента пустой или имеет некорректный размер.');
  if (size > config.sceneAssetMaxBytes) throw tooLarge(config);
}
function declaredLength(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function resolveMedia(value) {
  const mime = normalizedContentType(value);
  const media = MEDIA[mime];
  if (!media) throw new ValidationError('Элементы сцены поддерживают PNG, JPEG, WebP, MP4 и WebM.');
  return { mime, media };
}
function scenePaths(config, media) {
  const filename = `scene-${crypto.randomUUID()}.${media.extension}`;
  const directory = path.join(config.siteAssetsRoot, SCENE_DIR);
  return { filename, directory, target:path.join(directory,filename), temporary:path.join(directory,`.${filename}.upload`) };
}
function videoContainerMatches(mime, formatName) {
  const formats=String(formatName||'').toLowerCase().split(',').map((v)=>v.trim()).filter(Boolean);
  if(mime==='video/webm') return formats.includes('webm');
  return formats.includes('mp4')||formats.includes('mov');
}
async function inspectVideo(file, config, mime) {
  let stdout;
  try {
    ({stdout}=await execFileAsync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,codec_name:format=format_name','-of','json',file],{timeout:12000,maxBuffer:1024*1024}));
  } catch {
    throw new ValidationError('Видео элемента не удалось прочитать через ffprobe. Проверьте MP4/WebM файл.');
  }
  let probe; try{probe=JSON.parse(stdout);}catch{}
  const stream=probe?.streams?.[0], width=Number(stream?.width), height=Number(stream?.height);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1) throw new ValidationError('Видео элемента не содержит корректного видеопотока.');
  if(!videoContainerMatches(mime,probe?.format?.format_name)) throw new ValidationError('MIME-тип видео не соответствует контейнеру.');
  if(width>config.screenMaxWidth||height>config.screenMaxHeight||width*height>config.imageMaxPixels) throw new ValidationError(`Видео элемента превышает допустимое разрешение ${config.screenMaxWidth}×${config.screenMaxHeight}.`);
  return {width,height,codec:String(stream.codec_name||'')};
}
async function inspectFile(file, media, mime, config) {
  if(media.kind==='video') return inspectVideo(file,config,mime);
  const bytes=await readFile(file);
  const image=await validateImage(bytes,{allowedTypes:['png','jpeg','webp'],maxWidth:config.screenMaxWidth,maxHeight:config.screenMaxHeight,maxPixels:config.imageMaxPixels,label:'Изображение элемента'});
  const detected=image.type==='jpeg'?'image/jpeg':`image/${image.type}`;
  if(detected!==mime) throw new ValidationError('MIME-тип изображения не соответствует содержимому файла.');
  return {width:image.width,height:image.height};
}
async function writeChunk(handle, chunk) {
  let offset=0;
  while(offset<chunk.length){
    const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);
    if(bytesWritten<1) throw new Error('Не удалось записать медиафайл элемента.');
    offset+=bytesWritten;
  }
}
export async function createSceneAssetStream({stream,contentLength,contentType,config}) {
  const {mime,media}=resolveMedia(contentType), declared=declaredLength(contentLength);
  if(declared!==null) assertSize(declared,config);
  const paths=scenePaths(config,media);
  await mkdir(paths.directory,{recursive:true,mode:0o770});
  let handle,size=0;
  try {
    handle=await open(paths.temporary,'wx',0o640);
    for await (const part of stream) {
      const chunk=Buffer.isBuffer(part)?part:Buffer.from(part);
      size+=chunk.length;
      if(size>config.sceneAssetMaxBytes) throw tooLarge(config);
      await writeChunk(handle,chunk);
    }
    await handle.close(); handle=null; assertSize(size,config);
    const info=await inspectFile(paths.temporary,media,mime,config);
    await rename(paths.temporary,paths.target);
    return Object.freeze({source_url:`/site-assets/${SCENE_DIR}/${paths.filename}`,kind:media.kind,media_type:mime,width:info.width,height:info.height,size});
  } catch(error) {
    if(handle) await handle.close().catch(()=>undefined);
    await unlink(paths.temporary).catch(()=>undefined);
    throw error;
  }
}
