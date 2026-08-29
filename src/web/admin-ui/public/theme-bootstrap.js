(() => {
  try {
    const cookie = document.cookie.split('; ').find((item) => item.startsWith('menu_tv_theme='));
    const preference = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : localStorage.getItem('menu-tv-theme');
    const theme = preference === 'dark' || (preference === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference || 'system';
  } catch { /* The default light theme remains available when storage is disabled. */ }

  if (/^MIRA-TV(?: 2)?/.test(document.title)) {
    document.title = document.title.replace(/^MIRA-TV(?: 2)?/, 'MIRA-TV');
  }
})();
