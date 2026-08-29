import { API } from '../core/config.js';
import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { element, setMessage, clearMessage, setPending, makeButton, recordRow, refreshList, price } from '../core/dom.js';
import { loadNotifications } from '../core/notifications.js';
import { initialiseProductImport } from '../catalog/import-preview.js';

function normalizedQuery(id) {
  return String(element(id)?.value || '').trim().toLocaleLowerCase('ru-RU');
}

function matchesQuery(values, query) {
  if (!query) return true;
  return values.some((value) => String(value || '').toLocaleLowerCase('ru-RU').includes(query));
}

async function loadCatalog() {
  const [products, packaging] = await Promise.all([api.get(API.products), api.get(API.packaging)]);
  state.products = products;
  state.packaging = packaging;
  renderCatalogProducts();
  renderCatalogPackaging();
}

function renderCatalogProducts() {
  const list = document.querySelector('[data-products-list]');
  const empty = document.querySelector('[data-products-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('product-filter');
  const products = state.products.filter((product) => matchesQuery([
    product.name, product.producer, product.characteristics, product.strength
  ], query));
  const rows = products.map((product) => recordRow(
    product.name,
    [product.producer || 'Производитель не указан', product.characteristics || product.strength || 'Без характеристик', `1 л: ${price(product.price_primary)} · 1,5 л (расчётная): ${price(product.price_secondary)}`, product.active ? 'активна' : 'скрыта'].join(' · '),
    [makeButton('Изменить', '', () => editProduct(product)), makeButton('Удалить', 'danger', () => void deleteProduct(product))]
  ));
  empty.textContent = query && state.products.length ? 'По запросу ничего не найдено.' : 'Продукции пока нет.';
  refreshList(list, empty, rows);
}

function renderCatalogPackaging() {
  const list = document.querySelector('[data-packaging-list]');
  const empty = document.querySelector('[data-packaging-empty]');
  if (!list || !empty) return;
  const query = normalizedQuery('packaging-filter');
  const packaging = state.packaging.filter((item) => matchesQuery([item.name], query));
  const rows = packaging.map((item) => recordRow(item.name, `${price(item.unit_price)} · ${item.active ? 'активна' : 'скрыта'}`, [makeButton('Изменить', '', () => editPackaging(item)), makeButton('Удалить', 'danger', () => void deletePackaging(item))]));
  empty.textContent = query && state.packaging.length ? 'По запросу ничего не найдено.' : 'Тара пока не добавлена.';
  refreshList(list, empty, rows);
}

function resetProductForm() {
  const form = element('product-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingProductId = null;
  form.reset();
  element('product-active').checked = true;
  element('product-alcoholic').checked = false;
  element('product-beverage-color').value = 'none';
  element('product-filtration').value = 'none';
  element('product-form-title').textContent = 'Новая продукция';
  element('product-submit').textContent = 'Добавить продукцию';
  element('cancel-product-edit')?.classList.add('is-hidden');
  clearMessage('product-message');
}

function editProduct(product) {
  state.editingProductId = product.id;
  element('product-name').value = product.name;
  element('product-producer').value = product.producer || '';
  element('product-characteristics').value = product.characteristics || '';
  element('product-strength').value = product.strength || '';
  element('product-price-primary').value = product.price_primary || '';
  element('product-alcoholic').checked = product.alcoholic === true;
  element('product-beverage-color').value = product.beverage_color || 'none';
  element('product-filtration').value = product.filtration || 'none';
  element('product-active').checked = product.active !== false;
  element('product-form-title').textContent = 'Редактирование продукции';
  element('product-submit').textContent = 'Сохранить продукцию';
  element('cancel-product-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(product) {
  if (!window.confirm(`Удалить продукцию «${product.name}»?`)) return;
  try { await api.delete(`${API.products}/${product.id}`); await loadCatalog(); }
  catch (error) { setMessage('product-message', error.message); }
}

function downloadCsv(csv) {
  const content = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'products.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportProducts() {
  const button = element('product-export');
  setPending(button, true, 'Выгружаем…');
  clearMessage('product-message');
  try {
    const csv = await api.get(API.productsExport);
    downloadCsv(csv);
    setMessage('product-message', `CSV выгружен. Записей: ${state.products.length}.`, 'success');
  } catch (error) {
    setMessage('product-message', error.message);
  } finally {
    setPending(button, false, 'Выгружаем…');
  }
}

function resetPackagingForm() {
  const form = element('packaging-form');
  if (!(form instanceof HTMLFormElement)) return;
  state.editingPackagingId = null;
  form.reset();
  element('packaging-active').checked = true;
  element('packaging-form-title').textContent = 'Новая тара';
  element('packaging-submit').textContent = 'Добавить тару';
  element('cancel-packaging-edit')?.classList.add('is-hidden');
  clearMessage('packaging-message');
}

function editPackaging(item) {
  state.editingPackagingId = item.id;
  element('packaging-name').value = item.name;
  element('packaging-price').value = item.unit_price || '';
  element('packaging-active').checked = item.active !== false;
  element('packaging-form-title').textContent = 'Редактирование тары';
  element('packaging-submit').textContent = 'Сохранить тару';
  element('cancel-packaging-edit')?.classList.remove('is-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deletePackaging(item) {
  if (!window.confirm(`Удалить тару «${item.name}»?`)) return;
  try { await api.delete(`${API.packaging}/${item.id}`); await loadCatalog(); }
  catch (error) { setMessage('packaging-message', error.message); }
}

export function initialiseCatalog() {
  const productForm = element('product-form');
  const packagingForm = element('packaging-form');
  if (!(productForm instanceof HTMLFormElement) || !(packagingForm instanceof HTMLFormElement)) return;

  void loadCatalog().catch((error) => setMessage('product-message', error.message));
  initialiseProductImport({
    onApplied: async () => {
      resetProductForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    }
  });

  element('refresh-catalog')?.addEventListener('click', () => { void loadCatalog(); });
  element('product-filter')?.addEventListener('input', renderCatalogProducts);
  element('packaging-filter')?.addEventListener('input', renderCatalogPackaging);
  element('cancel-product-edit')?.addEventListener('click', resetProductForm);
  element('cancel-packaging-edit')?.addEventListener('click', resetPackagingForm);
  element('product-export')?.addEventListener('click', () => { void exportProducts(); });

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('product-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = {
        name: element('product-name').value,
        producer: element('product-producer').value,
        characteristics: element('product-characteristics').value,
        strength: element('product-strength').value,
        price_primary: element('product-price-primary').value,
        alcoholic: element('product-alcoholic').checked,
        beverage_color: element('product-beverage-color').value,
        filtration: element('product-filtration').value,
        active: element('product-active').checked
      };
      if (state.editingProductId) await api.put(`${API.products}/${state.editingProductId}`, payload);
      else await api.post(API.products, payload);
      resetProductForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) {
      setMessage('product-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });

  packagingForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = element('packaging-submit');
    setPending(submit, true, 'Сохраняем…');
    try {
      const payload = { name: element('packaging-name').value, unit_price: element('packaging-price').value, active: element('packaging-active').checked };
      if (state.editingPackagingId) await api.put(`${API.packaging}/${state.editingPackagingId}`, payload);
      else await api.post(API.packaging, payload);
      resetPackagingForm();
      await Promise.all([loadCatalog(), loadNotifications()]);
    } catch (error) {
      setMessage('packaging-message', error.message);
    } finally {
      setPending(submit, false, 'Сохраняем…');
    }
  });
}
