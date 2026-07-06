import './isolated-test-env';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import express from 'express';
import sharp from 'sharp';
import User from '../models/User';
import CustomerCredential from '../models/CustomerCredential';
import Business from '../models/Business';
import * as media from '../services/media.service';
import { syncUserFromFirebase, updateCurrentUserProfile } from '../services/auth.service';
import { updateBusiness, updateBusinessLogo, updateBusinessCoverImage, removeBusinessGalleryImage } from '../services/business.service';
import { updateBusinessSchema } from '../validators/business.validator';
import { parseProfilePictureUpload, uploadProfilePictureIfExists } from '../middlewares/profilePicture.middleware';
import { errorHandler } from '../middlewares/error.middleware';
import mongoose from 'mongoose';
import barberRoutes from '../routes/barber.routes';
import * as staffWorkspace from '../services/barber-workspace.service';
import StaffProfile from '../models/StaffProfile';

async function main() {
  // Deliberately stub persistence: never open a hosted or local database.
  const originals: Array<() => void> = [];
  const stub = (object: any, key: string, value: any) => {
    const before = object[key]; originals.push(() => { object[key] = before; }); object[key] = value;
  };
  const uid = new Types.ObjectId();
  const events: string[] = [];
  let failSave = false;
  let failCleanup = false;
  try {
    const savedUser = { _id: uid, fullName: 'Edited Name', email: 'edited@example.test', phoneNumber: '+251911111111', profilePicture: '/uploads/avatars/old.webp' };
    stub(User, 'exists', async () => null);
    stub(User, 'findOne', async () => savedUser);
    stub(User, 'findOneAndUpdate', async () => { throw new Error('Authentication must not write profile claims'); });
    assert.equal(await syncUserFromFirebase({ firebaseUid: 'fixture', fullName: 'Old Token Name', email: 'old@example.test' }), savedUser);
    assert.equal(savedUser.fullName, 'Edited Name');
    stub(User, 'findById', () => ({ select: async () => savedUser }));
    stub(CustomerCredential, 'exists', async () => null);
    stub(User, 'findByIdAndUpdate', async (_id: unknown, body: any) => {
      events.push('commit'); if (failSave) throw new Error('database failure');
      return { ...savedUser, ...body.$set };
    });
    stub(media, 'deleteLocalFile', async (path: string) => {
      events.push(`delete:${path}`); if (failCleanup) throw new Error('disk failure');
    });
    await updateCurrentUserProfile({ userId: uid, profilePicture: '/uploads/avatars/new.webp' });
    assert.deepEqual(events, ['commit', 'delete:/uploads/avatars/old.webp']);
    events.length = 0; failSave = true;
    await assert.rejects(updateCurrentUserProfile({ userId: uid, profilePicture: '/uploads/avatars/new.webp' }), /database failure/);
    assert.deepEqual(events, ['commit'], 'failed save preserves old image');
    failSave = false; failCleanup = true;
    await updateCurrentUserProfile({ userId: uid, profilePicture: '/uploads/avatars/new.webp' });
    failCleanup = false;

    const makeBusiness = () => ({ _id: new Types.ObjectId(), ownerId: uid,
      logoUrl: '/uploads/logos/old.webp', coverImageUrl: '/uploads/covers/old.webp', galleryUrls: [] as string[],
      location: { type: 'Point', coordinates: [38, 9] }, homeLocation: { type: 'Point', coordinates: [38, 9] },
      async save() { events.push('commit'); if (failSave) throw new Error('database failure'); },
    });
    let business = makeBusiness();
    stub(Business, 'findById', async () => business);
    events.length = 0;
    await updateBusinessLogo(String(business._id), '/uploads/logos/new.webp', uid);
    assert.deepEqual(events, ['commit', 'delete:/uploads/logos/old.webp']);
    events.length = 0; failSave = true; business = makeBusiness();
    await assert.rejects(updateBusinessCoverImage(String(business._id), '/uploads/covers/new.webp', uid), /database failure/);
    assert.deepEqual(events, ['commit']);
    failSave = false; business = makeBusiness(); events.length = 0;
    await updateBusiness(String(business._id), { logoUrl: '/uploads/logos/new.webp', coverImageUrl: '/uploads/covers/new.webp', longitude: 39, latitude: 10 }, uid);
    assert.equal(events[0], 'commit'); assert.equal(events.length, 3);
    assert.deepEqual(business.homeLocation.coordinates, [39, 10]);
    business = makeBusiness(); business.homeLocation.coordinates = [40, 11];
    await updateBusiness(String(business._id), { longitude: 39, latitude: 10 }, uid);
    assert.deepEqual(business.homeLocation.coordinates, [40, 11], 'preserve a separate travel origin');
    business = makeBusiness(); business.galleryUrls = [business.logoUrl]; events.length = 0;
    await removeBusinessGalleryImage(String(business._id), 0, uid);
    assert.deepEqual(events, ['commit'], 'do not delete image still used as logo');
    assert.equal(updateBusinessSchema.validate({ settlementBank: 'cbe_birr' }).value.settlementBank, 'cbebirr');
    assert.ok(updateBusinessSchema.validate({ settlementBank: 'other' }).error, 'do not accept unsupported payment banks');

    const app = express();
    stub(media, 'uploadProfilePicture', async () => '/uploads/avatars/test.webp');
    app.patch('/profile', (req, _res, next) => { req.user = { firebaseUid: 'fixture' } as any; next(); },
      parseProfilePictureUpload, uploadProfilePictureIfExists, (req, res) => res.json(req.body));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    try {
      const address = server.address() as { port: number };
      const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
      const upload = async (bytes: Uint8Array) => {
        const form = new FormData();
        // No image MIME, matching the customer's default Dio multipart upload.
        form.append('profilePicture', new Blob([bytes as any]), 'photo.png');
        return fetch(`http://127.0.0.1:${address.port}/profile`, { method: 'PATCH', body: form });
      };
      assert.equal((await upload(new Uint8Array(png))).status, 200);
      assert.equal((await upload(new Uint8Array([1, 2, 3]))).status, 400, 'reject fake image bytes');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }

    process.env.NODE_ENV = 'development'; // Only the isolated test server uses dev identity.
    const staffUser = { ...savedUser, firebaseUid: 'staff-fixture', roles: ['staff'] };
    stub(User, 'findOne', async () => staffUser);
    stub(staffWorkspace, 'barberContext', async () => ({ user: staffUser, profile: { _id: new Types.ObjectId() } }));
    stub(mongoose, 'startSession', async () => ({ withTransaction: async (work: () => Promise<void>) => work(), endSession: async () => {} }));
    stub(CustomerCredential, 'exists', () => ({ session: async () => ({ _id: 'linked-phone-credential' }) }));
    let profileWrites = 0;
    stub(User, 'updateOne', async () => { profileWrites++; });
    stub(StaffProfile, 'updateOne', async () => { profileWrites++; });
    const staffApp = express(); staffApp.use(express.json()); staffApp.use('/barber', barberRoutes); staffApp.use(errorHandler);
    const staffServer = staffApp.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => staffServer.once('listening', resolve));
    try {
      const port = (staffServer.address() as { port: number }).port;
      const request = (phone: string) => fetch(`http://127.0.0.1:${port}/barber/profile`, {
        method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dev-user-id': 'staff-fixture' },
        body: JSON.stringify({ fullName: 'Edited Staff', phoneNumber: phone }),
      });
      assert.equal((await request('+251922222222')).status, 409);
      assert.equal(profileWrites, 0, 'staff editor cannot bypass customer phone-login guard');
      assert.equal((await request(savedUser.phoneNumber)).status, 200);
      assert.equal(profileWrites, 2, 'other profile edits remain available');
    } finally { await new Promise<void>(resolve => staffServer.close(() => resolve())); }
    console.log('PASS: profile persistence, safe image replacement, customer multipart image validation, business image references, travel-origin edits, bank aliases');
  } finally { originals.reverse().forEach(restore => restore()); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
