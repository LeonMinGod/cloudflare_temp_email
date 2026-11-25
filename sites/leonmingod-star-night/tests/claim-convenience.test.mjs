import test from 'node:test';
import assert from 'node:assert/strict';
import { verificationEmail } from '../src/claim-email.js';
import { EMAIL_KEY, SAVED_KEY, normalizeCode, readEmailLink, readRememberedEmail, readSavedKey, rememberEmail } from '../public/free-token/verify-flow-v3.mjs';

test('OTP paste accepts complete messages, leading zeroes and full-width digits', () => {
  assert.equal(normalizeCode('012345'), '012345');
  assert.equal(normalizeCode('０１２３４５'), '012345');
  assert.equal(normalizeCode('LeonMinGod 邮箱验证码：012345\n10 分钟内有效'), '012345');
  assert.equal(normalizeCode(' 012 345 '), '012345');
  assert.equal(normalizeCode('没有数字'), '');
  assert.equal(normalizeCode('123'), '123');
});

test('email links retain the address and OTP only in a fragment and reject malformed codes', () => {
  const email = verificationEmail('ada+test@example.com', '012345', 'https://www.leonmingod.com');
  const link = new URL(email.text.match(/https:\/\/[^\s]+/)[0]);
  assert.equal(link.origin, 'https://www.leonmingod.com');
  assert.equal(link.pathname, '/free-token/verify/');
  assert.equal(link.search, '');
  assert.deepEqual(readEmailLink(link.hash), { email: 'ada+test@example.com', code: '012345' });
  assert.equal(readEmailLink('#code=1234567&email=ada%40example.com'), null);
  assert.equal(readEmailLink('#code=123456'), null);
  assert.equal(readEmailLink('#code=123456&email=bad'), null);
  assert.doesNotMatch(email.html, /<script|onclick=|navigator\.clipboard|<button/);
  assert.match(email.html, /填入验证码/);
  assert.match(verificationEmail('ada@example.com', '012345', 'https://untrusted.example').text, /https:\/\/leonmingod\.com/);
});

test('remembered email is independent from verified key storage, migrates old records and survives unavailable storage', () => {
  const rows = new Map();
  globalThis.localStorage = { getItem: k => rows.get(k) ?? null, setItem: (k,v) => rows.set(k,v) };
  try {
    rows.set(SAVED_KEY, JSON.stringify({ email: 'Old@Example.com', key: 'sk-lm-local-placeholder' }));
    assert.equal(readRememberedEmail(), 'old@example.com');
    rememberEmail('  Ada@Example.com ');
    assert.equal(rows.get(EMAIL_KEY), 'ada@example.com');
    assert.equal(readRememberedEmail(), 'ada@example.com');
    assert.equal(readSavedKey().key, 'sk-lm-local-placeholder');
    rememberEmail('invalid');
    assert.equal(readRememberedEmail(), 'ada@example.com');
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => rememberEmail('ada@example.com'));
    assert.equal(readRememberedEmail(), '');
  } finally { delete globalThis.localStorage; }
});
