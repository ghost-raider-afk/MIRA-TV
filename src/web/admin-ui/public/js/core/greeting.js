// Display exactly once after a real login. Nothing runs on TV/player pages.
export function greetingForHour(hour) {
  if (hour >= 5 && hour < 11) return 'Доброе утро';
  if (hour >= 11 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export function showLoginGreeting(session, preferences) {
  let pending = null;
  try {
    pending = window.sessionStorage.getItem('mira-login-greeting');
    window.sessionStorage.removeItem('mira-login-greeting');
  } catch { return; }
  if (!session?.username || pending !== session.username) return;
  const name = String(preferences?.display_name || session.display_name || session.username).trim();
  const container = document.createElement('div');
  container.className = 'login-greeting';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  const title = document.createElement('span');
  title.textContent = `${greetingForHour(new Date().getHours())}, ${name}!`;
  const close = document.createElement('button');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть приветствие');
  close.textContent = '×';
  close.addEventListener('click', () => container.remove(), { once:true });
  container.append(title, close);
  document.body.append(container);
  window.setTimeout(() => container.remove(), 7000);
}
