// Shared presentation only: server owns incident states and CRM permissions.
const TYPES = Object.freeze({
  tv_offline:Object.freeze({ title:'Нет связи с телевизором', tag:'🔴' }),
  tv_restored:Object.freeze({ title:'Связь с телевизором восстановлена', tag:'🟢' }),
  request_new:Object.freeze({ title:'Новая заявка', tag:'🔔' })
});

function text(value, limit = 100) {
  return [...String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()]
    .slice(0, limit).join('');
}

export function noticeContent({ kind, location = '', subject = '', time = '', detail = '' } = {}) {
  if (!Object.hasOwn(TYPES, kind)) throw new TypeError('Unknown MIRA-TV notice kind.');
  const meta = TYPES[kind];
  const payload = {
    kind,
    location:text(location),
    subject:text(subject),
    time:text(time, 64),
    detail:text(detail, 180)
  };
  const caption = meta.tag + ' ' + meta.title + (payload.location ? '\n' + payload.location : '') +
    (payload.subject ? ' · ' + payload.subject : '');
  return { payload, caption, plainText:caption + (payload.detail ? '\n' + payload.detail : '') };
}

export function secureMiniAppUrl(url) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== 'https:' || !parsed.hostname ||
      parsed.username || parsed.password || parsed.href.length > 2048) {
    throw new TypeError('Mini App URL must use public HTTPS.');
  }
  return parsed.href;
}
