import { navigate } from '../core/router.js';

function legacyScreenId() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function initialiseScreenEditor() {
  const screenId = legacyScreenId();
  void navigate(screenId ? `/screens?manage=${screenId}` : '/screens', { replace:true });
  return undefined;
}
