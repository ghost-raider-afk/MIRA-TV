import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, setPending } from '../core/dom.js';
import { applyTheme } from '../core/presentation.js';
import { updateHeaderAccount } from '../components/header.js';
import { loadNotifications } from '../core/notifications.js';

function populateUserForm(user) {
  element('profile-username').value = user.username;
  element('display-name').value = user.display_name;
  element('profile-email').value = user.email || '';
  element('profile-phone').value = user.phone || '';
  element('profile-job-title').value = user.job_title || '';
  const theme = document.querySelector(`input[name="theme"][value="${user.theme}"]`);
  if (theme) theme.checked = true;
  element('notifications-enabled').checked = user.notifications_enabled;
}

export function initialiseProfile() {
  const userForm = element('user-settings-form');
  const passwordForm = element('password-change-form');
  if (!(userForm instanceof HTMLFormElement)) return;
  populateUserForm(state.user);

  userForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('user-settings-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const theme = document.querySelector("input[name='theme']:checked")?.value || 'system';
      const user = await api.put(API.userSettings, {
        display_name: element('display-name').value,
        email: element('profile-email').value,
        phone: element('profile-phone').value,
        job_title: element('profile-job-title').value,
        theme,
        notifications_enabled: element('notifications-enabled').checked
      });
      state.user = user;
      applyTheme(user.theme);
      updateHeaderAccount(user);
      setMessage('user-settings-message', 'Настройки пользователя сохранены.', 'success');
      await loadNotifications();
    } catch (error) {
      setMessage('user-settings-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });

  if (passwordForm instanceof HTMLFormElement) passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const currentPassword = element('current-password').value;
    const newPassword = element('new-password').value;
    const confirmation = element('new-password-confirmation').value;
    if (newPassword !== confirmation) return setMessage('password-change-message', 'Новый пароль и его подтверждение не совпадают.');
    const submit = element('password-change-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      await api.put(API.userPassword, { current_password: currentPassword, new_password: newPassword });
      passwordForm.reset();
      setMessage('password-change-message', 'Пароль изменён. Все другие активные сессии завершены.', 'success');
      await loadNotifications();
    } catch (error) {
      setMessage('password-change-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
