export type Change = {
  key: string; shop: string; method: string; path: string; body?: Record<string, any>;
  base?: { id: string; updatedAt: string; version?: string }; localId?: string;
  createdAt: string; state: 'pending' | 'conflict' | 'failed'; error?: string;
  // Frozen before the first send, including after an ambiguous connection loss.
  wire?: Record<string, any>;
  preview?: Record<string, any>; shopName?: string; expectedTotal?: number;
  supersedes?: string;
  resolveConflictId?: string;
};
const id = '[a-f\\d]{24}';
export function canRead(path: string) {
  if (/availability|slots|verification|receipt|ticket|messages|conversation|screenshot|export|\/admin|\/sms|website-sync/i.test(path)) return false;
  return path === '/auth/me' || path === '/auth/workspaces' || path === '/businesses' ||
    new RegExp(`^/businesses(?:/${id}(?:/(?:staff|services|reviews|product-reviews))?)?$`).test(path) ||
    new RegExp(`^/dashboard/${id}(?:/|$)`).test(path) ||
    new RegExp(`^/earnings/${id}(?:/|$)`).test(path) || path === '/categories' || path === '/category-options';
}
export function writable(path: string, method: string, body: any): string | null {
  const dashboard = new RegExp(`^/dashboard/(${id})/(.+)$`).exec(path);
  if (dashboard) {
    const [, shop, action] = dashboard;
    if (method === 'POST' && /^(walk-in|services|products)$/.test(action)) return action === 'walk-in' && body?.paymentMethod && !['cash', 'in-shop'].includes(body.paymentMethod) ? null : shop;
    if (method === 'PATCH' && new RegExp(`^(?:clients/${id}/notes|bookings/${id}|(?:services|products)/${id}|staff/[\\w-]{1,128}(?:/(?:visibility|archive))?)$`).test(action)) {
      if (action.startsWith('staff/') && ['email', 'password', 'firstName', 'lastName', 'fullName', 'phoneNumber', 'serviceCommission', 'productCommission', 'permissionLevel', 'hourlyWage'].some(k => k in (body || {}))) return null;
      return shop;
    }
    if (method === 'DELETE' && new RegExp(`^(services|products)/${id}$`).test(action)) return shop;
  }
  // Checkout resolves the shop from the downloaded appointment.
  if (method === 'PATCH' && new RegExp(`^/bookings/${id}/checkout$`).test(path) && ['cash', 'in-shop'].includes(body?.paymentMethod)) return 'booking';
  if (method === 'POST' && new RegExp(`^/earnings/(${id})/(?:self|${id})$`).test(path) && body?.key) return path.split('/')[2];
  return null;
}
export function scrub(value: any): any {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([k]) => !/password|token|secret|credential|privatekey|settlementAccount|settlementBank|paymentInstructions|screenshot|idCard|qrPayload/i.test(k))
    .map(([k, v]) => [k, scrub(v)]));
  return value;
}
export function recordIn(value: any, id: string): any {
  if (!value || typeof value !== 'object') return null;
  if ([value._id, value.id, value.staffId].some(key => key === id) && value.updatedAt) return value;
  for (const child of Object.values(value)) {
    const found = recordIn(child, id); if (found) return found;
  }
  return null;
}
export function label(change: Pick<Change, 'path' | 'method'>) {
  if (change.path.includes('/walk-in')) return 'Walk-in appointment';
  if (change.path.includes('/checkout')) return 'Cash payment record';
  if (change.path.includes('/earnings/')) return 'Earnings entry';
  if (change.path.includes('/notes')) return 'Client notes';
  if (change.path.includes('/products')) return 'Inventory change';
  if (change.path.includes('/services')) return 'Service change';
  if (change.path.includes('/staff')) return 'Staff update';
  return 'Appointment update';
}
