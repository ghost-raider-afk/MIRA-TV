const REPROVISION_PARAM = 'reprovision';
const PLAYER_RELOAD_VERSION_KEY = 'mira-tv.player-reload-version.v1';

function commandIdFromLocation() {
  const value = new URL(location.href).searchParams.get(REPROVISION_PARAM) || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : '';
}

function isMiraPlayerRegistration(registration) {
  const workers = [registration?.active, registration?.waiting, registration?.installing].filter(Boolean);
  return workers.some((worker) => {
    try { return new URL(worker.scriptURL, location.origin).pathname === '/player-sw.js'; }
    catch { return false; }
  });
}

async function resetPlayerShell() {
  try { sessionStorage.removeItem(PLAYER_RELOAD_VERSION_KEY); } catch {}

  if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations
      .filter(isMiraPlayerRegistration)
      .map((registration) => registration.unregister().catch(() => false)));
  }

  if ('caches' in globalThis) {
    const names = await caches.keys().catch(() => []);
    await Promise.all(names
      .filter((name) => name.startsWith('mira-tv-player-shell-'))
      .map((name) => caches.delete(name).catch(() => false)));
  }
}

async function recover() {
  const commandId = commandIdFromLocation();
  await resetPlayerShell();
  const target = new URL('/player', location.origin);
  if (commandId) target.searchParams.set(REPROVISION_PARAM, commandId);
  target.searchParams.set('recovery', Date.now().toString(36));
  location.replace(target.href);
}

void recover().catch(() => {
  const target = new URL('/player', location.origin);
  const commandId = commandIdFromLocation();
  if (commandId) target.searchParams.set(REPROVISION_PARAM, commandId);
  target.searchParams.set('recovery', Date.now().toString(36));
  location.replace(target.href);
});
