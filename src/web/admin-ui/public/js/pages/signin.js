import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { applyPresentation } from '../core/presentation.js';

function revealPresentation() {
  document.documentElement.dataset.signinPresentation = 'ready';
}

function homeForSession(session) {
  return session?.role === 'manager' ? '/manager' : '/';
}

export function initialiseSignIn() {
  const form = element('signin-form');
  const submit = element('signin-submit');
  if (!(form instanceof HTMLFormElement) || !(submit instanceof HTMLButtonElement)) return;

  void api.get(API.publicConfig)
    .then(applyPresentation)
    .catch(() => undefined)
    .finally(revealPresentation);

  void api.get(API.session).then((session) => window.location.replace(homeForSession(session))).catch(() => undefined);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setPending(submit, true, 'Выполняется вход…');
    try {
      await api.post(API.login, {
        username: element('username').value.trim(),
        password: element('password').value
      });
      const session = await api.get(API.session);
      window.location.replace(homeForSession(session));
    } catch (error) {
      setMessage('signin-message', error.message);
    } finally {
      setPending(submit, false, 'Выполняется вход…');
    }
  });
  submit.disabled = false;
  form.dataset.hydrated = 'true';
}
