import { Request, RequestHandler } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { LimitPolicy, policies, trafficLimiter } from '../services/traffic-limit.service';
import auth from './auth.middleware';

export const clientIp = (req: Request) => ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');
export const accountKey = (req: Request) => req.user ? `user:${req.user._id}` : `ip:${clientIp(req)}`;
export const httpLimit = (policy: LimitPolicy, key: (req: Request) => string = accountKey): RequestHandler => async (req, res, next) => {
  try {
    const result = await trafficLimiter.consume(policy, key(req));
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter);
      res.status(429).json({ status: 'error', data: null, message: 'Too many requests. Please retry shortly.', retryAfter: result.retryAfter });
      return;
    }
    next();
  } catch (error) { next(error); }
};
export const authIdentityKey = (req: Request) => {
  const raw = String(req.body?.phoneNumber || req.body?.email || '').trim().toLowerCase();
  // Phone variants must not create separate sign-in budgets.
  const identity = req.body?.phoneNumber ? raw.replace(/\D/g, '').replace(/^(251|0)/, '') : raw;
  return identity ? `identity:${createHash('sha256').update(identity).digest('hex')}` : `ip:${clientIp(req)}`;
};

/** Before route parsers/handlers. Authenticate once, then reuse that request identity. */
export const expensiveOperationGuard: RequestHandler = (req, res, next) => {
  const p = req.path;
  let policy: LimitPolicy | undefined;
  let publicRead = false;
  if (req.is('multipart/form-data')) policy = policies.upload;
  else if (/availability|\/quote$/.test(p) && ['GET', 'POST'].includes(req.method)) { policy = policies.availability; publicRead = true; }
  else if (req.method === 'POST' && /\/(?:payment-verification\/refresh|chapa\/(?:initialize|verify))$/.test(p)) policy = policies.verification;
  else if ((req.method === 'POST' && /\/(?:bookings)\/?$/.test(p)) || (req.method === 'PATCH' && /\/reschedule$/.test(p))) policy = policies.booking;
  if (!policy) return next();
  const apply = () => httpLimit(policy!)(req, res, error => {
    if (error) return next(error);
    if (policy === policies.verification) {
      const bookingId = p.match(/\/bookings\/([a-f\d]{24})\//i)?.[1].toLowerCase() || p;
      return httpLimit(policies.verificationBooking, r => `${accountKey(r)}:${bookingId}`)(req, res, next);
    }
    next();
  });
  if (publicRead) {
    // Public availability is read-only: do not add Firebase/DB authentication
    // to a formerly public hot path just to identify a quota. A token bucket plus
    // an IP ceiling bounds rotating-token abuse without trusting token claims.
    return httpLimit(policies.availabilityIp, clientIp)(req, res, error => {
      if (error) return next(error);
      httpLimit(policies.availability, r => r.user ? accountKey(r) :
        r.headers.authorization ? `public-token:${createHash('sha256').update(r.headers.authorization).digest('hex')}` : accountKey(r))(req, res, next);
    });
  }
  auth(req, res, error => error ? next(error) : apply());
};
