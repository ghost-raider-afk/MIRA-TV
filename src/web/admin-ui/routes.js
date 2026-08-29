export const AUTHENTICATED_PAGES = Object.freeze([
  Object.freeze({ path: '/', file: 'index.html' }),
  Object.freeze({ path: '/locations', file: 'locations.html' }),
  Object.freeze({ path: '/screens', file: 'screens.html' }),
  Object.freeze({ path: '/catalog', file: 'catalog.html' }),
  Object.freeze({ path: '/screen-editor', file: 'screen-editor.html' }),
  Object.freeze({ path: '/profile', file: 'profile.html' }),
  Object.freeze({ path: '/settings', file: 'settings.html' }),
  Object.freeze({ path: '/sftp-settings', file: 'sftp-settings.html' }),
  Object.freeze({ path: '/playlist', file: 'playlist.html' }),
  Object.freeze({ path: '/events', file: 'events.html' }),
  Object.freeze({ path: '/connect-tv', file: 'connect-tv.html' })
]);

export const LEGACY_PAGE_REDIRECTS = Object.freeze(new Map([
  ['/index.html', '/'],
  ['/locations.html', '/locations'],
  ['/screens.html', '/screens'],
  ['/catalog.html', '/catalog'],
  ['/screen-editor.html', '/screen-editor'],
  ['/profile.html', '/profile'],
  ['/settings.html', '/settings'],
  ['/sftp-settings.html', '/sftp-settings'],
  ['/playlist.html', '/playlist'],
  ['/animation.html', '/playlist'],
  ['/animation', '/playlist'],
  ['/events.html', '/events'],
  ['/connect-tv.html', '/connect-tv'],
  ['/signin.html', '/signin']
]));

export function canonicalRedirectTarget(request, canonical) {
  const queryIndex = request.originalUrl.indexOf('?');
  return queryIndex >= 0 ? `${canonical}${request.originalUrl.slice(queryIndex)}` : canonical;
}
