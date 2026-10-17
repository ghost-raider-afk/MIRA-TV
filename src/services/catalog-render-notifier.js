function screenIds(rows) {
  return [...new Set((rows || []).map((row) => Number(row.screen_id)).filter(Number.isSafeInteger))];
}

export async function markCatalogScreensChanged(store, realtime, affected, reason, actor) {
  const ids = screenIds(affected);
  if (!ids.length) return [];
  const revisions = await store.markScreenRenderChanged(ids, ['menu'], reason, actor);
  for (const item of revisions) realtime?.notifyScreen(item.screen_id, item.revision);
  return revisions;
}

export async function notifyCatalogEntityChanged(store, realtime, entityType, entityId, reason, actor) {
  const affected = await store.screensUsingCatalog(entityType, entityId);
  return markCatalogScreensChanged(store, realtime, affected, reason, actor);
}
