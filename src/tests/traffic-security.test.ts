import './isolated-test-env';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { createHmac, randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { Types } from 'mongoose';
import { TrafficLimiter, policies, COUNTER_SCRIPT } from '../services/traffic-limit.service';
import { httpLimit, expensiveOperationGuard, authIdentityKey } from '../middlewares/traffic.middleware';
import { configureProxy } from '../config/proxy';
import { initializeRealtimeSocket, initializeRealtimeSocket as initialize, deliverAuthorizedEvent, closeRealtimeBus, socketClientIp } from '../services/realtime.service';
import { initializeChatSocket } from '../services/chat.service';
import User from '../models/User';
import Business from '../models/Business';
import Booking from '../models/Booking';
import StaffProfile from '../models/StaffProfile';
import Message from '../models/Message';
import * as firebase from '../config/firebase';
import env from '../config/env';
import webhooks from '../routes/verifyEt.routes';
import { errorHandler } from '../middlewares/error.middleware';

const { io: clientIo } = require('../../frontend/node_modules/socket.io-client');
const pause = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) {
  const end = Date.now() + 2000;
  while (!check()) { if (Date.now() > end) throw new Error('Timed out waiting for socket'); await pause(5); }
}
function query(value: any): any {
  return { select() { return this; }, lean: async () => value, then: (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject),
    populate() { const populated = { ...value, businessId: shops.find(b => String(b._id) === String(value.businessId)) };
      populated.depopulate = () => { populated.businessId = value.businessId; }; return query(populated); } };
}
function matches(row: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((part: any) => matches(row, part));
    if (value && typeof value === 'object' && !Types.ObjectId.isValid(value)) {
      if ('$in' in value) return value.$in.map(String).includes(String(row[key]));
      if ('$ne' in value) return row[key] !== value.$ne;
      if ('$exists' in value) return (row[key] !== undefined) === value.$exists;
    }
    return String(row[key]) === String(value);
  });
}
const makeUser = (name: string) => ({ _id: new Types.ObjectId(), firebaseUid: name, roles: ['customer'], blockedUsers: [] as Types.ObjectId[], isBanned: false });
const users = ['ownerA', 'ownerB', 'customerA', 'customerB', 'staffA', 'outsider'].map(makeUser);
const [ownerA, ownerB, customerA, customerB, staffA] = users;
const shops = [ownerA, ownerB].map((owner, i) => ({ _id: new Types.ObjectId(), ownerId: owner._id, type: 'shop', name: `Shop ${i}` }));
const memberships = [{ businessId: shops[0]._id, staffId: String(staffA._id), isActive: true }];
const bookings = [customerA, customerB].map(customer => ({ _id: new Types.ObjectId(), userId: String(customer._id), businessId: shops[0]._id, staffId: String(staffA._id), staffPlan: [], status: 'confirmed' }));

