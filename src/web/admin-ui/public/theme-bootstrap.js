(() => {
  try {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith('mira_tv_theme='));
    const preference = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : localStorage.getItem('mira-tv-theme');
    const theme = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference || 'system';
  } catch { /* The default light theme remains available when storage is disabled. */ }

  try {
    if (!/^\/(?:signin|player)(?:\/|$)/.test(window.location.pathname)) {
      const stored = Number(localStorage.getItem('mira-tv-ui-scale-percent') || 100);
      const percent = Number.isFinite(stored) ? Math.max(70, Math.min(140, Math.round(stored))) : 100;
      document.documentElement.dataset.uiScalePercent = String(percent);
      document.documentElement.style.setProperty('--ui-scale-factor', String(Math.round((1.25 * percent / 100) * 1000) / 1000));
    }
  } catch {
    if (!/^\/(?:signin|player)(?:\/|$)/.test(window.location.pathname)) document.documentElement.style.setProperty('--ui-scale-factor', '1.25');
  }

  if (/^MIRA-TV(?: 2)?/.test(document.title)) {
    document.title = document.title.replace(/^MIRA-TV(?: 2)?/, 'MIRA-TV');
  }
})();
