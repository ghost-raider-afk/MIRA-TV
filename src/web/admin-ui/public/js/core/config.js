export const API = Object.freeze({
  publicConfig: '/api/public/config',
  login: '/api/auth/login',
  logout: '/api/auth/logout',
  session: '/api/session',
  sessionContext: '/api/session/context',
  overview: '/api/overview',
  userSettings: '/api/settings/user',
  userPassword: '/api/settings/user/password',
  siteSettings: '/api/settings/site',
  animationSettings: '/api/settings/animation',
  animationApply: '/api/settings/animation/apply',
  animationEntityAsset: '/api/settings/animation/entity-asset',
  notifications: '/api/notifications',
  frontendErrors: '/api/diagnostics/frontend-errors',
  locations: '/api/locations',
  screens: '/api/screens',
  deviceResolve: '/api/device-admin/resolve',
  deviceAuthorize: '/api/device-admin/authorize',
  deviceBindings: '/api/device-admin/bindings',
  products: '/api/catalog/products',
  productsImport: '/api/catalog/products/import',
  productsImportPreview: '/api/catalog/products/import/preview',
  productsExport: '/api/catalog/products/export.csv',
  packaging: '/api/catalog/packaging',
  sftpDirectories: '/api/sftp/directories',
  sftpConnection: '/api/sftp/connection',
  sftpOverview: '/api/sftp/overview'
});

export function pageName() {
  const declared = document.body?.dataset?.page || '';
  const pathname = window.location.pathname;
  if ((pathname === '/playlist' || pathname === '/playlist.html' || pathname === '/animation' || pathname === '/animation.html') && declared === 'animation') return 'playlist';
  return declared;
}
