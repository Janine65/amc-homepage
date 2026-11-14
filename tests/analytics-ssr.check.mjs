import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

test('SSR persists session cookies, forwards sanitized data and validates activity', { timeout: 20000 }, async () => {
  const key = 'test-only-shared-key-not-for-production';
  const calls = [];
  const pages = new Map();
  let expiredId;
  const backend = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    let data = request.url === '/public/besucher' ? 40 : [];
    if (request.url?.startsWith('/besucher/')) {
      assert.equal(request.headers['x-analytics-key'], key);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      calls.push({ path: request.url, body });
      if (request.url === '/besucher/aufruf') {
        if (body.session_id === expiredId) response.statusCode = 409;
        else pages.set(body.page_id, body.session_id);
      } else if (pages.get(body.page_id) !== body.session_id) {
        response.statusCode = 410;
      }
      data = null;
    }
    response.end(JSON.stringify({ data, message: 'test', type: 'success' }));
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const homepage = spawn(process.execPath, ['dist/server/entry.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env, HOST: '127.0.0.1', PORT: String(port),
      API_URL: `http://127.0.0.1:${backend.address().port}`, ANALYTICS_SECRET: key,
      ANALYTICS_PUBLIC_ORIGIN: 'https://homepage.example', ANALYTICS_TRUST_PROXY: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  homepage.stdout.on('data', (chunk) => { output += chunk; });
  homepage.stderr.on('data', (chunk) => { output += chunk; });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await fetch(`${origin}/api/besucher`);
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    assert.ok(ready, output);
    const headers = { 'User-Agent': 'Mozilla/5.0 Firefox/120', referer: 'https://bing.com/search?q=private' };
    const page = await fetch(`${origin}/news?email=private`, { headers });
    assert.equal(page.status, 200);
    const html = await page.text();
    const pageId = html.match(/name="amc-analytics-page" content="([^"]+)"/)?.[1];
    assert.ok(pageId);
    assert.equal(html.includes(key), false);
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    const cookies = page.headers.getSetCookie();
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('amc_statistik='));
    assert.ok(sessionCookie, output);
    assert.match(sessionCookie, /HttpOnly/i);
    assert.match(sessionCookie, /Secure/i);
    assert.match(sessionCookie, /Max-Age=1800/i);
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    const first = calls.find((call) => call.path === '/besucher/aufruf').body;
    assert.equal(first.path, '/news');
    assert.equal(first.referrer, 'https://bing.com');
    assert.equal(first.client_ip, '127.0.0.1');
    assert.equal(first.page_id, pageId);
    const activityHeaders = { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://homepage.example' };
    const activity = await fetch(`${origin}/api/besucher`, {
      method: 'POST', headers: activityHeaders, body: JSON.stringify({ page_id: pageId }),
    });
    assert.equal(activity.status, 204);
    assert.ok(activity.headers.getSetCookie().some((value) => value.startsWith('amc_statistik=')));
    const rejected = await fetch(`${origin}/api/besucher`, {
      method: 'POST', headers: { ...activityHeaders, Origin: 'https://evil.example' },
      body: JSON.stringify({ page_id: pageId }),
    });
    assert.equal(rejected.status, 403);
    const activityCount = calls.length;
    for (const [body, expected] of [
      ['{', 400], [JSON.stringify({ page_id: 'invalid' }), 422], ['x'.repeat(201), 413],
    ]) {
      const invalid = await fetch(`${origin}/api/besucher`, {
        method: 'POST', headers: activityHeaders, body,
      });
      assert.equal(invalid.status, expected);
    }
    assert.equal(calls.length, activityCount);
    await fetch(`${origin}/agenda`, { headers: { ...headers, Cookie: cookie, referer: 'https://homepage.example/news' } });
    const followup = calls.filter((call) => call.path === '/besucher/aufruf').at(-1).body;
    assert.equal(followup.session_id, first.session_id);
    assert.notEqual(followup.page_id, pageId);
    assert.equal(followup.referrer, null);
    expiredId = first.session_id;
    await fetch(`${origin}/news`, { headers: { ...headers, Cookie: cookie } });
    assert.notEqual(calls.filter((call) => call.path === '/besucher/aufruf').at(-1).body.session_id, first.session_id);
    const count = calls.length;
    for (const extraHeaders of [{ dnt: '1' }, { 'sec-gpc': '1' }, { 'User-Agent': 'Googlebot' }]) {
      const excluded = await fetch(`${origin}/news`, { headers: { ...headers, ...extraHeaders } });
      assert.ok(!excluded.headers.getSetCookie().some((value) => value.startsWith('amc_statistik=')));
    }
    const notFound = await fetch(`${origin}/missing`, { headers });
    assert.equal(notFound.status, 404);
    assert.equal(calls.length, count);
  } finally {
    if (homepage.exitCode === null && homepage.signalCode === null) {
      const closed = once(homepage, 'close');
      homepage.kill('SIGTERM');
      await closed;
    }
    await new Promise((resolve) => backend.close(resolve));
  }
});
