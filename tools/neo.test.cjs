#!/usr/bin/env node
// Minimal test suite for neo.cjs pure functions
// Run: node tools/neo.test.cjs

const assert = require('assert');
let pass = 0, fail = 0;

function test(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}: ${e.message}`); }
}

// ─── Extract functions (copy-paste to keep neo.cjs untouched) ───

const AUTH_HEADER_PATTERNS = [
  'authorization', 'x-csrf-token', 'x-twitter-auth-type', 'x-twitter-active-user',
  'x-twitter-client-language', 'x-client-transaction-id', 'x-requested-with',
  'github-verified-fetch', 'x-fetch-nonce', 'x-github-client-version',
  'x-api-key', 'api-key',
];

function isAuthHeader(name) {
  const lk = name.toLowerCase();
  return AUTH_HEADER_PATTERNS.includes(lk) || lk.startsWith('x-csrf') || lk.startsWith('x-api') || lk.startsWith('x-twitter');
}

function parseDuration(str) {
  const m = String(str).match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) return parseInt(str) || 0;
  const n = parseInt(m[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unit;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else { flags[key] = true; }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

// ─── Tests ──────────────────────────────────────────────────────

console.log('\nisAuthHeader:');
test('recognizes authorization', () => assert(isAuthHeader('Authorization')));
test('recognizes x-csrf-token', () => assert(isAuthHeader('X-CSRF-Token')));
test('recognizes x-api-key', () => assert(isAuthHeader('x-api-key')));
test('recognizes x-twitter-* prefix', () => assert(isAuthHeader('x-twitter-something')));
test('rejects content-type', () => assert(!isAuthHeader('Content-Type')));
test('rejects accept', () => assert(!isAuthHeader('Accept')));
test('rejects user-agent', () => assert(!isAuthHeader('User-Agent')));
test('rejects cookie', () => assert(!isAuthHeader('Cookie')));

console.log('\nparseDuration:');
test('parses seconds', () => assert.strictEqual(parseDuration('30s'), 30000));
test('parses minutes', () => assert.strictEqual(parseDuration('5m'), 300000));
test('parses hours', () => assert.strictEqual(parseDuration('2h'), 7200000));
test('parses days', () => assert.strictEqual(parseDuration('7d'), 604800000));
test('handles bare number', () => assert.strictEqual(parseDuration('1000'), 1000));
test('handles invalid string', () => assert.strictEqual(parseDuration('abc'), 0));
test('handles 1h', () => assert.strictEqual(parseDuration('1h'), 3600000));

console.log('\nparseArgs:');
test('positional args', () => {
  const r = parseArgs(['capture', 'list', 'github.com']);
  assert.deepStrictEqual(r.positional, ['capture', 'list', 'github.com']);
  assert.deepStrictEqual(r.flags, {});
});
test('flags with values', () => {
  const r = parseArgs(['--limit', '10', '--method', 'POST']);
  assert.strictEqual(r.flags.limit, '10');
  assert.strictEqual(r.flags.method, 'POST');
});
test('boolean flags', () => {
  const r = parseArgs(['--dry-run', '--json']);
  assert.strictEqual(r.flags['dry-run'], true);
  assert.strictEqual(r.flags.json, true);
});
test('mixed positional and flags', () => {
  const r = parseArgs(['capture', 'list', '--limit', '5', 'github.com']);
  assert.deepStrictEqual(r.positional, ['capture', 'list', 'github.com']);
  assert.strictEqual(r.flags.limit, '5');
});

// ─── Interceptor utils (extracted pure functions) ───────────────

const STATIC_RESOURCE_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|webp|ico|svg|woff2?|eot|ttf|otf|map)(?:[?#].*)?$/i;
const ANALYTICS_KEYWORDS = [
  'google-analytics', 'googletagmanager', 'sentry.io', 'mixpanel.com',
  'hdslb.com', 'bilivideo.com', 'api.honeycomb.io',
  'fonts.googleapis.com', 'cdn.jsdelivr.net',
];
const SKIP_PROTOCOLS = new Set(['chrome-extension:', 'moz-extension:', 'data:', 'blob:']);

function shouldSkipUrl(url, headers = {}, baseHref) {
  try {
    const parsed = new URL(url, baseHref || 'http://localhost');
    if (SKIP_PROTOCOLS.has(parsed.protocol)) return true;
    if (STATIC_RESOURCE_EXTENSIONS.test(parsed.pathname.toLowerCase())) return true;
    const combined = `${parsed.href.toLowerCase()} ${parsed.hostname.toLowerCase()} ${JSON.stringify(headers).toLowerCase()}`;
    return ANALYTICS_KEYWORDS.some(k => combined.includes(k));
  } catch { return true; }
}

function getCaptureKey(method, url, baseHref) {
  try { return `${method} ${new URL(url, baseHref || 'http://localhost').pathname}`; }
  catch { return `${method} ${url}`; }
}

function truncateText(value, maxBytes = 102400) {
  if (value.length <= maxBytes) return value;
  return `${value.slice(0, maxBytes)}\n[truncated ${value.length - maxBytes} bytes]`;
}

function parseTextBody(raw, contentType) {
  const lowerType = (contentType || '').toLowerCase();
  const looksJson = lowerType.includes('application/json') ||
    ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']')));
  if (looksJson) { try { return JSON.parse(raw); } catch { return truncateText(raw); } }
  return truncateText(raw);
}

function parseResponseHeaders(raw) {
  const headers = {};
  for (const line of raw.split('\r\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

function deriveDomain(url) {
  try { return new URL(url).hostname; } catch { return 'unknown'; }
}

function getSelector(el) {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return tag + cls;
}

console.log('\nshouldSkipUrl:');
test('skips static resources', () => assert(shouldSkipUrl('https://example.com/app.js')));
test('skips images', () => assert(shouldSkipUrl('https://example.com/logo.png')));
test('skips chrome-extension URLs', () => assert(shouldSkipUrl('chrome-extension://abc/page.html')));
test('skips data URLs', () => assert(shouldSkipUrl('data:text/plain,hello')));
test('skips analytics domains', () => assert(shouldSkipUrl('https://sentry.io/api/report')));
test('skips CDN fonts', () => assert(shouldSkipUrl('https://fonts.googleapis.com/css2?family=Inter')));
test('allows API calls', () => assert(!shouldSkipUrl('https://api.github.com/repos')));
test('allows bilibili API', () => assert(!shouldSkipUrl('https://api.bilibili.com/x/web-interface/popular')));
test('skips bilibili CDN', () => assert(shouldSkipUrl('https://s1.hdslb.com/bfs/static/123.js')));
test('resolves empty URL against base', () => assert(!shouldSkipUrl('', {}, 'https://api.github.com')));

console.log('\ngetCaptureKey:');
test('extracts method + pathname', () => assert.strictEqual(getCaptureKey('GET', 'https://api.github.com/repos?page=2'), 'GET /repos'));
test('handles relative URLs', () => assert.strictEqual(getCaptureKey('POST', '/api/data', 'https://example.com'), 'POST /api/data'));
test('handles relative URLs as paths', () => assert.strictEqual(getCaptureKey('GET', 'not-a-url'), 'GET /not-a-url'));

console.log('\ntruncateText:');
test('returns short strings unchanged', () => assert.strictEqual(truncateText('hello', 100), 'hello'));
test('truncates long strings', () => {
  const result = truncateText('abcdef', 3);
  assert(result.startsWith('abc'));
  assert(result.includes('[truncated'));
});

console.log('\nparseTextBody:');
test('parses JSON objects', () => assert.deepStrictEqual(parseTextBody('{"a":1}'), { a: 1 }));
test('parses JSON arrays', () => assert.deepStrictEqual(parseTextBody('[1,2]'), [1, 2]));
test('returns text for non-JSON', () => assert.strictEqual(parseTextBody('hello world'), 'hello world'));
test('parses with content-type hint', () => assert.deepStrictEqual(parseTextBody('{"a":1}', 'application/json'), { a: 1 }));
test('handles invalid JSON gracefully', () => assert.strictEqual(typeof parseTextBody('{bad json}'), 'string'));

console.log('\nparseResponseHeaders:');
test('parses HTTP headers', () => {
  const h = parseResponseHeaders('Content-Type: application/json\r\nX-Request-Id: abc123');
  assert.strictEqual(h['Content-Type'], 'application/json');
  assert.strictEqual(h['X-Request-Id'], 'abc123');
});
test('handles empty string', () => assert.deepStrictEqual(parseResponseHeaders(''), {}));

console.log('\nderiveDomain:');
test('extracts hostname', () => assert.strictEqual(deriveDomain('https://api.github.com/repos'), 'api.github.com'));
test('returns unknown for invalid', () => assert.strictEqual(deriveDomain('not-a-url'), 'unknown'));

console.log('\ngetSelector:');
test('uses id when present', () => assert.strictEqual(getSelector({ id: 'btn', tagName: 'BUTTON', className: 'primary' }), '#btn'));
test('uses tag + class', () => assert.strictEqual(getSelector({ tagName: 'DIV', className: 'card main' }), 'div.card.main'));
test('uses tag only', () => assert.strictEqual(getSelector({ tagName: 'SPAN' }), 'span'));
test('limits to 2 classes', () => assert.strictEqual(getSelector({ tagName: 'DIV', className: 'a b c d' }), 'div.a.b'));

// ─── HAR conversion helpers ─────────────────────────────────────

console.log('\nHAR export helpers:');

function captureToHarEntry(cap) {
  const reqHeaders = Object.entries(cap.requestHeaders || {}).map(([n, v]) => ({ name: n, value: String(v) }));
  const respHeaders = Object.entries(cap.responseHeaders || {}).map(([n, v]) => ({ name: n, value: String(v) }));
  let queryString = [];
  try {
    const u = new URL(cap.url);
    queryString = [...u.searchParams].map(([n, v]) => ({ name: n, value: v }));
  } catch {}
  return {
    startedDateTime: new Date(cap.timestamp).toISOString(),
    time: cap.duration || 0,
    request: { method: cap.method, url: cap.url, headers: reqHeaders, queryString },
    response: { status: cap.responseStatus || 0, headers: respHeaders },
  };
}

test('converts capture to HAR entry', () => {
  const entry = captureToHarEntry({
    url: 'https://api.example.com/data?page=1',
    method: 'GET',
    timestamp: 1700000000000,
    duration: 250,
    responseStatus: 200,
    requestHeaders: { 'Accept': 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
  });
  assert.strictEqual(entry.request.method, 'GET');
  assert.strictEqual(entry.response.status, 200);
  assert.strictEqual(entry.time, 250);
  assert.strictEqual(entry.request.queryString.length, 1);
  assert.strictEqual(entry.request.queryString[0].name, 'page');
});

test('handles missing headers gracefully', () => {
  const entry = captureToHarEntry({ url: 'https://x.com/api', method: 'POST', timestamp: 0 });
  assert.strictEqual(entry.request.headers.length, 0);
  assert.strictEqual(entry.response.status, 0);
});

// ─── OpenAPI conversion helpers ─────────────────────────────────

console.log('\nOpenAPI helpers:');

function neoToJsonSchema(struct) {
  if (!struct || typeof struct !== 'object') return { type: 'object' };
  if (Array.isArray(struct)) {
    return { type: 'array', items: struct.length ? neoToJsonSchema(struct[0]) : {} };
  }
  const properties = {};
  for (const [k, v] of Object.entries(struct)) {
    if (typeof v === 'string') {
      properties[k] = v === 'null' ? {} : { type: v };
    } else if (typeof v === 'object') {
      properties[k] = neoToJsonSchema(v);
    }
  }
  return { type: 'object', properties };
}

test('converts flat structure', () => {
  const schema = neoToJsonSchema({ id: 'number', name: 'string' });
  assert.strictEqual(schema.type, 'object');
  assert.strictEqual(schema.properties.id.type, 'number');
  assert.strictEqual(schema.properties.name.type, 'string');
});

test('converts nested structure', () => {
  const schema = neoToJsonSchema({ user: { id: 'number', name: 'string' } });
  assert.strictEqual(schema.properties.user.type, 'object');
  assert.strictEqual(schema.properties.user.properties.id.type, 'number');
});

test('converts array structure', () => {
  const schema = neoToJsonSchema([{ id: 'number' }]);
  assert.strictEqual(schema.type, 'array');
  assert.strictEqual(schema.items.properties.id.type, 'number');
});

test('handles null type', () => {
  const schema = neoToJsonSchema({ field: 'null' });
  assert.deepStrictEqual(schema.properties.field, {});
});

test('handles empty/null input', () => {
  assert.strictEqual(neoToJsonSchema(null).type, 'object');
  assert.strictEqual(neoToJsonSchema(undefined).type, 'object');
});

// ─── Mock value generation ──────────────────────────────────────

function mockValue(type, key) {
  if (type === 'number') return key.includes('count') || key.includes('total') ? 42 : 3.14;
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  if (type === 'object') return {};
  if (type === 'null') return null;
  if (key.includes('id')) return 'mock-id-' + Math.random().toString(36).slice(2, 8);
  if (key.includes('url') || key.includes('href')) return 'https://example.com/mock';
  if (key.includes('name')) return 'Mock Name';
  if (key.includes('email')) return 'mock@example.com';
  if (key.includes('date') || key.includes('time') || key.includes('At')) return new Date().toISOString();
  if (key.includes('text') || key.includes('body') || key.includes('content')) return 'Mock content';
  if (key.includes('title')) return 'Mock Title';
  return 'mock-' + key;
}

function buildMockBody(structure) {
  if (!structure || typeof structure !== 'object') return { ok: true };
  const result = {};
  for (const [key, type] of Object.entries(structure)) {
    if (typeof type === 'object' && type !== null) {
      result[key] = buildMockBody(type);
    } else {
      result[key] = mockValue(String(type), key);
    }
  }
  return result;
}

console.log('\n── Mock value generation ──');

test('mockValue returns number for count fields', () => {
  assert.strictEqual(mockValue('number', 'totalCount'), 42);
  assert.strictEqual(mockValue('number', 'price'), 3.14);
});

test('mockValue returns boolean', () => {
  assert.strictEqual(mockValue('boolean', 'active'), true);
});

test('mockValue returns typed strings', () => {
  assert.ok(mockValue('string', 'user_id').startsWith('mock-id-'));
  assert.strictEqual(mockValue('string', 'profile_url'), 'https://example.com/mock');
  assert.strictEqual(mockValue('string', 'display_name'), 'Mock Name');
  assert.strictEqual(mockValue('string', 'email'), 'mock@example.com');
  assert.strictEqual(mockValue('string', 'title'), 'Mock Title');
});

test('mockValue returns null for null type', () => {
  assert.strictEqual(mockValue('null', 'field'), null);
});

test('buildMockBody handles flat structure', () => {
  const body = buildMockBody({ count: 'number', active: 'boolean', name: 'string' });
  assert.strictEqual(body.count, 42);
  assert.strictEqual(body.active, true);
  assert.strictEqual(body.name, 'Mock Name');
});

test('buildMockBody handles nested structure', () => {
  const body = buildMockBody({ user: { name: 'string', id: 'string' } });
  assert.strictEqual(body.user.name, 'Mock Name');
  assert.ok(body.user.id.startsWith('mock-id-'));
});

test('buildMockBody handles null/undefined input', () => {
  assert.deepStrictEqual(buildMockBody(null), { ok: true });
  assert.deepStrictEqual(buildMockBody(undefined), { ok: true });
});

// ─── URL normalization (used in flows/deps) ─────────────────────

function normEndpoint(url, method) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    p = p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid');
    p = p.replace(/\/\d{4,}\b/g, '/:id');
    p = p.replace(/\/[0-9a-f]{24,}/gi, '/:hash');
    return `${method} ${p}`;
  } catch { return `${method} ${url}`; }
}

console.log('\nnormEndpoint:');
test('parameterizes UUIDs', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/users/550e8400-e29b-41d4-a716-446655440000/posts', 'GET'),
    'GET /users/:uuid/posts'
  );
});
test('parameterizes numeric IDs (4+ digits)', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/posts/12345', 'GET'),
    'GET /posts/:id'
  );
});
test('leaves short numbers alone', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/v2/posts', 'GET'),
    'GET /v2/posts'
  );
});
test('parameterizes hex hashes (24+ chars)', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/objects/507f1f77bcf86cd799439011', 'GET'),
    'GET /objects/:hash'
  );
});
test('handles multiple parameterizations', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/users/12345/posts/67890', 'POST'),
    'POST /users/:id/posts/:id'
  );
});
test('handles malformed URL gracefully', () => {
  assert.strictEqual(normEndpoint('not-a-url', 'GET'), 'GET not-a-url');
});

// ─── Edge cases ─────────────────────────────────────────────────

console.log('\nedge cases:');
test('shouldSkipUrl handles relative path', () => {
  // Relative URLs resolve against baseHref, so they're valid
  assert(!shouldSkipUrl('/api/data', {}, 'http://example.com'));
});
test('parseDuration handles zero', () => {
  assert.strictEqual(parseDuration('0s'), 0);
});
test('parseArgs handles empty array', () => {
  const r = parseArgs([]);
  assert.deepStrictEqual(r.positional, []);
  assert.deepStrictEqual(r.flags, {});
});
test('getCaptureKey normalizes method+url', () => {
  const k1 = getCaptureKey('GET', '/api/test', 'http://example.com');
  const k2 = getCaptureKey('POST', '/api/test', 'http://example.com');
  assert.notStrictEqual(k1, k2);
});
test('getSelector returns tag for plain elements', () => {
  const el = { tagName: 'BUTTON', id: '', className: '' };
  assert.strictEqual(getSelector(el), 'button');
});
test('getSelector returns #id when present', () => {
  const el = { tagName: 'DIV', id: 'main', className: '' };
  assert.strictEqual(getSelector(el), '#main');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
