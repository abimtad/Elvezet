import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import app from "../app";
import env from "../config/env";
import User from "../models/User";

async function main() {
  process.env.NODE_ENV = "development";
  const database = `admin_auth_gate_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  await mongoose.connect(env.MONGO_URI, { dbName: database });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };

  const request = async (
    path: string,
    options?: { user?: string; method?: string; token?: string },
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options?.user) headers["x-dev-user-id"] = options.user;
    if (options?.token) headers.Authorization = `Bearer ${options.token}`;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1${path}`,
      { method: options?.method || "GET", headers },
    );
    return response.status;
  };

  try {
    await User.init();

    const owner = await User.create({
      firebaseUid: `owner-${randomUUID()}`,
      fullName: "Owner User",
      email: `owner-${randomUUID()}@example.com`,
      roles: ["owner"],
    });
    const moderator = await User.create({
      firebaseUid: `mod-${randomUUID()}`,
      fullName: "Mod User",
      email: `mod-${randomUUID()}@example.com`,
      roles: ["moderator"],
    });
    const admin = await User.create({
      firebaseUid: `admin-${randomUUID()}`,
      fullName: "Admin User",
      email: `admin-${randomUUID()}@example.com`,
      roles: ["admin"],
    });

    assert.equal(
      await request("/admin/global-stats"),
      401,
      "signed-out visitor cannot read admin analytics",
    );
    assert.equal(
      await request("/admin/global-stats", { token: "__dev_owner__" }),
      401,
      "forged dev token without identity is rejected",
    );
    assert.equal(
      await request("/admin/global-stats", { user: String(owner._id) }),
      403,
      "owner cannot access admin analytics",
    );
    assert.equal(
      await request("/admin/global-stats", { user: String(moderator._id) }),
      200,
      "moderator can read global stats",
    );
    assert.equal(
      await request("/admin/global-stats", { user: String(admin._id) }),
      200,
      "admin can read global stats",
    );
    assert.equal(
      await request("/admin/users/" + String(owner._id) + "/ban", {
        user: String(moderator._id),
        method: "PATCH",
      }),
      403,
      "moderator cannot ban users",
    );
    assert.equal(
      await request("/admin/tenants", { user: String(admin._id) }),
      200,
      "admin can list businesses",
    );

    // Role removal must revoke privileged access on subsequent requests.
    await User.findByIdAndUpdate(admin._id, { roles: ["customer"] });
    assert.equal(
      await request("/admin/global-stats", { user: String(admin._id) }),
      403,
      "removed admin role blocks further privileged operations",
    );

    console.log("admin-auth-gate.integration: ok");
  } finally {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
