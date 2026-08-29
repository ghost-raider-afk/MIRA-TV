export function confirmAction({ title = 'Подтвердите действие', message = '', confirmLabel = 'Продолжить', cancelLabel = 'Отмена', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<section class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title"></h2><p data-dialog-message></p><div class="modal-actions"><button class="button button-secondary" type="button" data-dialog-cancel></button><button class="button ${danger ? 'button-danger' : 'button-primary'}" type="button" data-dialog-confirm></button></div></section>`;
    backdrop.querySelector('#dialog-title').textContent = title;
    backdrop.querySelector('[data-dialog-message]').textContent = message;
    backdrop.querySelector('[data-dialog-cancel]').textContent = cancelLabel;
    backdrop.querySelector('[data-dialog-confirm]').textContent = confirmLabel;
    const finish = (value) => { backdrop.remove(); resolve(value); };
    backdrop.querySelector('[data-dialog-cancel]').addEventListener('click', () => finish(false));
    backdrop.querySelector('[data-dialog-confirm]').addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) finish(false); });
    document.body.append(backdrop);
    backdrop.querySelector('[data-dialog-confirm]').focus();
  });
}
