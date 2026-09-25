export async function fetchWithTimeout(input, options = {}, timeoutMs = 5000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const requestOptions = { ...options };
  if (controller) requestOptions.signal = controller.signal;

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller?.abort(); } catch {}
      const error = new Error('MIRA-TV request timeout');
      error.name = 'TimeoutError';
      reject(error);
    }, Math.max(1000, Number(timeoutMs) || 5000));
  });

  try {
    return await Promise.race([fetch(input, requestOptions), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
