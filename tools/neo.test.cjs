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

// ─── Summary ────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
