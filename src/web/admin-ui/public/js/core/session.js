import { API } from './config.js';
import { api } from './api.js';
import { state } from './state.js';
import { applyPresentation, applyTheme } from './presentation.js';

export async function loadAuthenticatedContext() {
  const context = await api.get(API.sessionContext);
  const { session, user, site } = context;
  state.session = session;
  state.user = user;
  state.site = site;
  applyTheme(user.theme);
  applyPresentation(site);
  return { session, user, site };
}
