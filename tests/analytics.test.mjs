import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.API_URL = 'http://127.0.0.1:3001';
const analytics = await import('../src/lib/analytics.ts');
const key = 'test-only-key-not-for-production-123456';

test('signed session rejects changed IDs, signatures and malformed cookies', () => {
  const id = analytics.randomUUID();
  const cookie = analytics.signSession(id, key);
  assert.equal(analytics.readSession(cookie, key), id);
  assert.equal(analytics.readSession(cookie.replace(id, analytics.randomUUID()), key), null);
  assert.equal(analytics.readSession(cookie, 'different-key'), null);
  assert.equal(analytics.readSession(cookie + '.extra', key), null);
  assert.equal(analytics.readSession(undefined, key), null);
});

test('only normalized homepage paths are eligible, without event IDs or query data', () => {
  assert.equal(analytics.analyticsPath('/anmeldung/123/'), '/anmeldung/:id');
  assert.equal(analytics.analyticsPath('/news/'), '/news');
  assert.equal(analytics.analyticsPath('/'), '/');
  assert.equal(analytics.analyticsPath('/kontakt?email=private'), null);
  assert.equal(analytics.analyticsPath('/api/besucher'), null);
  assert.equal(analytics.analyticsPath('/nonexistent'), null);
});

test('external referrers omit credentials, queries and private paths', () => {
  const request = (referrer) => new Request('http://example.org/news', { headers: { referer: referrer } });
  assert.equal(analytics.externalReferrer(request('https://bing.com/private?q=secret')), 'https://bing.com');
  assert.equal(analytics.externalReferrer(request('https://user:password@other.example/private')), 'https://other.example');
  assert.equal(analytics.externalReferrer(request('https://example.org/agenda')), null);
  assert.equal(analytics.externalReferrer(request('not a URL')), null);
});

test('DNT and GPC opt out of detailed collection', () => {
  assert.equal(analytics.excluded(new Request('http://example.org', { headers: { dnt: '1' } })), true);
  assert.equal(analytics.excluded(new Request('http://example.org', { headers: { 'sec-gpc': '1' } })), true);
  assert.equal(analytics.excluded(new Request('http://example.org')), false);
});

test('forwarded client IPs are ignored unless proxy trust is explicitly enabled', () => {
  const previous = process.env.ANALYTICS_TRUST_PROXY;
  const request = new Request('http://example.org', { headers: { 'x-forwarded-for': '8.8.8.8, 10.0.0.1' } });
  try {
    delete process.env.ANALYTICS_TRUST_PROXY;
    assert.equal(analytics.clientIp(request, '192.168.1.1'), '192.168.1.1');
    process.env.ANALYTICS_TRUST_PROXY = 'true';
    assert.equal(analytics.clientIp(request, '192.168.1.1'), '8.8.8.8');
  } finally {
    if (previous === undefined) delete process.env.ANALYTICS_TRUST_PROXY;
    else process.env.ANALYTICS_TRUST_PROXY = previous;
  }
});
