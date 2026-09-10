import assert from 'node:assert/strict';
import { bookingDisplayStatus } from './bookingUtils';

assert.equal(bookingDisplayStatus({ status: 'confirmed', computedStatus: 'completed' }), 'completed');
assert.equal(bookingDisplayStatus({ status: 'confirmed', computedStatus: 'upcoming' }), 'confirmed');
assert.equal(bookingDisplayStatus({ status: 'no-show' }), 'no_show');
assert.equal(bookingDisplayStatus({ status: 'no_show' }), 'no_show');
assert.equal(bookingDisplayStatus({ status: 'expired' }), 'expired');
assert.equal(bookingDisplayStatus({ status: 'cancelled' }), 'cancelled');
assert.equal(bookingDisplayStatus({ status: 'pending' }), 'pending');
console.log('Booking row labels match the status filters.');
