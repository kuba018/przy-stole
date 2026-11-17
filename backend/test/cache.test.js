const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openDatabase } = require("../src/db");
const { createApp } = require("../src/app");

test("Cache: rewalidacja menu i unieważnienie po zapisie z innego połączenia", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "restaurant-cache-"));
  const filename = path.join(directory, "test.sqlite");
  const db = openDatabase(filename);
  const writer = openDatabase(filename);
  const server = createApp(db).listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    writer.close();
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await fetch(`${base}/api/menu`);
  const etag = first.headers.get("etag");
  assert.ok(etag);
  assert.equal(first.headers.get("cache-control"), "public, no-cache");
  const original = await first.json();
  const same = await fetch(`${base}/api/menu`, { headers: { "If-None-Match": etag, "Cache-Control": "max-age=0" } });
  assert.equal(same.status, 304);
  writer.prepare("UPDATE dishes SET price_grosz = price_grosz + 100 WHERE id = 1").run();
  const changed = await fetch(`${base}/api/menu`, { headers: { "If-None-Match": etag, "Cache-Control": "max-age=0" } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get("etag"), etag);
  const updated = await changed.json();
  assert.equal(updated.categories[0].dishes[0].price_grosz, original.categories[0].dishes[0].price_grosz + 100);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.headers.get("cache-control"), "no-store");
  const reservation = await fetch(`${base}/api/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(reservation.status, 400);
  assert.equal(reservation.headers.get("cache-control"), "no-store");
});

const dist = path.resolve(__dirname, "../../frontend/dist");
test("Cache: wersjonowane zasoby i rewalidacja HTML", {
  skip: !fs.existsSync(path.join(dist, "index.html")),
}, async (t) => {
  const db = openDatabase(":memory:");
  const server = createApp(db).listen(0, "127.0.0.1");
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/", "/index.html", "/favicon.svg"]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
  }
  const assets = fs.readdirSync(path.join(dist, "assets"));
  assert.equal(assets.filter(name => name.endsWith(".jpg")).length, 14);
  for (const name of assets) {
    const response = await fetch(`${base}/assets/${name}`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(response.headers.get("content-encoding"), null);
  }
  const missing = await fetch(`${base}/assets/missing.jpg`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("cache-control"), null);
});
