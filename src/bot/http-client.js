const DEFAULT_TIMEOUT_MS = 8000;

export async function jsonRequest(url, { headers = {}, body, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method:'POST',
    headers:{ 'content-type':'application/json', ...headers },
    body:JSON.stringify(body),
    signal:AbortSignal.timeout(timeoutMs)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    const error = new Error('Remote request rejected: HTTP ' + response.status);
    error.status = response.status;
    error.retryAfter = Number(response.headers?.get?.('retry-after')) || 0;
    throw error;
  }
  return result;
}

export function createBotTransport(config, { fetchImpl = fetch } = {}) {
  const base = String(config.apiBaseUrl).replace(/\/$/, '');
  async function internalCommand(body) {
    try {
      return await jsonRequest(base + '/internal/bot/command', {
        headers:{ authorization:'Bearer ' + config.internalToken },
        body,
        fetchImpl
      });
    } catch (error) {
      if (error.status === 403) return { unauthorized:true };
      throw error;
    }
  }
  function telegramSend(chatId, text) {
    return jsonRequest('https://api.telegram.org/bot' + config.telegramToken + '/sendMessage', {
      body:{ chat_id:chatId, text, protect_content:true },
      fetchImpl
    });
  }
  function maxSend(userId, text) {
    return jsonRequest('https://platform-api2.max.ru/messages?user_id=' + encodeURIComponent(userId), {
      headers:{ Authorization:config.maxToken },
      body:{ text, disable_link_preview:true },
      fetchImpl
    });
  }
  return { internalCommand, telegramSend, maxSend };
}
