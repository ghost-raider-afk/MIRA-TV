import { API } from '../core/config.js';
import { api } from '../core/api.js';

function populateOverview(data) {
  Object.entries(data).forEach(([key, value]) => {
    document.querySelectorAll(`[data-overview="${key}"]`).forEach((node) => { node.textContent = String(value); });
  });
}

export async function initialiseDashboard() {
  populateOverview(await api.get(API.overview));
}
