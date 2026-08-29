"use strict";

void import('/js/application.js').catch((error) => {
  console.error('TV Menu frontend failed to load', error);
  const target = document.querySelector('[role="status"], .form-message');
  if (target) {
    target.textContent = 'Не удалось загрузить интерфейс. Обновите страницу.';
    target.classList.remove('is-hidden');
    target.classList.add('is-error');
  }
});
