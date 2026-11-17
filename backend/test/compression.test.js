const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { brotliDecompressSync, gunzipSync } = require('node:zlib');
const { createApp } = require('../src/app');
const { openDatabase } = require('../src/db');
const dist = path.resolve(__dirname, '../../frontend/dist');

test('Compression: negotiated static and API responses preserve content', {
  skip: !fs.existsSync(path.join(dist, 'index.html.br')),
}, async t => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
  await once(server, 'listening');
  const request = (route, encoding) => new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: server.address().port, path: route,
      headers: { 'Accept-Encoding': encoding } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    }).on('error', reject);
  });
  const assets = fs.readdirSync(path.join(dist, 'assets')).filter(name => /\.(js|css)$/.test(name));
  for (const route of ['/', ...assets.map(name => `/assets/${name}`), '/api/menu']) {
    const original = await request(route, 'identity');
    assert.equal(original.status, 200);
    assert.equal(original.headers['content-encoding'], undefined);
    for (const [encoding, decode] of [['br', brotliDecompressSync], ['gzip', gunzipSync]]) {
      const compressed = await request(route, encoding);
      assert.equal(compressed.status, 200);
      assert.equal(compressed.headers['content-encoding'], encoding);
      assert.match(compressed.headers.vary, /Accept-Encoding/i);
      assert.deepEqual(decode(compressed.body), original.body);
      assert.ok(compressed.body.length < original.body.length);
    }
    const fallback = await request(route, 'br;q=0, gzip;q=1');
    assert.equal(fallback.headers['content-encoding'], 'gzip');
  }
  const photo = await request('/images/menu/ortolana.jpg', 'br, gzip');
  assert.equal(photo.status, 200);
  assert.equal(photo.headers['content-encoding'], undefined);
  assert.equal(photo.headers['cache-control'], 'public, max-age=0');
});
