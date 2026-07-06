import assert from "node:assert/strict";
import mongoose from "mongoose";
import express from "express";
import router, { categoryOptionsSchema } from "../routes/category-options.routes";
import { errorHandler } from "../middlewares/error.middleware";
import Business from "../models/Business";
import Category from "../models/Category";
import User from "../models/User";
import Service from "../models/Service";
import Product from "../models/Product";
import StaffProfile from "../models/StaffProfile";
import { rankCategoryOptions } from "../services/category-options.service";

async function main() {
  const search = rankCategoryOptions([" Hair  Care ", "hair care", "Body Hair"], ["Hair Care", "Haircuts"], "hair", 2);
  assert.deepEqual(search.options.map(item => item.value), ["Hair Care", "Haircuts"]);
  assert.equal(search.hasMore, true);
  assert.equal(rankCategoryOptions(["Hair Care"], [], "[.*", 30).options.length, 0);
  assert.equal(rankCategoryOptions(["Hair Care"], ["hair care"], "", 30).options.length, 1);
  assert.ok(categoryOptionsSchema.validate({ kind: "service" }).error);
  assert.ok(categoryOptionsSchema.validate({ kind: "service", businessId: "bad" }).error);
  assert.ok(categoryOptionsSchema.validate({ kind: "business", limit: 101 }).error);
  assert.ok(categoryOptionsSchema.validate({ kind: "business", q: "a".repeat(101) }).error);
  assert.ok(categoryOptionsSchema.validate({ kind: "business", businessId: "a".repeat(24) }).error);
  assert.equal(categoryOptionsSchema.validate({ kind: "business" }).value.limit, 30);
  if (process.argv.includes("--unit-only")) {
    console.log("Category search and query validation: PASS");
    return;
  }
  // Never connect to MONGO_URI or touch a real shop. Requires an isolated test runtime.
  const runtime = process.env.ISOLATED_MONGO_MODULE;
  if (!runtime) throw new Error("Set ISOLATED_MONGO_MODULE to mongodb-memory-server's absolute module path");
  const { MongoMemoryServer } = require(runtime);
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "category_options_test" });
  process.env.NODE_ENV = "development";
  const app = express(); app.use(router); app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/category-options`;
  try {
    const owner = await User.create({ firebaseUid: "category-owner", email: "owner@example.test", fullName: "Owner", roles: ["owner"] });
    const outsider = await User.create({ firebaseUid: "category-other", email: "other@example.test", fullName: "Other" });
    const staff = await User.create({ firebaseUid: "category-staff", email: "staff@example.test", fullName: "Staff", roles: ["staff"] });
    const makeBusiness = (name: string) => Business.create({ name, ownerId: owner._id, type: "shop", businessCategoryName: "Barber Shop", location: { type: "Point", coordinates: [38, 9] } });
    const shop = await makeBusiness("First"), otherShop = await makeBusiness("Second");
    await Service.create([
      { businessId: shop._id, name: "Cut", categoryName: "  Custom   Fades ", duration: 30, basePrice: 100 },
      { businessId: shop._id, name: "Inactive", categoryName: "Archived Secret", isActive: false, duration: 30, basePrice: 100 },
      { businessId: otherShop._id, name: "Other", categoryName: "Other Shop Secret", duration: 30, basePrice: 100 },
    ]);
    await Product.create({ businessId: shop._id, name: "Oil", category: "Custom Oils", price: 50 });
    await StaffProfile.create({ businessId: shop._id, staffId: String(staff._id), specialties: ["Braiding"] });
    await Category.create([{ name: "Barber Shop" }, { name: "Disabled", isActive: false }]);
    const get = (query: string, uid = owner.firebaseUid) => fetch(base + "?" + query, { headers: uid ? { "x-dev-user-id": uid } : {} });
    const query = `kind=service&businessId=${shop._id}`;
    assert.equal((await get(query, "")).status, 401);
    assert.equal((await get(query, outsider.firebaseUid)).status, 403);
    assert.equal((await get(query, staff.firebaseUid)).status, 200);
    for (const invalid of ["kind=bad", "kind=service", "kind=product&businessId=bad", "kind=business&limit=101", "kind=business&limit=0", "kind=business&q=" + "a".repeat(101), "kind=business&unexpected=x"]) {
      assert.equal((await get(invalid)).status, 400, invalid);
    }
    const response = await get(query);
    assert.match(response.headers.get("cache-control")!, /no-store/);
    const result = (await response.json() as any).data;
    const labels = result.options.map((item: any) => item.label);
    assert.ok(labels.includes("Custom Fades")); assert.ok(labels.includes("Beard Care"));
    for (const excluded of ["Archived Secret", "Other Shop Secret", "Custom Oils"]) assert.ok(!labels.includes(excluded));
    assert.equal((await (await get(query + "&q=FaD")).json() as any).data.options[0].label, "Custom Fades");
    assert.equal((await (await get(query + "&q=%5B.*")).json() as any).data.options.length, 0);
    const products = (await (await get(`kind=product&businessId=${shop._id}`)).json() as any).data;
    assert.ok(products.options.some((item: any) => item.value === "Custom Oils"));
    assert.ok(!products.options.some((item: any) => item.value === "Custom Fades"));
    const specialties = (await (await get(`kind=specialty&businessId=${shop._id}`)).json() as any).data;
    assert.ok(specialties.options.some((item: any) => item.value === "Braiding"));
    const businesses = (await (await get("kind=business")).json() as any).data;
    assert.equal(businesses.allowCustom, false); assert.deepEqual(businesses.options.map((item: any) => item.value), ["Barber Shop"]);
    assert.ok(!(await (await get("kind=discover")).json() as any).data.options.some((item: any) => item.value === "All"));
    await StaffProfile.updateOne({ staffId: String(staff._id) }, { $set: { isActive: false } });
    assert.equal((await get(query, staff.firebaseUid)).status, 403);
    const ranked = rankCategoryOptions([" Hair  Care ", "hair care", "Body Hair"], ["Hair Care", "Haircuts"], "hair", 2);
    assert.deepEqual(ranked.options.map(item => item.value), ["Hair Care", "Haircuts"]);
    assert.equal(ranked.hasMore, true);
    console.log("Category options integration: PASS (scope, authorization, validation, defaults, matching, and deduplication)");
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await mongoose.disconnect(); await mongo.stop();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
