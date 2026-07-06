import assert from 'node:assert/strict';
import {test} from 'node:test';
import {generateKeyPairSync} from 'node:crypto';
import User from '../models/User';
import {initializeFirebaseAdmin, getFirebaseAdmin} from '../config/firebase';
import {signInWithGoogleToken} from '../services/auth.service';

test('Google login verifies identity, protects existing accounts and registers customers', async () => {
  const {privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  initializeFirebaseAdmin({projectId:'demo-google',clientEmail:'test@demo-google.iam.gserviceaccount.com',
    privateKey:privateKey.export({type:'pkcs8',format:'pem'}).toString()});
  const auth = getFirebaseAdmin().auth();
  const originalVerify = auth.verifyIdToken;
  const originalFind = User.findOne;
  const originalExists = User.exists;
  const originalCreate = User.create;
  let claims: any = {uid:'google-uid', email:'google@example.test',email_verified:true,name:'Google User', firebase:{sign_in_provider:'google.com'}};
  let existing: any = null;
  let emailExists = false;
  let creations = 0;
  (auth as any).verifyIdToken = async (_token: string, checkRevoked: boolean) => {assert.equal(checkRevoked,true);return claims;};
  (User as any).findOne = async () => existing;
  (User as any).exists = async () => emailExists;
  (User as any).create = async (data: any) => {creations++;return data;};
  try {
    const created = await signInWithGoogleToken('token');
    assert.deepEqual(created.roles,['customer']);
    assert.equal(created.firebaseUid,'google-uid');
    existing = {firebaseUid:'google-uid',roles:['owner']};
    assert.equal(await signInWithGoogleToken('token'),existing);
    existing.isBanned=true;
    await assert.rejects(signInWithGoogleToken('token'), /Account unavailable/);
    existing={deletionPendingAt:new Date()};
    await assert.rejects(signInWithGoogleToken('token'), /Account unavailable/);
    existing=null;emailExists=true;
    await assert.rejects(signInWithGoogleToken('token'), /existing method/);
    emailExists=false;claims={...claims, firebase:{sign_in_provider:'password'}};
    await assert.rejects(signInWithGoogleToken('token'), /verified Google/);
    claims={...claims, firebase:{sign_in_provider:'google.com'},email_verified:false};
    await assert.rejects(signInWithGoogleToken('token'), /verified Google/);
    (auth as any).verifyIdToken=async()=>{throw new Error('revoked');};
    await assert.rejects(signInWithGoogleToken('token'), /expired or invalid/);
    assert.equal(creations,1);
  } finally {
    auth.verifyIdToken=originalVerify;User.findOne=originalFind;User.exists=originalExists;User.create=originalCreate;
    await getFirebaseAdmin().app().delete();
  }
});
