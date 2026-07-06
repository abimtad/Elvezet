import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import sharp from "sharp";
import router, { validatePoster } from "../routes/business-poster.routes";
import User from "../models/User";
import BusinessPoster from "../models/BusinessPoster";
import { deleteLocalFile } from "../services/media.service";
import { errorHandler } from "../middlewares/error.middleware";
import { businessPosterPolicy as policy, posterShapeAllowed } from "../utils/business-poster-policy";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const fields = { title: "Test poster", placement: "both", audience: "both", isActive: true, sortOrder: 0 };
  // Exactly +/-25% is accepted; a single pixel beyond either boundary is not.
  assert.equal(posterShapeAllowed(policy.referenceWidth * 3, policy.referenceHeight * 4), true);
  assert.equal(posterShapeAllowed(policy.referenceWidth * 3 - 1, policy.referenceHeight * 4), false);
  assert.equal(posterShapeAllowed(policy.referenceWidth * 5, policy.referenceHeight * 4), true);
  assert.equal(posterShapeAllowed(policy.referenceWidth * 5 + 1, policy.referenceHeight * 4), false);
  assert.equal(posterShapeAllowed(1774, 637), true);
  assert.equal(posterShapeAllowed(3548, 1274), true); // Resolution does not change shape.
  assert.equal(posterShapeAllowed(0, 637), false);
  process.env.MEDIA_STORAGE = "local";
  for (const override of [{ title: "" }, { placement: "bad" }, { sortOrder: -1 }, { linkUrl: "javascript:alert(1)" }, { linkUrl: "https://user:pass@example.com" }, { startAt: "2026-10-25", endAt: "2026-10-24" }, { unknown: 1 }]) {
    assert.throws(() => validatePoster({ ...fields, ...override }));
  }
  assert.equal(validatePoster({ ...fields, startAt: "", endAt: "", isActive: "false" }).isActive, false);
  const runtime = process.env.ISOLATED_MONGO_MODULE;
  if (!runtime) throw new Error("Provide an isolated mongodb-memory-server module. Real databases are never used.");
  const { MongoMemoryServer } = require(runtime);
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "business_posters_test" });
  process.env.NODE_ENV = "development";
  process.env.APP_URL = "https://posters.example.test";
  const app = express(); app.use(router); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const image = await sharp({ create: { width: 160, height: 70, channels: 3, background: "red" } }).png().toBuffer();
  const request = (path: string, uid = "admin", method = "GET", body?: FormData) => fetch(base + path, { method, body, headers: uid ? { "x-dev-user-id": uid } : {} });
  function form(values = fields, file: Buffer | null = image) { const body = new FormData(); Object.entries(values).forEach(([k, v]) => body.set(k, String(v))); if (file) body.set("image", new Blob([new Uint8Array(file)], { type: "image/png" }), "poster.png"); return body; }
  try {
    for (const role of ["admin", "owner", "staff", "moderator", "customer"]) await User.create({ firebaseUid: role, email: `${role}@example.test`, fullName: role, roles: [role] });
    assert.equal((await request("/business-posters?placement=home", "")).status, 401);
    for (const role of ["staff", "owner", "moderator", "customer"]) {
      for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
        assert.equal((await request(`/admin/business-posters${["PATCH", "DELETE"].includes(method) ? "/123" : ""}`, role, method, method === "POST" ? form() : undefined)).status, 403);
      }
    }
    assert.equal((await request("/business-posters?placement=bad", "staff")).status, 400);
    assert.equal((await request("/admin/business-posters", "admin", "POST", form(fields, null))).status, 400);
    assert.equal((await request("/admin/business-posters", "admin", "POST", form(fields, Buffer.from("not an image")))).status, 400);
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    assert.equal((await request("/admin/business-posters", "admin", "POST", form(fields, oversized))).status, 400);
    for (const width of [180, 400]) {
      const invalid = await sharp({ create: { width, height: 100, channels: 3, background: "blue" } }).png().toBuffer();
      const rejected = await request("/admin/business-posters", "admin", "POST", form(fields, invalid));
      assert.equal(rejected.status, 400);
      assert.match((await rejected.json() as any).message, /25%/);
    }
    assert.equal(await BusinessPoster.countDocuments(), 0); // Rejection never creates records.
    const created = await request("/admin/business-posters", "admin", "POST", form()); assert.equal(created.status, 201);
    const poster = (await created.json() as any).data;
    assert.match(poster.imageUrl, /^https:\/\/posters.example.test\/uploads\/business-posters\/.*\.webp$/);
    const originalPath = (await BusinessPoster.findById(poster._id))!.imagePath;
    const narrow = await sharp({ create: { width: 100, height: 100, channels: 3, background: "blue" } }).png().toBuffer();
    const failedReplacement = await request(`/admin/business-posters/${poster._id}`, "admin", "PATCH", form(fields, narrow));
    assert.equal(failedReplacement.status, 400);
    assert.equal((await BusinessPoster.findById(poster._id))!.imagePath, originalPath);
    // EXIF-rotated photos are validated and saved in the displayed orientation.
    const rotated = await sharp({ create: { width: 100, height: 280, channels: 3, background: "green" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const rotatedResponse = await request(`/admin/business-posters/${poster._id}`, "admin", "PATCH", form(fields, rotated));
    assert.equal(rotatedResponse.status, 200);
    const rotatedPath = (await BusinessPoster.findById(poster._id))!.imagePath;
    const stored = await sharp(await fs.readFile(path.join(__dirname, "../../uploads", rotatedPath.replace(/^\/uploads\//, "")))).metadata();
    assert.equal(stored.width, 280); assert.equal(stored.height, 100);
    const now = Date.now();
    await BusinessPoster.create([
      { ...fields, title: "Clients", placement: "clients", sortOrder: 1, imagePath: "/uploads/test.webp" },
      { ...fields, title: "First", placement: "home", sortOrder: 0, imagePath: "/uploads/test.webp" },
      { ...fields, title: "Disabled", isActive: false, imagePath: "/uploads/test.webp" },
      { ...fields, title: "Expired", endAt: new Date(now - 1000), imagePath: "/uploads/test.webp" },
      { ...fields, title: "Future", startAt: new Date(now + 60_000), imagePath: "/uploads/test.webp" },
      { ...fields, title: "Indy only", audience: "independent", placement: "home", sortOrder: 2, imagePath: "/uploads/test.webp" },
      { ...fields, title: "Staff only", audience: "staff", placement: "home", sortOrder: 3, imagePath: "/uploads/test.webp" },
    ]);
    const feed = (await (await request("/business-posters?placement=home&audience=staff", "staff")).json() as any).data;
    assert.equal(feed.posters.length, 3); assert.ok(feed.serverTime);
    assert.ok(feed.posters.every((p: any) => p.title !== "Indy only"));
    const indy = (await (await request("/business-posters?placement=home&audience=independent", "owner")).json() as any).data;
    assert.ok(indy.posters.some((p: any) => p.title === "Indy only"));
    assert.ok(!indy.posters.some((p: any) => p.title === "Staff only"));
    assert.deepEqual((await (await request("/business-posters?placement=clients&audience=staff", "staff")).json() as any).data.posters.map((p: any) => p.title), ["Test poster", "Clients"]);
    const update = form({ ...fields, isActive: false }, null);
    assert.equal((await request(`/admin/business-posters/${poster._id}`, "admin", "PATCH", update)).status, 200);
    // Original disabled; First (both) + Staff only remain. Indy-only is excluded.
    assert.equal((await (await request("/business-posters?placement=home", "staff")).json() as any).data.posters.length, 2);
    assert.equal((await request(`/admin/business-posters/${poster._id}`, "admin", "DELETE")).status, 200);
    assert.equal((await request(`/admin/business-posters/${poster._id}`, "admin", "DELETE")).status, 404);
    assert.equal((await request("/admin/business-posters/bad", "admin", "DELETE")).status, 400);
    console.log("Business posters integration PASS: upload, validation, permissions, scheduling, placement, ordering, disable and delete");
  } finally {
    for (const p of await BusinessPoster.find()) if (p.imagePath.startsWith("/uploads/business-posters/")) await deleteLocalFile(p.imagePath);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
