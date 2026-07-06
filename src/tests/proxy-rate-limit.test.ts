import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import rateLimit from "express-rate-limit";
import { configureProxy } from "../config/proxy";

async function main() {
  const app = express();
  configureProxy(app, "true");
  app.use(rateLimit({ windowMs: 60000, limit: 2, standardHeaders: true, legacyHeaders: false }));
  app.get("/", (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/`;
    const request = (ip: string) => fetch(url, { headers: { "X-Forwarded-For": ip } });
    assert.equal((await request("203.0.113.10")).status, 200);
    assert.equal((await request("203.0.113.10")).status, 200);
    assert.equal((await request("203.0.113.10")).status, 429);
    assert.equal((await request("198.51.100.20")).status, 200, "A different client must not inherit another client's limit");
    assert.equal((await request("192.0.2.99, 203.0.113.10")).status, 429, "Forging a prefix must not bypass the nearest ingress client limit");
    const local = express();
    configureProxy(local, undefined);
    assert.equal(local.get("trust proxy"), false);
    console.log("Proxy/rate-limit tests passed: client isolation, spoofed prefix, local default");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
