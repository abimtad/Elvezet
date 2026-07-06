import assert from "node:assert/strict";
import { mock, test } from "node:test";
import mongoose from "mongoose";
import { connectDatabase } from "../config/database";

test("database failures never log connection credentials or raw driver errors", async () => {
  const previousUri = process.env.MONGO_URI;
  const originalListeners = new Set(mongoose.connection.listeners("error"));
  const secretUri = "mongodb://private-user:private-password@example.invalid/test";
  process.env.MONGO_URI = secretUri;
  const output: unknown[][] = [];
  mock.method(console, "error", (...args: unknown[]) => output.push(args));
  mock.method(console, "log", (...args: unknown[]) => output.push(args));
  mock.method(mongoose, "connect", async () => { throw new Error(secretUri); });
  mock.method(process, "exit", () => { throw new Error("expected-exit"); });
  try {
    await assert.rejects(connectDatabase(), /expected-exit/);
    mongoose.connection.emit("error", new Error(secretUri));
    assert.equal(output.length, 2);
    const logged = JSON.stringify(output);
    for (const secret of [secretUri, "private-user", "private-password"]) {
      assert.equal(logged.includes(secret), false);
    }
    assert.match(logged, /Database connection failed/);
    assert.match(logged, /MongoDB connection error/);
  } finally {
    mock.restoreAll();
    for (const listener of mongoose.connection.listeners("error")) {
      if (!originalListeners.has(listener)) mongoose.connection.removeListener("error", listener);
    }
    if (previousUri === undefined) delete process.env.MONGO_URI;
    else process.env.MONGO_URI = previousUri;
  }
});
