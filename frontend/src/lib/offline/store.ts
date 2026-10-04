// IndexedDB holds encrypted snapshots and an encrypted durable outbox. Keys are
// non-exportable CryptoKeys. This does not protect an already unlocked browser
// from malicious scripts; normal CSP/authentication protections still apply.
type Row = { id: string; scope: string; at: number; iv: Uint8Array; bytes: ArrayBuffer };
let opening: Promise<IDBDatabase> | undefined;
const keyPromises = new Map<string, Promise<CryptoKey>>();
const clearedScopes = new Set<string>();
export const enable = (scope: string) => { clearedScopes.delete(scope); };
export const pause = (scope: string) => { clearedScopes.add(scope); keyPromises.delete(scope); };
function database() {
  return opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('zolmi-offline-v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('rows', { keyPath: 'id' }).createIndex('scope', 'scope');
      db.createObjectStore('keys');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function access<T>(name: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode); const request = work(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Local save interrupted'));
  });
}
async function encryptionKey(scope: string): Promise<CryptoKey> {
  let pending = keyPromises.get(scope);
  if (!pending) {
    pending = (async () => {
      const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      const db = await database();
      return new Promise<CryptoKey>((resolve, reject) => {
        const tx = db.transaction('keys', 'readwrite'); const store = tx.objectStore('keys');
        const request = store.get(scope); let selected: CryptoKey;
        request.onsuccess = () => { selected = request.result || candidate; if (!request.result) store.put(candidate, scope); };
        tx.oncomplete = () => resolve(selected); tx.onerror = () => reject(tx.error);
      });
    })();
    keyPromises.set(scope, pending);
  }
  return pending;
}
export async function save(scope: string, id: string, value: unknown) {
  if (clearedScopes.has(scope)) throw new Error('This account was signed out.');
  const text = JSON.stringify(value);
  if (text.length > 2_000_000) throw new Error('This record is too large to save offline.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(scope), new TextEncoder().encode(text));
  if (clearedScopes.has(scope)) throw new Error('This account was signed out.');
  await access('rows', 'readwrite', s => s.put({ id: scope + ':' + id, scope, at: Date.now(), iv, bytes }));
}
async function decode<T>(row?: Row): Promise<T | undefined> {
  if (!row) return;
  const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: row.iv as BufferSource }, await encryptionKey(row.scope), row.bytes);
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function read<T>(scope: string, id: string): Promise<T | undefined> {
  return decode<T>(await access('rows', 'readonly', s => s.get(scope + ':' + id)));
}
export async function list<T>(scope: string, prefix: string): Promise<Array<{ id: string; value: T; at: number }>> {
  const rows = await access<Row[]>('rows', 'readonly', s => s.index('scope').getAll(scope));
  const result = [];
  for (const row of rows.filter(r => r.id.startsWith(scope + ':' + prefix))) {
    try { const value = await decode<T>(row); if (value !== undefined) result.push({ id: row.id.slice(scope.length + 1), value, at: row.at }); }
    catch (error) { if (prefix === 'write:') throw error; }
  }
  return result;
}
export async function remove(scope: string, id: string) { await access('rows', 'readwrite', s => s.delete(scope + ':' + id)); }
export async function replace(scope: string, oldId: string, newId: string, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(scope), new TextEncoder().encode(JSON.stringify(value)));
  if (clearedScopes.has(scope)) throw new Error('Account changed.');
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('rows', 'readwrite'), rows = tx.objectStore('rows');
    rows.put({ id: scope + ':' + newId, scope, at: Date.now(), iv, bytes });
    rows.delete(scope + ':' + oldId);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function clear(scope: string) {
  clearedScopes.add(scope);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['rows', 'keys'], 'readwrite');
    const cursor = tx.objectStore('rows').index('scope').openCursor(IDBKeyRange.only(scope));
    cursor.onsuccess = () => { const item = cursor.result; if (item) { item.delete(); item.continue(); } };
    tx.objectStore('keys').delete(scope);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  keyPromises.delete(scope);
}
export async function trimSnapshots(scope: string) {
  const rows = await access<Row[]>('rows', 'readonly', s => s.index('scope').getAll(scope));
  const snapshots = rows.filter(r => r.id.startsWith(scope + ':get:')).sort((a, b) => b.at - a.at);
  let size = 0;
  for (let i = 0; i < snapshots.length; i++) {
    const row = snapshots[i]; size += row.bytes.byteLength;
    if (i >= 250 || size > 15_000_000 || Date.now() - row.at > 30 * 86400000) await remove(scope, row.id.slice(scope.length + 1));
  }
}
