import assert from 'node:assert/strict';
import { replaceStaffAvatar } from '../services/staff-avatar.service';

async function main() {
  const events: string[] = [];
  const remove = async (path: string) => { events.push(`delete:${path}`); };
  const write = async () => { events.push('write'); return '/uploads/avatars/new.webp'; };
  await replaceStaffAvatar(write, async () => { events.push('commit'); return '/uploads/avatars/old.webp'; }, remove);
  assert.deepEqual(events, ['write', 'commit', 'delete:/uploads/avatars/old.webp']);
  events.length = 0;
  await assert.rejects(replaceStaffAvatar(write, async () => { throw new Error('database failed'); }, remove), /database failed/);
  assert.deepEqual(events, ['write', 'delete:/uploads/avatars/new.webp']);
  events.length = 0;
  await assert.rejects(replaceStaffAvatar(async () => { throw new Error('bad image'); }, async () => { events.push('commit'); return ''; }, remove), /bad image/);
  assert.deepEqual(events, []);
  assert.equal(await replaceStaffAvatar(write, async () => '/uploads/avatars/old.webp', async () => { throw new Error('cleanup failed'); }), '/uploads/avatars/new.webp');
  events.length = 0;
  await replaceStaffAvatar(write, async () => 'https://external.test/photo.jpg', remove);
  assert.deepEqual(events, ['write']);
  console.log('PASS: avatar commit order, failed writes, failed commits, cleanup failures, external image preservation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
