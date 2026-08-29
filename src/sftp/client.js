const SFTP_PERMISSIONS = Object.freeze({ '/': ['list', 'download'] });

function clientError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export class SftpGoClient {
  constructor({ apiUrl, apiTimeoutMs = 5000, adminUsername, adminPassword }) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.apiTimeoutMs = apiTimeoutMs;
    this.adminUsername = adminUsername;
    this.adminPassword = adminPassword;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async #fetch(pathname, options = {}) {
    try {
      return await fetch(`${this.apiUrl}${pathname}`, {
        ...options,
        signal: AbortSignal.timeout(this.apiTimeoutMs)
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw clientError('Сервис SFTP не ответил за отведённое время.', 504);
      }
      throw clientError('Сервис SFTP недоступен для управления учётными записями.');
    }
  }

  async #token() {
    if (this.token && this.tokenExpiresAt > Date.now()) return this.token;
    const basic = Buffer.from(`${this.adminUsername}:${this.adminPassword}`).toString('base64');
    const response = await this.#fetch('/api/v2/token', { headers: { Authorization: `Basic ${basic}` } });
    if (!response.ok) throw clientError('Сервис SFTP недоступен для управления учётными записями.');
    const body = await response.json().catch(() => null);
    if (typeof body?.access_token !== 'string' || body.access_token.length === 0) throw clientError('Сервис SFTP вернул некорректный токен управления.');
    this.token = body.access_token;
    this.tokenExpiresAt = Date.now() + 14 * 60 * 1000;
    return this.token;
  }

  async #request(method, pathname, body, retryUnauthorized = true) {
    const token = await this.#token();
    const response = await this.#fetch(pathname, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.ok) return response.status === 204 ? null : response.json().catch(() => null);
    if (response.status === 401 && retryUnauthorized) {
      this.token = null;
      this.tokenExpiresAt = 0;
      return this.#request(method, pathname, body, false);
    }
    if (method === 'DELETE' && response.status === 404) return null;
    if (response.status === 409) throw clientError('Такой логин SFTP уже занят.', 409);
    if (response.status === 404) throw clientError('Учётная запись SFTP не найдена.', 404);
    throw clientError('Не удалось изменить учётную запись SFTP.');
  }

  createReadOnlyUser({ username, password, homeDir }) {
    return this.#request('POST', '/api/v2/users', { status: 1, username, password, home_dir: homeDir, permissions: SFTP_PERMISSIONS, max_sessions: 0 });
  }

  async resetPassword(username, password) {
    const encoded = encodeURIComponent(username);
    const user = await this.#request('GET', `/api/v2/users/${encoded}`);
    if (!user) throw clientError('Учётная запись SFTP не найдена.', 404);
    return this.#request('PUT', `/api/v2/users/${encoded}`, { ...user, password, permissions: SFTP_PERMISSIONS });
  }

  removeUser(username) {
    return this.#request('DELETE', `/api/v2/users/${encodeURIComponent(username)}`);
  }
}
