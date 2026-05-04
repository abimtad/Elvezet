import { createHash } from 'node:crypto';
import type Redis from 'ioredis';
import { getRedisClient, isRedisReady } from '../config/redis';

export type LimitPolicy = { name: string; max: number; windowMs: number };
export const policies = {
  edge: { name: 'edge', max: 12000, windowMs: 900000 },
  authIp: { name: 'auth-ip', max: 300, windowMs: 900000 },
  authIdentity: { name: 'auth-identity', max: 30, windowMs: 900000 },
  upload: { name: 'upload', max: 30, windowMs: 60000 },
  availability: { name: 'availability', max: 240, windowMs: 60000 },
  availabilityIp: { name: 'availability-ip', max: 1200, windowMs: 60000 },
  booking: { name: 'booking-write', max: 60, windowMs: 60000 },
  verification: { name: 'verification', max: 180, windowMs: 60000 },
  verificationBooking: { name: 'verification-booking', max: 60, windowMs: 60000 },
  chat: { name: 'chat-message', max: 120, windowMs: 60000 },
  join: { name: 'socket-join', max: 120, windowMs: 60000 },
  socketIp: { name: 'socket-connect-ip', max: 600, windowMs: 60000 },
  socketUser: { name: 'socket-connect-user', max: 60, windowMs: 60000 },
  socketPackets: { name: 'socket-packets', max: 600, windowMs: 60000 },
  webhookEdge: { name: 'webhook-edge', max: 3000, windowMs: 60000 },
  webhookInvalid: { name: 'webhook-invalid', max: 60, windowMs: 60000 },
  webhookValid: { name: 'webhook-valid', max: 3000, windowMs: 60000 },
  ticket: { name: 'ticket', max: 60, windowMs: 60000 },
  smsTest: { name: 'sms-test', max: 2, windowMs: 60000 },
  deletion: { name: 'deletion', max: 5, windowMs: 3600000 },
} satisfies Record<string, LimitPolicy>;

// One atomic round trip; concurrent instances share the same first-hit window.
export const COUNTER_SCRIPT = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; local ttl=redis.call('PTTL',KEYS[1]); if ttl<0 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); ttl=tonumber(ARGV[1]) end; return {n,ttl}`;
export type Counter = (key: string, windowMs: number) => Promise<[number, number]>;
let client: Redis | null = null;
let retryAt = 0;
function readyClient(): Redis | null {
  if (client?.status === 'ready') return client;
  if (client && !['end', 'close'].includes(client.status)) return null;
  if (!isRedisReady() || Date.now() < retryAt) return null;
  retryAt = Date.now() + 5000;
  client = getRedisClient().duplicate({ maxRetriesPerRequest: 0, enableOfflineQueue: false, commandTimeout: 20, connectTimeout: 1000 });
  client.on('error', () => undefined);
  return null; // Never wait for a connection in a user request.
}

export class TrafficLimiter {
  shared = false;
  private local = new Map<string, { count: number; until: number }>();
  private openUntil = 0;
  private sweepAt = 0;
  constructor(private counter: () => Counter | null, private budgetMs = 20) {}
  async consume(policy: LimitPolicy, subject: string) {
    const key = `zolmi:limit:v1:${policy.name}:${createHash('sha256').update(subject).digest('hex')}`;
    const now = Date.now();
    const count = now >= this.openUntil ? this.counter() : null;
    if (count) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const [hits, ttl] = await Promise.race([
          count(key, policy.windowMs),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('limiter deadline')), this.budgetMs); }),
        ]);
        this.shared = true;
        return { allowed: hits <= policy.max, remaining: Math.max(0, policy.max - hits), retryAfter: Math.max(1, Math.ceil(ttl / 1000)), shared: true };
      } catch {
        this.openUntil = now + 5000;
        console.warn('traffic_limiter_local_fallback');
      } finally { if (timer) clearTimeout(timer); }
    }
    // Fast, bounded emergency protection during Redis failure; no queued commands.
    this.shared = false;
    let bucket = this.local.get(key);
    if (!bucket || bucket.until <= now) {
      if (this.local.size >= 20000) {
        if (now >= this.sweepAt) {
          for (const [k, b] of this.local) if (b.until <= now) this.local.delete(k);
          this.sweepAt = now + 30000;
        }
        if (this.local.size >= 20000) this.local.delete(this.local.keys().next().value!);
      }
      bucket = { count: 0, until: now + policy.windowMs }; this.local.set(key, bucket);
    }
    bucket.count++;
    return { allowed: bucket.count <= policy.max, remaining: Math.max(0, policy.max - bucket.count), retryAfter: Math.max(1, Math.ceil((bucket.until - now) / 1000)), shared: false };
  }
}
export const trafficLimiter = new TrafficLimiter(() => {
  const redis = readyClient();
  return redis ? async (key, ms) => (await redis.eval(COUNTER_SCRIPT, 1, key, ms)) as [number, number] : null;
});

export async function initializeTrafficLimits(): Promise<void> {
  readyClient();
  const pending = client;
  if (!pending || pending.status === 'ready') return;
  await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); pending.off('ready', done); resolve(); };
    const timer = setTimeout(done, 1000);
    pending.once('ready', done);
  });
}
export const trafficLimitStore = () => trafficLimiter.shared && client?.status === 'ready' ? 'redis' : 'local-fallback';

export async function assertTraffic(policy: LimitPolicy, subject: string): Promise<void> {
  const result = await trafficLimiter.consume(policy, subject);
  if (!result.allowed) {
    const error = new Error('Too many requests. Please retry shortly.') as Error & { statusCode: number; retryAfter: number };
    error.statusCode = 429; error.retryAfter = result.retryAfter;
    throw error;
  }
}
