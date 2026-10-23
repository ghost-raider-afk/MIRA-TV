// The stored audit code is kept intact for diagnostics; the UI never exposes it for CRM.
export function journalEventMessage(event) {
  const message=String(event?.message || '');
  const legacy=message.match(/^Обработка заявки №(\d+): ([a-z_]+)\.$/);
  if (!legacy) return message;
  const id=legacy[1];
  switch(legacy[2]) {
    case 'review': return 'Администратор рассмотрел заявку №'+id+'.';
    case 'complete': return 'Администратор вручную завершил заявку №'+id+'.';
    case 'save_product': return 'Администратор сохранил товар по заявке №'+id+'.';
    case 'rework': return 'Администратор вернул заявку №'+id+' на доработку.';
    case 'rejected': return 'Администратор отклонил заявку №'+id+'.';
    default: return 'Действие с заявкой №'+id+'.';
  }
}
export function journalActionLabel(event) {
  const code=String(event?.action || '');
  if(code.startsWith('crm.request.') || code.startsWith('manager.card.')) return '';
  return code ? 'Действие: '+code : '';
}
