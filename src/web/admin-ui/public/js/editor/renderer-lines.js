import { buildDisplayLines as buildBaseDisplayLines } from './renderer-model.js';

function sectionTypeFor(model, line) {
  if (line?.virtual === true || !line?.sourceRowId) return 'products';
  const row = model.rows.find((item) => String(item?.id) === String(line.sourceRowId));
  return row?.section_type === 'packaging' ? 'packaging' : 'products';
}

export function buildDisplayLines(model, options) {
  const base = buildBaseDisplayLines(model, options);
  const readable = String(model?.settings?.table_style || 'legacy') === 'readable';
  let productHeaderSeen = false;

  return Object.freeze(base.map((line) => {
    if (line.kind !== 'section') return line;
    const sectionType = sectionTypeFor(model, line);
    let showPriceLabels = sectionType === 'products';
    if (!readable) {
      showPriceLabels = showPriceLabels && !productHeaderSeen;
      if (sectionType === 'products') productHeaderSeen = true;
    }
    return Object.freeze({ ...line, sectionType, showPriceLabels });
  }));
}
