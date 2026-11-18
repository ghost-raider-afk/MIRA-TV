export const TV_OFFLINE_GRACE_MS = 120_000;

export function advanceTvIncident(previous, online, nowMs = Date.now(), graceMs = TV_OFFLINE_GRACE_MS) {
  const observedAt = new Date(nowMs).toISOString();
  if (!previous) return {
    changed:true, kind:null, incidentStartedAt:null,
    next:{ last_state:online ? 'online' : 'offline', offline_since:online ? null : observedAt, notified:false }
  };
  if (online) {
    if (previous.last_state === 'online') return { changed:false, kind:null, next:previous };
    return {
      changed:true, kind:previous.notified === true ? 'tv_restored' : null,
      incidentStartedAt:previous.offline_since || null,
      next:{ last_state:'online', offline_since:null, notified:false }
    };
  }
  if (previous.last_state !== 'offline' || !previous.offline_since) {
    return {
      changed:true, kind:null, incidentStartedAt:null,
      next:{ last_state:'offline', offline_since:observedAt, notified:false }
    };
  }
  const startedAt = new Date(previous.offline_since).getTime();
  if (!previous.notified && Number.isFinite(startedAt) && nowMs - startedAt >= graceMs) {
    return {
      changed:true, kind:'tv_offline', incidentStartedAt:new Date(startedAt).toISOString(),
      next:{ last_state:'offline', offline_since:new Date(startedAt).toISOString(), notified:true }
    };
  }
  return { changed:false, kind:null, next:previous };
}
