import { Change, canRead, writable, scrub, recordIn, label } from './policy';
import * as store from './store';

type Snapshot = { path: string; params: Record<string, any>; data: any; at: number };
export type SyncState = { scope: string; offline: boolean; lastSync: number; items: Change[]; notice: string; syncing: boolean; storageError: string };
const empty: SyncState = { scope: '', offline: false, lastSync: 0, items: [], notice: '', syncing: false, storageError: '' };
let state = empty;
let apiOrigin = '';
let generation = 0;
let capabilities = false;
let send: ((path: string, body: any, expectedScope?: string, method?: string) => Promise<any>) | undefined;
let reload: (() => void) | undefined;
let running: Promise<void> | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(fn => fn());
const update = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; changed(); };
export const syncStore = { subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, get: () => state, server: () => empty };
export function notify(message: string) { update({ notice: message }); }
export function dismissNotice() { update({ notice: '' }); }
export function connection(offline: boolean) {
  if (offline && !state.offline) notify('You’re offline. Showing saved information.');
  update({ offline });
}
export function configureSync(base: string, sender: typeof send, refresh: () => void) { apiOrigin = base; send = sender; reload = refresh; }
export async function setIdentity(uid: string | null, restore = false) {
  if (typeof window === 'undefined') return;
  // The remembered ID unlocks only this browser's offline view, never API access.
  if (!uid && restore) uid = localStorage.getItem('zolmi-offline-owner');
  const scope = uid ? apiOrigin + '|' + uid : '';
  if (scope === state.scope) return;
  if (state.scope) store.pause(state.scope);
  generation++;
  capabilities = false;
  update({ ...empty, scope, offline: !navigator.onLine });
  if (uid) localStorage.setItem('zolmi-offline-owner', uid);
  else localStorage.removeItem('zolmi-offline-owner');
  if (scope) { store.enable(scope); await refreshItems(scope); }
}
async function refreshItems(scope = state.scope) {
  if (!scope) return;
  try {
    const rows = await store.list<Change>(scope, 'write:');
    const meta = await store.read<{ lastSync?: number }>(scope, 'meta');
    if (scope === state.scope) update({ items: rows.map(r => r.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), lastSync: meta?.lastSync || state.lastSync });
  } catch { if (scope === state.scope) update({ storageError: 'Offline storage is unavailable. Connect before saving.' }); }
}
export async function confirmCapabilities() {
  if (!state.scope || !send || !navigator.onLine) return;
  try {
    const scope = state.scope;
    const result = await send('/website-sync/capabilities', null, scope);
    if (scope !== state.scope) return false;
    capabilities = result?.data?.version === 1;
    if (capabilities) await store.save(state.scope, 'capabilities', true);
    return capabilities;
  } catch { return false; /* Older API versions continue their ordinary online workflow. */ }
}
const keyFor = (path: string, params: any) => 'get:' + JSON.stringify([path, Object.fromEntries(Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b)))]);
export async function saveSnapshot(scope: string, path: string, params: any, data: any) {
  if (!scope || scope !== state.scope || !canRead(path)) return;
  try {
    await store.save(scope, keyFor(path, params), { path, params: params || {}, data: scrub(data), at: Date.now() });
    await store.trimSnapshots(scope);
  } catch { update({ storageError: 'Some information could not be saved offline. Check browser storage.' }); }
}
export async function snapshot(scope: string, path: string, params: any) {
  if (!scope || scope !== state.scope || !canRead(path)) return;
  let saved = await store.read<Snapshot>(scope, keyFor(path, params));
  if (!saved && /\/clients\/search$/.test(path) && params?.query) {
    const all = await store.read<Snapshot>(scope, keyFor(path, { ...params, query: '' }));
    if (all?.data?.data?.clients) {
      const needle = String(params.query).toLowerCase();
      saved = { ...all, params, data: { ...all.data, data: { ...all.data.data, clients: all.data.data.clients.filter((client: any) => [client.fullName, client.phoneNumber, client.email].some(value => String(value || '').toLowerCase().includes(needle))) } } };
    }
  }
  if (!saved || Date.now() - saved.at > 30 * 86400000 || scope !== state.scope) return;
  return { ...saved, data: await project(scope, saved) };
}
async function records(scope: string) { return (await store.list<Snapshot>(scope, 'get:')).sort((a, b) => b.at - a.at); }
async function findRecord(scope: string, id: string) {
  for (const row of await records(scope)) { const found = recordIn(row.value.data, id); if (found) return found; }
  return null;
}
export async function safeStaffBody(scope: string, path: string, body: any) {
  if (!/^\/dashboard\/[a-f\d]{24}\/staff\/[\w-]{1,128}$/.test(path)) return body;
  const record = await findRecord(scope, path.split('/').pop()!);
  if (!record) return body;
  const copy = { ...body };
  for (const key of ['email', 'firstName', 'lastName', 'fullName', 'phoneNumber', 'serviceCommission', 'productCommission', 'permissionLevel', 'hourlyWage']) {
    if (key in copy && JSON.stringify(copy[key]) === JSON.stringify(record[key] ?? record.userId?.[key])) delete copy[key];
  }
  return copy;
}
function target(change: Change) { return change.path.match(/\/staff\/([\w-]{1,128})(?:\/(?:archive|visibility))?$/)?.[1] || change.path.match(/\/([a-f\d]{24})(?:\/(?:notes|checkout|archive|visibility))?$/)?.[1]; }
function mapRecords(value: any, id: string, patch: any, deleted = false): any {
  if (Array.isArray(value)) return value.filter(v => !deleted || !v || (v._id !== id && v.id !== id)).map(v => mapRecords(v, id, patch, deleted));
  if (value && typeof value === 'object') {
    const mapped = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapRecords(v, id, patch, deleted)]));
    return value._id === id || value.id === id || value.staffId === id ? { ...mapped, ...patch } : mapped;
  }
  return value;
}
function localRecord(change: Change) {
  return { ...change.body, _id: change.localId, id: change.localId, businessId: change.shop,
    updatedAt: change.createdAt, createdAt: change.createdAt, __offline: true,
    ...(change.path.endsWith('/walk-in') ? { isWalkIn: true, status: 'pending', computedStatus: 'Pending sync', paymentStatus: 'unpaid', clientId: { fullName: change.body?.fullName || 'Walk-in', phoneNumber: change.body?.phoneNumber }, serviceIds: (change.body?.serviceIds || []).map((id: string) => ({ _id: id })) } : {}), ...change.preview };
}
async function project(scope: string, saved: Snapshot, only?: Change[]) {
  let data = structuredClone(saved.data);
  const entries = only || (await store.list<Change>(scope, 'write:')).map(r => r.value).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const item of entries) {
    if (!saved.path.includes(item.shop)) continue;
    const id = target(item);
    if (id && item.method !== 'POST') {
      data = mapRecords(data, id, item.path.endsWith('/checkout') ? { __offline: true, localPaymentRecorded: true } : { ...item.body, __offline: true }, item.method === 'DELETE');
    }
    if (item.localId) {
      const kind = item.path.split('/').pop();
      const catalog = (kind === 'services' || kind === 'products') && saved.path.endsWith('/' + kind);
      const bookings = kind === 'walk-in' && saved.path.endsWith('/bookings') && (!saved.params.date || String(item.body?.startTime).slice(0, 10) === saved.params.date) && (!saved.params.status || saved.params.status === 'pending');
      if (catalog || bookings) {
        const row = localRecord(item);
        if (Array.isArray(data.data)) data.data.unshift(row);
        else if (Array.isArray(data.data?.bookings)) { data.data.bookings.unshift(row); data.data.total = (data.data.total || 0) + 1; }
      }
    }
  }
  return data;
}
async function commitSnapshot(scope: string, item: Change, result: any) {
  for (const row of await records(scope)) {
    if (!row.value.path.includes(item.shop)) continue;
    // Commit the acknowledged record into saved pages as well, so disconnecting
    // immediately after sync cannot bring back the pre-sync snapshot.
    const alreadyPresent = item.localId && result?._id && recordIn(row.value.data, result._id);
    const id = alreadyPresent ? result._id : item.localId || target(item);
    let data = (!alreadyPresent && item.localId) || item.method === 'DELETE' ? await project(scope, row.value, [item]) : row.value.data;
    if (id && item.method !== 'DELETE') data = mapRecords(data, id, { ...result, __offline: false, localPaymentRecorded: false });
    await store.save(scope, row.id, { ...row.value, data });
  }
}
export async function pendingData(scope: string, path: string, params: any, data: any) { return project(scope, { path, params: params || {}, data, at: Date.now() }); }
export async function queueChange(path: string, method: string, body: any) {
  const scope = state.scope;
  if (!scope) throw new Error('Sign in online once before using offline work.');
  if (!capabilities && !(await store.read(scope, 'capabilities'))) throw new Error('Connect once after the offline update is deployed to enable offline saves.');
  let shop = writable(path, method, body);
  if (!shop) throw new Error('This action needs an internet connection. Your changes have not been submitted.');
  if (state.items.length >= 150) throw new Error('Sync the pending changes before adding more.');
  const id = path.match(/\/staff\/([\w-]{1,128})(?:\/(?:archive|visibility))?$/)?.[1] || path.match(/\/([a-f\d]{24})(?:\/(?:notes|checkout|visibility|archive))?$/)?.[1];
  const previousCreate = id ? state.items.find(item => item.localId === id) : undefined;
  const record = id ? await findRecord(scope, id) : null;
  if (shop === 'booking') shop = previousCreate?.shop || String(record?.businessId?._id || record?.businessId || '');
  if (!/^[a-f\d]{24}$/.test(shop || '')) throw new Error('Open this appointment online once before recording it offline.');
  if (method !== 'POST' && !previousCreate && !record?.updatedAt) throw new Error('Open this record online once before editing it offline.');
  const key = crypto.randomUUID();
  const change: Change = { key, shop: shop!, method, path, body: structuredClone(body || {}), createdAt: new Date().toISOString(), state: 'pending',
    ...(record?.updatedAt ? { base: { id: String(record._id || record.id), updatedAt: record.updatedAt, ...(record.offlineVersion ? { version: record.offlineVersion } : {}) } } : {}),
    ...(method === 'POST' && /\/(walk-in|services|products)$/.test(path) ? { localId: key.replaceAll('-', '').slice(0, 24) } : {}) };
  change.shopName = (await findRecord(scope, shop!))?.name;
  if (path.endsWith('/walk-in')) {
    const services = await Promise.all((body.serviceIds || []).map((service: string) => findRecord(scope, service)));
    if (services.some(service => !service)) throw new Error('Load the selected services online once before saving a walk-in offline.');
    change.preview = { serviceIds: services, totalAmount: services.reduce((sum, service) => sum + Number(service.basePrice || 0), 0), staffId: { _id: body.staffPlan?.[0]?.staffId } };
  }
  if (path.endsWith('/checkout')) {
    const booking = record || previousCreate?.preview;
    const products = await Promise.all((body.products || []).map((product: any) => findRecord(scope, product.productId)));
    if (!booking || products.some(product => !product)) throw new Error('Load the appointment and its products online before recording this cash payment offline.');
    change.expectedTotal = body.priceOverride ?? Number(booking.totalAmount || 0) + products.reduce((sum, product, index) => sum + Number(product.price || 0) * body.products[index].quantity, 0) + Number(body.tip || 0);
  }
  await store.save(scope, 'write:' + key, change); // resolve only AFTER durable commit
  if (scope !== state.scope) throw new Error('Account changed. Open the original account to review its saved work.');
  await refreshItems(scope);
  notify('Saved on this device — waiting to sync.');
  reload?.();
  return { data: change.localId ? localRecord(change) : { ...record, ...body, __offline: true }, __offline: true };
}
function substitute(value: any, mappings: Record<string, any>): any {
  if (typeof value === 'string') return mappings[value]?._id || value;
  if (Array.isArray(value)) return value.map(v => substitute(v, mappings));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, mappings)]));
  return value;
}
async function syncWork() {
  const scope = state.scope, epoch = generation;
  if (!scope || !send || !navigator.onLine) return;
  update({ syncing: true });
  try {
    try {
      const remote = await send('/website-sync/conflicts', null, scope);
      if (epoch !== generation) return;
      const local = await store.list<Change>(scope,'write:');
      for(const issue of Array.isArray(remote.data) ? remote.data : []) {
        const existing = local.find(row => row.value.key === issue.key || row.value.supersedes === issue.key || row.value.resolveConflictId === issue._id);
        if(existing) { if(existing.value.key === issue.key && !existing.value.resolveConflictId) await store.save(scope,existing.id,{...existing.value,resolveConflictId:issue._id}); continue; }
        await store.save(scope,'write:'+issue.key,{key:issue.key,shop:String(issue.businessId),method:'POST',path:`/dashboard/${issue.businessId}/walk-in`,body:issue.body,localId:issue._id,resolveConflictId:issue._id,createdAt:issue.createdAt,state:'conflict',error:issue.error});
      }
    } catch { /* Existing local work remains available if the remote queue cannot load. */ }
    await refreshItems(scope);
    const mappings = await store.read<Record<string, any>>(scope, 'mappings') || {};
    for (const item of state.items) {
      if (epoch !== generation || !navigator.onLine) break;
      if(item.state !== 'pending') {
        let check; try { check = await send('/website-sync/operations/'+item.key,null,scope); } catch { break; }
        if(check.data?.state !== 'resolved') break;
        const result=check.data.result;
        if(result?._id && item.localId) { mappings[item.localId]=result; await store.save(scope,'mappings',mappings); }
        if(result?.cancelledLocal) { for(const later of state.items.slice(state.items.indexOf(item)+1)) await store.save(scope,'write:'+later.key,{...later,state:'failed',error:'The original local booking was cancelled. Review its dependent work.'}); }
        await store.remove(scope,'write:'+item.key); continue;
      }
      const stored = await store.read<Change>(scope, 'write:' + item.key);
      if (!stored) continue;
      const resolvedPath = item.path.split('/').map(part => mappings[part]?._id || part).join('/');
      const previousId = target(item);
      if (!stored.wire) {
        const mapped = previousId && mappings[previousId];
        stored.wire = { key: item.key, method: item.method, path: resolvedPath, body: substitute(item.body, mappings),
          ...(item.supersedes ? { supersedes: item.supersedes } : {}),
          ...(item.resolveConflictId ? { resolveConflictId: item.resolveConflictId } : {}),
          ...(item.expectedTotal !== undefined ? { expectedTotal: item.expectedTotal } : {}),
          ...(mapped?.updatedAt ? { base: { id: mapped._id, updatedAt: mapped.updatedAt, ...(mapped.offlineVersion ? { version: mapped.offlineVersion } : {}) } } : item.base ? { base: item.base } : {}) };
        await store.save(scope, 'write:' + item.key, stored);
      }
      try {
        const earnings = resolvedPath.startsWith('/earnings/');
        const response = await send(earnings ? resolvedPath : '/website-sync/' + item.shop, earnings ? stored.wire.body : stored.wire, scope);
        if (epoch !== generation) return;
        const result = response.data;
        if(result?.cancelledLocal) {
          for(const later of state.items.slice(state.items.indexOf(item)+1)) await store.save(scope,'write:'+later.key,{...later,state:'failed',error:'The local booking was cancelled. Review dependent cash records.'});
          await store.remove(scope,'write:'+item.key); break;
        }
        if (result?._id) {
          const identity = { _id: result._id, updatedAt: result.updatedAt, offlineVersion: result.offlineVersion };
          if (item.localId) mappings[item.localId] = identity;
          if (previousId) mappings[previousId] = identity;
          await store.save(scope, 'mappings', mappings);
        }
        await commitSnapshot(scope, item, result);
        // Persist mappings before removing the operation. A crash between these
        // steps retries the same immutable key; the server returns the same result.
        await store.remove(scope, 'write:' + item.key);
        await store.save(scope, 'meta', { lastSync: Date.now() });
        update({ lastSync: Date.now(), offline: false });
      } catch (error: any) {
        if (epoch !== generation) return;
        const status = error?.response?.status;
        if (!status || [408, 429, 500, 502, 503, 504].includes(status)) { connection(true); break; }
        stored.state = status === 409 ? 'conflict' : 'failed';
        stored.error = status === 401 ? 'Sign in again to sync this work.' : error?.response?.data?.message || 'This change needs review before it can sync.';
        await store.save(scope, 'write:' + item.key, stored);
        break; // Never skip a dependency or silently replace a conflicting value.
      }
    }
  } finally {
    if (epoch === generation) { await refreshItems(scope); update({ syncing: false }); reload?.(); }
  }
}
export function syncNow() {
  if (!running) running = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('zolmi-website-sync', syncWork);
    else await syncWork();
  })().finally(() => { running = undefined; });
  return running;
}
export async function retry(key: string) {
  const item = state.items.find(i => i.key === key);
  if (!item || item.state === 'conflict') return;
  await store.save(state.scope, 'write:' + key, { ...item, state: 'pending', error: '' });
  await refreshItems(); await syncNow();
}
export async function resolutionArtists(item: Change): Promise<Array<{ id: string; name: string }>> {
  const rows = await records(state.scope), options = new Map<string, string>();
  for (const row of rows) {
    if (!row.value.path.includes(item.shop) || !row.value.path.endsWith('/staff')) continue;
    const data = row.value.data?.data;
    if (!Array.isArray(data)) continue;
    for (const staff of data) {
      const services = (staff.services || []).map((service: any) => String(service._id || service));
      if (staff.isActive === false || (services.length && item.body?.serviceIds?.some((id: string) => !services.includes(id)))) continue;
      options.set(String(staff.staffId || staff._id), staff.userId?.fullName || [staff.firstName, staff.lastName].filter(Boolean).join(' ') || 'Professional');
    }
  }
  const original = item.body?.staffPlan?.[0]?.staffId;
  if (original && !options.has(original)) options.set(original, 'Original professional');
  return Array.from(options, ([id, name]) => ({ id, name }));
}
export async function resolveWalkIn(key: string, start: string, professional: string) {
  const scope = state.scope, item = state.items.find(item => item.key === key);
  if (!item || item.state !== 'conflict' || !item.path.endsWith('/walk-in') || state.syncing) throw new Error('Only a conflicted walk-in can be revised.');
  const from = new Date(start).getTime();
  if (!Number.isFinite(from) || !professional) throw new Error('Choose a professional and a valid time.');
  let cursor = from;
  const plan = item.body!.staffPlan.map((segment: any) => {
    const duration = +new Date(segment.endTime) - +new Date(segment.startTime);
    const revised = { ...segment, staffId: professional, startTime: new Date(cursor).toISOString(), endTime: new Date(cursor + duration).toISOString() };
    cursor += duration; return revised;
  });
  const revised: Change = { ...item, key: crypto.randomUUID(), supersedes: item.key, wire: undefined, state: 'pending', error: '', body: { ...item.body, startTime: new Date(from).toISOString(), endTime: new Date(cursor).toISOString(), staffPlan: plan } };
  // Keep localId stable: dependent cash records must follow the resolved walk-in.
  await store.replace(scope, 'write:' + item.key, 'write:' + revised.key, revised);
  await refreshItems(scope); reload?.(); notify('Revised booking saved. Availability will be checked before confirmation.');
  await syncNow();
}
export async function discardFrom(key: string) {
  if (state.syncing) return;
  const index = state.items.findIndex(i => i.key === key);
  const current = state.items[index];
  if(current?.resolveConflictId) {
    if(!navigator.onLine || !send) throw new Error('Reconnect to cancel this shared conflict safely.');
    await send(`/website-sync/${current.shop}/conflicts/${current.resolveConflictId}`,{},state.scope,'DELETE');
  }
  // Later changes may depend on this one. Keep them visible rather than silently
  // dropping the dependency or applying it against the wrong record.
  for (const item of state.items.slice(index + 1)) {
    await store.save(state.scope, 'write:' + item.key, { ...item, state: 'failed', error: 'An earlier change was discarded. Review this change before retrying.' });
  }
  await store.remove(state.scope, 'write:' + key); await refreshItems(); reload?.();
}
export async function chosenShop(id?: string) {
  if (!state.scope) return '';
  if (id !== undefined) await store.save(state.scope, 'selected-shop', id);
  return await store.read<string>(state.scope, 'selected-shop') || '';
}
export async function beforeLogout() {
  if (state.items.length && !window.confirm(`There are ${state.items.length} changes saved only on this device. Signing out will delete them. Stay signed in to sync them first. Sign out and delete them?`)) return false;
  const scope = state.scope;
  generation++;
  await setIdentity(null);
  if (scope) await store.clear(scope);
  return true;
}
export function changeLabel(change: Change) { return label(change); }
