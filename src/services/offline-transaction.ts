import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose, { ClientSession } from 'mongoose';

// Only the website sync endpoint supplies this context. Ordinary API calls keep
// their existing transaction boundaries.
export const offlineTransaction = new AsyncLocalStorage<{
  session: ClientSession; afterCommit: Array<() => void | Promise<void>>;
}>();
export const bookingSession = () => offlineTransaction.getStore()?.session ?? mongoose.startSession();
export const bookingTransaction = async <T>(session: ClientSession, work: () => Promise<T>): Promise<T> =>
  offlineTransaction.getStore()?.session === session ? work() : session.withTransaction(work) as Promise<T>;
export const finishBookingSession = async (session: ClientSession) => {
  if (offlineTransaction.getStore()?.session !== session) await session.endSession();
};
export const afterOfflineCommit = async (work: () => void | Promise<void>) => {
  const context = offlineTransaction.getStore();
  if (context) context.afterCommit.push(work);
  else await work();
};
