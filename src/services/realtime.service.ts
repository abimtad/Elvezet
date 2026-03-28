import type { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import Booking, { IBooking } from '../models/Booking';
import Business from '../models/Business';
import User, { IUser } from '../models/User';
import StaffProfile from '../models/StaffProfile';
import { getFirebaseAdmin } from '../config/firebase';
import { getRedisClient, isRedisReady } from '../config/redis';
import { assertTraffic, policies } from './traffic-limit.service';
import { ipKeyGenerator } from 'express-rate-limit';
import ApiError from '../utils/ApiError';
import type Redis from 'ioredis';
import { isIP } from 'node:net';

let realtimeServer: Server | null = null;
let publisher: Redis | null = null;
let subscriber: Redis | null = null;
const instance = randomUUID();
const channel = 'zolmi:authorized-events:v1';
const personal = (id: string) => `identity:${id}`;
const workspace = (id: string) => `workspace:${id}`;
const conversation = (id: string) => `booking:${id}`;
type Envelope = { instance: string; event: string; payload: Record<string, unknown>; bookingId: string; chat: boolean };

export function socketClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  const nearest = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : undefined;
  return ipKeyGenerator(process.env.RENDER === 'true' && nearest && isIP(nearest) ? nearest : socket.handshake.address || 'unknown');
}

export async function authenticateSocket(socket: Socket): Promise<IUser> {
  await assertTraffic(policies.socketIp, socketClientIp(socket));
  let user: IUser | null;
  let expiresAt = Date.now() + 3600000;
  const dev = socket.handshake.headers['x-dev-user-id'] || socket.handshake.auth?.devUserId;
  if (process.env.NODE_ENV === 'development' && typeof dev === 'string') {
    user = await User.findOne(Types.ObjectId.isValid(dev) ? { _id: dev } : { firebaseUid: dev });
  } else {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || token.length > 10000) throw new ApiError(401, 'Sign in for live updates');
    const decoded = await getFirebaseAdmin().auth().verifyIdToken(token, true);
    expiresAt = decoded.exp * 1000;
    user = await User.findOne({ firebaseUid: decoded.uid });
  }
  if (!user || user.isBanned || user.deletionPendingAt || expiresAt <= Date.now()) throw new ApiError(401, 'Account unavailable');
  await assertTraffic(policies.socketUser, String(user._id));
  socket.data.userId = String(user._id);
  socket.data.firebaseUid = user.firebaseUid;
  socket.data.expiresAt = expiresAt;
  const requested = socket.handshake.auth?.businessId || socket.handshake.headers['x-business-id'];
  if (requested) {
    if (typeof requested !== 'string' || !/^[a-f\d]{24}$/i.test(requested)) throw new ApiError(400, 'Invalid workspace');
    const business = await Business.findById(requested).select('ownerId').lean();
    const member = business && (String(business.ownerId) === String(user._id) || await StaffProfile.exists({ businessId: requested, staffId: { $in: [String(user._id), user.firebaseUid] }, isActive: true }));
    if (!member) throw new ApiError(403, 'Workspace access required');
    socket.data.businessId = requested;
  }
  return user;
}

/** Recheck persisted membership in batches before delivery, including removal
 * and bans on already-open sockets. Never await this from a booking response. */
