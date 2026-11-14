import { ValidationError } from '../shared/errors.js';

export const MANAGER_ERROR_REPORT_TITLE = 'Сообщение об ошибке менеджера';

function text(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function redact(value, max) {
  return text(value, max)
    .replace(/(Bearer\s+)[a-z0-9._~+\/-]+/gi, '$1[скрыто]')
    .replace(/((?:password|passwd|token|secret|authorization|cookie|api[_-]?key)\s*[:=]\s*)[^\s,;&]+/gi, '$1[скрыто]')
    .replace(/([?&](?:password|token|secret|key|code|session)\s*=)[^&\s#]+/gi, '$1[скрыто]');
}

function pagePath(value) {
  const input = text(value, 500);
  if (!input.startsWith('/') || input.startsWith('//')) return '/manager';
  return input.split(/[?#]/, 1)[0] || '/manager';
}

function id(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function position(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    product_id:id(value.product_id),
    product_name:redact(value.product_name, 140),
    location_id:id(value.location_id),
    screen_id:id(value.screen_id),
    row_id:redact(value.row_id, 100)
  };
}

export function managerErrorReportInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('Не удалось подготовить отчёт об ошибке.');
  }
  const message = redact(raw.message, 1000);
  if (!message) throw new ValidationError('Сообщение об ошибке отсутствует.');
  const request = raw.request && typeof raw.request === 'object' && !Array.isArray(raw.request) ? raw.request : {};
  const status = Number(request.status);
  const positions = Array.isArray(raw.positions) ? raw.positions.slice(0, 12).map(position).filter(Boolean) : [];
  return {
    message,
    stack:redact(raw.stack, 6000),
    page:pagePath(raw.page),
    source:redact(raw.source, 160),
    operation:redact(raw.operation, 120),
    request:{
      method:['GET','POST','PUT','PATCH','DELETE'].includes(request.method) ? request.method : '',
      path:pagePath(request.path || ''),
      status:Number.isSafeInteger(status) && status >= 100 && status <= 599 ? status : null
    },
    preset:redact(raw.preset, 70),
    proposal_id:id(raw.proposal_id),
    positions,
    occurred_at:Number.isFinite(Date.parse(raw.occurred_at)) ? new Date(raw.occurred_at).toISOString() : null
  };
}

export async function createManagerErrorReport(store, { managerUsername, raw, userAgent = '' }) {
  const report = managerErrorReportInput(raw);
  const lines = [
    'Ошибка: '+report.message,
    'Раздел: '+report.page,
    report.operation ? 'Действие: '+report.operation : '',
    report.preset ? 'Тип заявки: '+report.preset : '',
    report.proposal_id ? 'Заявка №'+report.proposal_id : '',
    report.request.method ? 'API: '+report.request.method+' '+report.request.path : '',
    report.request.status ? 'HTTP: '+report.request.status : '',
    ...report.positions.map((item, index)=>
      'Позиция '+(index+1)+': '+[
        item.product_name,
        item.product_id ? 'товар ID '+item.product_id : '',
        item.location_id ? 'точка ID '+item.location_id : '',
        item.screen_id ? 'ТВ ID '+item.screen_id : '',
        item.row_id ? 'строка '+item.row_id : ''
      ].filter(Boolean).join(' · '))
  ].filter(Boolean);
  const description = lines.join('\n').slice(0, 2000);
  const details = { ...report, user_agent:text(userAgent, 400) };
  return store.transaction(async (tx) => {
    const card = await tx.createMessageCard({
      managerUsername, title:MANAGER_ERROR_REPORT_TITLE, description
    });
    await tx.recordProposalEvent(card.id, managerUsername, 'error_report', details);
    await tx.recordActivity({
      actor_username:managerUsername,
      action:'manager.error.reported',
      entity_type:'catalog_change_proposal',
      entity_id:card.id,
      message:'Менеджер сообщил об ошибке. Создана заявка №'+card.id+'.',
      severity:'error',
      category:'interface',
      details:JSON.stringify(details).slice(0, 12000),
      metadata:{page:report.page,source:report.source,user_agent:details.user_agent}
    });
    return { id:card.id };
  });
}
