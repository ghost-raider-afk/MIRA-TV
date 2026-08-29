const DB_NAME = 'mira-tv-player';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const LOG_STORE = 'logs';
const LAST_KNOWN_GOOD_KEY = 'last-known-good';
const LOG_TOTALS_KEY = 'log-totals';

let databasePromise = null;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}

export function openPlayerStore() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(LOG_STORE)) {
        const logs = db.createObjectStore(LOG_STORE, { keyPath: 'id', autoIncrement: true });
        logs.createIndex('boot_seq', ['boot_id', 'seq'], { unique: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('MIRA-TV IndexedDB could not be opened.'));
    };
  });
  return databasePromise;
}

async function stateValue(key) {
  const db = await openPlayerStore();
  if (!db) return null;
  const tx = db.transaction(STATE_STORE, 'readonly');
  const record = await requestResult(tx.objectStore(STATE_STORE).get(key));
  await transactionDone(tx);
  return record?.value ?? null;
}

async function setStateValue(key, value, tx = null) {
  const db = tx ? null : await openPlayerStore();
  const transaction = tx || db?.transaction(STATE_STORE, 'readwrite');
  if (!transaction) return;
  transaction.objectStore(STATE_STORE).put({ key, value });
  if (!tx) await transactionDone(transaction);
}

export async function loadLastKnownGood() {
  return stateValue(LAST_KNOWN_GOOD_KEY);
}

export async function saveLastKnownGood(record) {
  await setStateValue(LAST_KNOWN_GOOD_KEY, record);
}

export async function clearLastKnownGood() {
  const db = await openPlayerStore();
  if (!db) return;
  const tx = db.transaction(STATE_STORE, 'readwrite');
  tx.objectStore(STATE_STORE).delete(LAST_KNOWN_GOOD_KEY);
  await transactionDone(tx);
}

function byteSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function overLimit(totals, limits) {
  return totals.entries > limits.maxEntries || totals.bytes > limits.maxBytes;
}

async function trimLogLevel(logs, level, totals, limits) {
  if (!overLimit(totals, limits)) return;
  const cursorRequest = logs.openCursor();
  await new Promise((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Log trim cursor failed.'));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || !overLimit(totals, limits)) {
        resolve();
        return;
      }
      if (String(cursor.value?.level || 'info') === level) {
        totals.entries = Math.max(0, totals.entries - 1);
        totals.bytes = Math.max(0, totals.bytes - Number(cursor.value?.size || 0));
        cursor.delete();
      }
      cursor.continue();
    };
  });
}

async function trimLogs(db, limits, totals) {
  if (!overLimit(totals, limits)) return totals;
  const tx = db.transaction([LOG_STORE, STATE_STORE], 'readwrite');
  const logs = tx.objectStore(LOG_STORE);
  for (const level of ['info', 'warn', 'error']) {
    await trimLogLevel(logs, level, totals, limits);
    if (!overLimit(totals, limits)) break;
  }
  tx.objectStore(STATE_STORE).put({ key: LOG_TOTALS_KEY, value: totals });
  await transactionDone(tx);
  return totals;
}

export async function appendPlayerLog(event, limits) {
  const db = await openPlayerStore();
  if (!db) return;
  const record = { ...event, size: byteSize(event) };
  const tx = db.transaction([LOG_STORE, STATE_STORE], 'readwrite');
  const state = tx.objectStore(STATE_STORE);
  const current = (await requestResult(state.get(LOG_TOTALS_KEY)))?.value || { entries: 0, bytes: 0 };
  const totals = { entries: Number(current.entries || 0) + 1, bytes: Number(current.bytes || 0) + record.size };
  tx.objectStore(LOG_STORE).add(record);
  state.put({ key: LOG_TOTALS_KEY, value: totals });
  await transactionDone(tx);
  await trimLogs(db, limits, totals);
}

export async function pendingPlayerLogs(limit) {
  const db = await openPlayerStore();
  if (!db) return [];
  const tx = db.transaction(LOG_STORE, 'readonly');
  const records = await requestResult(tx.objectStore(LOG_STORE).getAll(null, Math.max(1, Number(limit) || 1)));
  await transactionDone(tx);
  if (!records.length) return [];
  const bootId = records[0].boot_id;
  return records.filter((record) => record.boot_id === bootId);
}

export async function acknowledgePlayerLogs(bootId, acceptedThrough) {
  const db = await openPlayerStore();
  if (!db) return;
  const maxSeq = Number(acceptedThrough);
  if (!Number.isSafeInteger(maxSeq) || maxSeq < 1) return;
  const tx = db.transaction([LOG_STORE, STATE_STORE], 'readwrite');
  const logs = tx.objectStore(LOG_STORE);
  const index = logs.index('boot_seq');
  const range = IDBKeyRange.bound([bootId, 0], [bootId, maxSeq]);
  const totalsRecord = await requestResult(tx.objectStore(STATE_STORE).get(LOG_TOTALS_KEY));
  const totals = totalsRecord?.value || { entries: 0, bytes: 0 };
  const cursorRequest = index.openCursor(range);
  await new Promise((resolve, reject) => {
    cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Log acknowledgement cursor failed.'));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { resolve(); return; }
      totals.entries = Math.max(0, Number(totals.entries || 0) - 1);
      totals.bytes = Math.max(0, Number(totals.bytes || 0) - Number(cursor.value?.size || 0));
      cursor.delete();
      cursor.continue();
    };
  });
  tx.objectStore(STATE_STORE).put({ key: LOG_TOTALS_KEY, value: totals });
  await transactionDone(tx);
}
