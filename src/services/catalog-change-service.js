import { packagingInput, productInput } from '../contracts/input.js';

const PRODUCT_FIELDS = Object.freeze([
  'name', 'producer', 'address', 'characteristics', 'strength', 'price_primary', 'price_secondary',
  'alcoholic', 'beverage_color', 'filtration', 'active'
]);
const PACKAGING_FIELDS = Object.freeze(['name', 'unit_price', 'active']);

function fieldsFor(entityType) {
  if (entityType === 'product') return PRODUCT_FIELDS;
  if (entityType === 'packaging') return PACKAGING_FIELDS;
  throw new TypeError('Unsupported catalog entity type.');
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function catalogProposalInput(entityType, value) {
  if (entityType === 'product') return productInput(value || {});
  if (entityType === 'packaging') return packagingInput(value || {});
  throw new TypeError('Unsupported catalog entity type.');
}

export function catalogEntitySnapshot(entityType, row) {
  if (!row) return null;
  return Object.fromEntries(fieldsFor(entityType).map((field) => [field, row[field]]));
}

export function catalogChangedFields(entityType, before, proposed) {
  return fieldsFor(entityType).filter((field) => !sameValue(before?.[field], proposed?.[field]));
}

export function mergeCatalogProposal(entityType, before, proposed, current) {
  const currentSnapshot = catalogEntitySnapshot(entityType, current) || {};
  const changedFields = catalogChangedFields(entityType, before, proposed);
  const conflictFields = changedFields.filter((field) =>
    !sameValue(currentSnapshot[field], before?.[field]) && !sameValue(currentSnapshot[field], proposed?.[field])
  );
  const merged = { ...currentSnapshot };
  for (const field of changedFields) merged[field] = proposed[field];
  return { changedFields, conflictFields, merged };
}

export async function getCatalogEntity(store, entityType, id) {
  if (entityType === 'product') return store.getProduct(id);
  if (entityType === 'packaging') return store.getPackaging(id);
  throw new TypeError('Unsupported catalog entity type.');
}

function screenIds(rows) {
  return [...new Set((rows || []).map((row) => Number(row.screen_id)).filter(Number.isSafeInteger))];
}

export async function markCatalogScreensChanged(store, affected, reason, actor) {
  const ids = screenIds(affected);
  if (!ids.length) return [];
  return store.markScreenRenderChanged(ids, ['menu'], reason, actor);
}

export async function updateCatalogEntityAndCollectRevisions({ store, entityType, id, input, reason, actor }) {
  const updated = entityType === 'product'
    ? await store.updateProduct(id, input)
    : entityType === 'packaging'
      ? await store.updatePackaging(id, input)
      : null;
  if (!updated) return { entity:null, revisions:[] };
  const affected = await store.screensUsingCatalog(entityType, id);
  const revisions = await markCatalogScreensChanged(store, affected, reason, actor);
  return { entity:updated, revisions };
}

export function notifyCatalogRevisions(realtime, revisions) {
  for (const item of revisions || []) realtime?.notifyScreen(item.screen_id, item.revision);
}