async function main() {
  // Atomic shared-store fixture: independent limiter instances and a restarted one
  // must consume the same budget. Actual Redis script integration is opt-in below.
  const counters = new Map<string, { n: number; until: number }>();
  const counter = async (key: string, ms: number): Promise<[number, number]> => {
    let b = counters.get(key); if (!b || b.until <= Date.now()) { b = { n: 0, until: Date.now() + ms }; counters.set(key, b); }
    return [++b.n, b.until - Date.now()];
  };
  const policy = { name: 'test-shared', max: 20, windowMs: 1000 };
  const a = new TrafficLimiter(() => counter), b = new TrafficLimiter(() => counter);
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).consume(policy, 'same-user')));
  assert.equal(burst.filter(r => r.allowed).length, 20);
  assert.equal((await new TrafficLimiter(() => counter).consume(policy, 'same-user')).allowed, false, 'restart cannot reset shared quota');
  assert.equal((await b.consume(policy, 'different-user')).allowed, true);
  const slow = new TrafficLimiter(() => async () => new Promise(() => {}), 20);
  let start = performance.now(); await slow.consume(policy, 'user');
  assert.ok(performance.now() - start < 150, 'dead Redis has a bounded wait');
  start = performance.now(); await slow.consume(policy, 'user');
  assert.ok(performance.now() - start < 20, 'circuit breaker skips subsequent waits');
  const times: number[] = [];
  for (let i = 0; i < 300; i++) { start = performance.now(); await a.consume({ ...policy, max: 1000 }, `bench-${i}`); times.push(performance.now() - start); }
  times.sort((x, y) => x - y);
  console.log(`Limiter fixture p95: ${times[Math.floor(times.length * .95)].toFixed(3)} ms (not a deployed Redis benchmark)`);

  const original: Array<() => void> = [];
  const stub = (object: any, name: string, fn: any) => { const old = object[name]; original.push(() => object[name] = old); object[name] = fn; };
  const sockets: any[] = [];
  let io: Server | undefined;
  let http: ReturnType<typeof createServer> | undefined;
  try {
    process.env.NODE_ENV = 'production';
    stub(firebase, 'getFirebaseAdmin', () => ({ auth: () => ({ verifyIdToken: async (token: string) => {
      if (!users.some(u => u.firebaseUid === token)) throw new Error('bad token');
      return { uid: token, exp: Math.floor(Date.now() / 1000) + 120 };
    } }) }));
    stub(User, 'findOne', (filter: any) => query(users.find(u => matches(u, filter)) || null));
    stub(User, 'find', (filter: any) => query(users.filter(u => matches(u, filter))));
    stub(User, 'findById', (id: any) => query(users.find(u => String(u._id) === String(id))));
    stub(Business, 'findById', (id: any) => query(shops.find(b => String(b._id) === String(id))));
    stub(Booking, 'findById', (id: any) => query(bookings.find(b => String(b._id) === String(id))));
    stub(Booking, 'findOneAndUpdate', () => query(null));
    stub(StaffProfile, 'exists', (filter: any) => query(memberships.find(m => matches(m, filter)) || null));
    stub(StaffProfile, 'find', (filter: any) => query(memberships.filter(m => matches(m, filter))));
    const savedMessages: any[] = [];
    stub(Message, 'create', async (payload: any) => { const doc = { ...payload, _id: new Types.ObjectId(), createdAt: new Date() }; savedMessages.push(doc); return doc; });
    const app = express(); configureProxy(app, 'true'); app.use(express.json());
    app.use('/op', (req, _res, next) => { req.user = users.find(u => u.firebaseUid === req.get('x-test-user')) as any; next(); }, expensiveOperationGuard);
    app.post('/op/bookings', (_req, res) => res.sendStatus(201));
    app.post('/op/bookings/availability/check', (_req, res) => res.sendStatus(200));
    app.post('/op/bookings/:id/payment-verification/refresh', (_req, res) => res.sendStatus(200));
    app.post('/op/photo', (_req, res) => res.sendStatus(201));
    app.post('/login', httpLimit(policies.authIdentity, authIdentityKey), (_req, res) => res.sendStatus(200));
    app.use('/hooks', webhooks); app.use(errorHandler);
    http = createServer(app); io = new Server(http, { maxHttpBufferSize: 65536 }); initialize(io); initializeChatSocket(io);
    await new Promise<void>(resolve => http!.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(http.address() as any).port}`;
    const connect = (auth: any, permitted = true) => new Promise<any>((resolve, reject) => {
      const socket = clientIo(url, { auth, transports: ['websocket'], forceNew: true, reconnection: false }); sockets.push(socket);
      socket.once('connect', () => permitted ? resolve(socket) : reject(new Error('Unauthorized socket connected')));
      socket.once('connect_error', (error: Error) => permitted ? reject(error) : resolve(socket));
    });
    await connect({}, false); await connect({ devUserId: 'ownerA' }, false);
    await connect({ token: 'customerA', businessId: String(shops[0]._id) }, false);
    const clients = await Promise.all([
      connect({ token: 'ownerA', businessId: String(shops[0]._id) }),
      connect({ token: 'ownerB', businessId: String(shops[1]._id) }),
      connect({ token: 'customerA' }), connect({ token: 'customerB' }),
      connect({ token: 'staffA', businessId: String(shops[0]._id) }), connect({ token: 'outsider' }),
    ]);
    const received = clients.map(() => ({ bookings: [] as any[], messages: [] as any[] }));
    clients.forEach((client, i) => { client.on('booking:updated', (e: any) => received[i].bookings.push(e)); client.on('message', (e: any) => received[i].messages.push(e)); });
    const event = { instance: 'test', event: 'booking:updated', payload: { bookingId: String(bookings[0]._id) }, bookingId: String(bookings[0]._id), chat: false };
    await deliverAuthorizedEvent(event); await pause();
    assert.deepEqual(received.map(r => r.bookings.length), [1, 0, 1, 0, 1, 0], 'only owner, booked customer and assigned active staff');
    memberships[0].isActive = false;
    await deliverAuthorizedEvent(event); await pause();
    assert.equal(received[4].bookings.length, 1, 'revoked staff must stop receiving immediately');
    memberships[0].isActive = true;
    customerA.isBanned = true; await deliverAuthorizedEvent(event); await pause();
    assert.equal(received[2].bookings.length, 2, 'banned customer must stop receiving'); customerA.isBanned = false;

    const join = { bookingId: String(bookings[0]._id), userId: String(customerA._id), barberId: String(ownerA._id) };
    clients[0].emit('join-chat', join); clients[2].emit('join-chat', join);
    await until(() => !!io!.sockets.adapter.rooms.get(`booking:${bookings[0]._id}`)?.has(clients[2].id));
    assert.ok(!io.sockets.sockets.get(clients[2].id)!.rooms.has(`barber:${ownerA._id}`));
    await new Promise<void>((resolve, reject) => clients[2].emit('send-message', { bookingId: join.bookingId, senderId: String(ownerB._id), text: 'Hello' }, (ack: any) => ack.ok ? resolve() : reject(new Error(ack.error))));
    await until(() => received[2].messages.length === 1);
    assert.equal(savedMessages[0].senderId, String(customerA._id), 'ignore forged sender ID');
    assert.equal(received[3].messages.length, 0, 'another customer never receives the conversation');
    assert.equal(received[1].messages.length, 0, 'another shop never receives chat');
    await new Promise<void>(resolve => {
      clients[5].once('chat:error', () => resolve()); clients[5].emit('join-chat', join);
    });
    assert.ok(!io.sockets.adapter.rooms.get(`booking:${bookings[0]._id}`)?.has(clients[5].id));
    for (let i = 1; i < 120; i++) {
      const ack: any = await new Promise(resolve => clients[2].emit('send-message', { bookingId: join.bookingId, text: `Message ${i}` }, resolve));
      assert.equal(ack.ok, true, 'normal rapid message burst is not delayed/blocked');
    }
    const limited: any = await new Promise(resolve => clients[2].emit('send-message', { bookingId: join.bookingId, text: 'Over quota' }, resolve));
    assert.equal(limited.code, 429); assert.ok(limited.retryAfter);
    const joinLimited = new Promise<any>(resolve => clients[2].on('chat:error', (error: any) => { if (error.code === 429) resolve(error); }));
    for (let i = 0; i < 120; i++) clients[2].emit('join-chat', join);
    assert.ok((await joinLimited).retryAfter);
    const connectMax = policies.socketUser.max;
    policies.socketUser.max = 1;
    try { await connect({ token: 'customerA' }, false); }
    finally { policies.socketUser.max = connectMax; }

    const post = (path: string, user = 'customerA', body: any = {}) => fetch(url + path, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body),
    });
    for (let i = 0; i < 60; i++) assert.equal((await post('/op/bookings')).status, 201);
    const blocked = await post('/op/bookings'); assert.equal(blocked.status, 429); assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await post('/op/bookings', 'customerB')).status, 201, 'shared-IP users have independent budgets');
    for (let i = 0; i < 31; i++) {
      const photo = new FormData(); photo.append('image', new Blob(['test']), 'test.png');
      const response = await fetch(url + '/op/photo', { method: 'POST', headers: { 'x-test-user': 'customerA' }, body: photo });
      assert.equal(response.status, i < 30 ? 201 : 429, 'uploads have an independent quota before file processing');
    }
    for (let i = 0; i < 25; i++) assert.equal((await post(`/op/bookings/${bookings[0]._id}/payment-verification/refresh`)).status, 200, 'normal payment polling/retries stay allowed');
    assert.equal((await post('/op/bookings/availability/check', '')).status, 200, 'guest availability remains public');
    for (let i = 0; i < 30; i++) assert.equal((await post('/login', '', { phoneNumber: '+251911123456' })).status, 200);
    assert.equal((await post('/login', '', { phoneNumber: '0911123456' })).status, 429, 'phone aliases share budget');
    assert.equal((await post('/login', '', { phoneNumber: '+251922123456' })).status, 200);
    (env as any).VERIFY_ET_WEBHOOK_SECRET = 'isolated-secret';
    const body = JSON.stringify({ event: 'test' }), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', 'isolated-secret').update(`${timestamp}.${body}`).digest('hex');
    const hookApp = express(); hookApp.use('/hooks', webhooks);
    const hook = hookApp.listen(0, '127.0.0.1'); await new Promise<void>(resolve => hook.once('listening', resolve));
    try {
      const hookUrl = `http://127.0.0.1:${(hook.address() as any).port}/hooks/verify-et`;
      const send = (sig: string) => fetch(hookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-timestamp': timestamp, 'x-webhook-signature': sig, 'x-webhook-test': 'true' }, body });
      assert.equal((await send(signature)).status, 204); assert.equal((await send(signature)).status, 204, 'signed retry accepted');
      assert.equal((await send('invalid')).status, 401);
    } finally { await new Promise<void>(resolve => hook.close(() => resolve())); }
    process.env.RENDER = 'true';
    assert.equal(socketClientIp({ handshake: { headers: { 'x-forwarded-for': '192.0.2.99, 203.0.113.10' }, address: '127.0.0.1' } } as any), '203.0.113.10');
    console.log('PASS: authenticated sockets, workspace/booking isolation, removal/bans, chat sender spoofing, normal booking bursts, payment polling, shared IP, phone aliases, signed webhook retries');
  } finally {
    sockets.forEach(s => s.disconnect()); closeRealtimeBus();
    if (io) await new Promise<void>(resolve => io!.close(() => resolve()));
    original.reverse().forEach(restore => restore());
  }
  if (process.env.TEST_REDIS_URL) {
    const Redis = require('ioredis'); const redis = new Redis(process.env.TEST_REDIS_URL, { maxRetriesPerRequest: 0, connectTimeout: 1000 });
    const key = `zolmi:test:${randomUUID()}`;
    try {
      const results = await Promise.all(Array.from({ length: 25 }, () => redis.eval(COUNTER_SCRIPT, 1, key, 10000)));
      assert.deepEqual(results.map((r: any) => r[0]).sort((x: number, y: number) => x - y), Array.from({ length: 25 }, (_, i) => i + 1));
      assert.ok(await redis.pttl(key) > 0); console.log('PASS: actual Redis Lua atomicity and TTL');
    } finally { await redis.del(key); redis.disconnect(); }
  } else console.log('NOT RUN: actual Redis integration (set TEST_REDIS_URL to a disposable Redis instance)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
