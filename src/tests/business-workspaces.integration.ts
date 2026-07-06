import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import env from "../config/env";
import app from "../app";
import User from "../models/User";
import Business from "../models/Business";
import StaffProfile from "../models/StaffProfile";

async function main() {
  process.env.NODE_ENV = "development";
  await mongoose.connect(env.MONGO_URI, { dbName: `workspaces_test_${randomUUID().replaceAll("-", "").slice(0, 16)}` });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
  try {
    const worker = await User.create({ firebaseUid: "workspace-worker", fullName: "Worker", email: "worker@example.test" });
    const other = await User.create({ firebaseUid: "workspace-other", fullName: "Other", email: "other@example.test" });
    const make = (name: string, type: "shop" | "independent", ownerId: mongoose.Types.ObjectId) => Business.create({ name, type, ownerId, location: { type: "Point", coordinates: [38, 9] }, homeLocation: { type: "Point", coordinates: [38, 9] } });
    const [owned, solo, shopA, shopB, foreign] = await Promise.all([
      make("Owned shop", "shop", worker._id), make("Solo", "independent", worker._id),
      make("Shop A", "shop", other._id), make("Shop B", "shop", other._id), make("Foreign", "shop", other._id),
    ]);
    const [a] = await StaffProfile.create([
      { businessId: shopA._id, staffId: worker.firebaseUid },
      { businessId: shopB._id, staffId: String(worker._id) },
      { businessId: foreign._id, staffId: worker.firebaseUid, isActive: false },
    ]);
    const request = (path: string, businessId?: string) => fetch(base + path, {
      headers: { "x-dev-user-id": worker.firebaseUid, ...(businessId ? { "x-business-id": businessId } : {}) },
    });
    assert.equal((await fetch(base + "/auth/workspaces")).status, 401);
    const listing = await (await request("/auth/workspaces")).json();
    assert.deepEqual(listing.data.workspaces.map((w: any) => w.id).sort(), [
      `owner:${owned._id}`, `independent:${solo._id}`, `staff:${shopA._id}`, `staff:${shopB._id}`,
    ].sort());
    assert.equal((await request("/barber/me")).status, 409, "Multiple staff memberships require selection");
    for (const shop of [shopA, shopB]) {
      const response = await request("/barber/me", String(shop._id));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.business._id, String(shop._id));
    }
    assert.equal((await request("/barber/me", String(foreign._id))).status, 409);
    assert.equal((await request("/independent/me", String(owned._id))).status, 404);
    assert.equal((await request("/independent/me", String(solo._id))).status, 200);
    await StaffProfile.updateOne({ _id: a._id }, { isActive: false });
    assert.equal((await request("/barber/me", String(shopA._id))).status, 409, "Revoked staff membership cannot reopen workspace");
    console.log("Workspace membership and isolation checks passed");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    try { await mongoose.connection.dropDatabase(); } finally { await mongoose.disconnect(); }
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