export async function deliverAuthorizedEvent(envelope: Envelope): Promise<void> {
  const io = realtimeServer;
  if (!io) return;
  const booking = await Booking.findById(envelope.bookingId).lean();
  if (!booking) return;
  const businessId = String(booking.businessId);
  const rooms = envelope.chat ? [conversation(envelope.bookingId)] : [workspace(businessId), personal(String(booking.userId))];
  const ids = new Set<string>();
  for (const room of rooms) for (const id of io.sockets.adapter.rooms.get(room) || []) ids.add(id);
  const sockets = [...ids].map(id => io.sockets.sockets.get(id)).filter((s): s is Socket => !!s && !!s.data.userId && s.data.expiresAt > Date.now());
  if (!sockets.length) return;
  const [business, users] = await Promise.all([
    Business.findById(businessId).select('ownerId').lean(),
    User.find({ _id: { $in: sockets.map(s => s.data.userId) }, isBanned: { $ne: true }, deletionPendingAt: { $exists: false } }).select('firebaseUid blockedUsers').lean(),
  ]);
  if (!business) return;
  const aliases = users.flatMap(u => [String(u._id), u.firebaseUid]);
  const staff = await StaffProfile.find({ businessId, staffId: { $in: aliases }, isActive: true }).select('staffId').lean();
  const members = new Set(staff.map(p => p.staffId));
  const participants = envelope.chat ? await User.find({ $or: [
    { _id: { $in: [String(booking.userId), String(business.ownerId)].filter(id => /^[a-f\d]{24}$/i.test(id)) } },
    { firebaseUid: String(booking.userId) },
  ] }).select('blockedUsers isBanned deletionPendingAt').lean() : [];
  if (participants.some(p => p.isBanned || p.deletionPendingAt || p.blockedUsers?.some(id => participants.some(other => String(other._id) === String(id))))) return;
  for (const socket of sockets) {
    const user = users.find(u => String(u._id) === socket.data.userId);
    if (!user) continue;
    const userIds = [String(user._id), user.firebaseUid];
    const owner = String(business.ownerId) === String(user._id);
    const customer = userIds.includes(String(booking.userId));
    const member = userIds.some(id => members.has(id));
    const assigned = userIds.includes(String(booking.staffId)) || booking.staffPlan?.some(p => userIds.includes(String(p.staffId)));
    if (owner || customer || (member && (envelope.chat || assigned))) socket.emit(envelope.event, envelope.payload);
  }
}

export function publishAuthorizedEvent(event: string, payload: Record<string, unknown>, bookingId: string, chat = false): void {
  const envelope: Envelope = { instance, event, payload, bookingId, chat };
  void deliverAuthorizedEvent(envelope).catch(() => console.warn('authorized_event_delivery_failed'));
  if (publisher?.status === 'ready') void publisher.publish(channel, JSON.stringify(envelope)).catch(() => console.warn('realtime_publish_failed'));
}

export const initializeRealtimeSocket = (io: Server): void => {
  realtimeServer = io;
  io.use((socket, next) => { void authenticateSocket(socket).then(() => next(), error => {
    const denied = new Error('Live connection denied. Sign in or retry shortly.') as Error & { data: unknown };
    denied.data = { code: error.statusCode || 401, retryAfter: error.retryAfter };
    next(denied);
  }); });
  io.on('connection', socket => {
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, socket.data.expiresAt - Date.now()));
    expiry.unref();
    socket.once('disconnect', () => clearTimeout(expiry));
    void socket.join([personal(socket.data.userId), personal(socket.data.firebaseUid)]);
    if (socket.data.businessId) void socket.join(workspace(socket.data.businessId));
    socket.use((packet, next) => {
      if (socket.data.expiresAt <= Date.now()) return next(new Error('Session expired. Reconnect.'));
      // Known operations already consume an account quota in their handlers.
      if (['send-message', 'join-chat'].includes(packet[0])) return next();
      void assertTraffic(policies.socketPackets, socket.data.userId).then(() => next(), error => next(error));
    });
    socket.emit('realtime:connected', { ok: true });
  });
  if (isRedisReady()) {
    const options = { enableOfflineQueue: false, maxRetriesPerRequest: 0, commandTimeout: 1000,
      retryStrategy: (times: number) => Math.min(times * 200, 5000) };
    publisher = getRedisClient().duplicate(options);
    subscriber = getRedisClient().duplicate(options);
    publisher.on('error', () => undefined); subscriber.on('error', () => undefined);
    subscriber.on('ready', () => { void subscriber!.subscribe(channel).catch(() => undefined); });
    subscriber.on('message', (_channel, raw) => {
      try {
        const event = JSON.parse(raw) as Envelope;
        if (event.instance !== instance && ['message', 'booking:new', 'booking:updated'].includes(event.event)) {
          void deliverAuthorizedEvent(event).catch(() => console.warn('authorized_remote_event_failed'));
        }
      } catch { /* Never forward malformed bus events. */ }
    });
  }
};
export const emitBookingEvent = (event: 'booking:new' | 'booking:updated', booking: IBooking): void => {
  publishAuthorizedEvent(event, {
    bookingId: String(booking._id), businessId: String(booking.businessId), staffId: String(booking.staffId),
    startTime: booking.startTime, endTime: booking.endTime, status: booking.status,
  }, String(booking._id));
};
export function closeRealtimeBus(): void { publisher?.disconnect(); subscriber?.disconnect(); publisher = subscriber = null; }
