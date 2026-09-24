// Unit tests for js/logic.js. Run with: node --test tests
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { build, escapeWifi, contrast, toSvg, MAX_BYTES } = require('../js/logic.js');
const qrcode = require('../vendor/qrcode-generator-2.0.4.js');

const ok = (type, values, ec = 'M') => {
  const r = build(type, values, ec);
  assert.deepEqual(r.errors, [], JSON.stringify(r.errors));
  return r;
};
const errorFor = (type, values, ec = 'M') => {
  const r = build(type, values, ec);
  assert.equal(r.payload, null);
  assert.ok(r.errors.length > 0, 'expected an error');
  return r.errors[0];
};

test('URL: keeps https and http links', () => {
  assert.equal(ok('url', { url: 'https://example.com/path?q=1#top' }).payload, 'https://example.com/path?q=1#top');
  assert.equal(ok('url', { url: 'http://example.com' }).payload, 'http://example.com/');
  assert.equal(ok('url', { url: 'HTTPS://Example.COM/Path' }).payload, 'https://example.com/Path');
});

test('URL: adds https:// when missing', () => {
  assert.equal(ok('url', { url: 'example.com' }).payload, 'https://example.com/');
  assert.equal(ok('url', { url: '  www.example.co.uk/menu  ' }).payload, 'https://www.example.co.uk/menu');
  assert.equal(ok('url', { url: 'example.com:8080/a' }).payload, 'https://example.com:8080/a');
  assert.equal(ok('url', { url: 'localhost:3000' }).payload, 'https://localhost:3000/');
});

test('URL: rejects malformed input with a message', () => {
  assert.equal(errorFor('url', { url: '' }).empty, true);
  for (const bad of ['example', 'exa mple.com', 'ftp://example.com', 'javascript:alert(1)', 'mailto:a@b.com',
    'https:/example.com', 'https://', 'example..com', 'http://exa_mple.com']) {
    const e = errorFor('url', { url: bad });
    assert.equal(e.field, 'url', bad);
    assert.equal(e.empty, false, bad);
    assert.ok(e.message.length > 10, bad);
  }
});

test('Text: passes text through, including Unicode and line breaks', () => {
  const text = 'Hello, world!\nこんにちは 👋 — «ça va?» ;:,"\\';
  assert.equal(ok('text', { text }).payload, text);
  assert.equal(ok('text', { text: 'a\r\nb' }).payload, 'a\nb');
  assert.equal(errorFor('text', { text: '   \n ' }).empty, true);
});

test('Text: refuses content larger than a QR code can hold', () => {
  assert.equal(ok('text', { text: 'a'.repeat(MAX_BYTES.M) }).payload.length, MAX_BYTES.M);
  const e = errorFor('text', { text: 'a'.repeat(MAX_BYTES.M + 1) });
  assert.equal(e.field, 'text');
  assert.match(e.message, /too long/);
  // Multi-byte characters count as UTF-8 bytes: 800 × 3 bytes > 2331.
  assert.equal(errorFor('text', { text: 'あ'.repeat(800) }).field, 'text');
  assert.ok(ok('text', { text: 'あ'.repeat(800) }, 'L').payload);
});

test('Email: builds mailto with optional subject and body', () => {
  assert.equal(ok('email', { email: 'name@example.com' }).payload, 'mailto:name@example.com');
  assert.equal(
    ok('email', { email: ' name@example.com ', subject: 'Hi & bye?', body: 'Line 1\nLine 2 ✓' }).payload,
    'mailto:name@example.com?subject=Hi%20%26%20bye%3F&body=Line%201%0D%0ALine%202%20%E2%9C%93'
  );
  assert.equal(ok('email', { email: 'a+b@example.com', body: 'x' }).payload, 'mailto:a+b@example.com?body=x');
});

test('Email: validates the address', () => {
  assert.equal(errorFor('email', { email: '' }).empty, true);
  for (const bad of ['name', 'name@', '@example.com', 'name@example', 'na me@example.com', 'name@@example.com',
    '.name@example.com', 'na..me@example.com', 'name@example.c', 'name@-example.com']) {
    assert.equal(errorFor('email', { email: bad }).field, 'email', bad);
  }
});

test('Phone: builds tel: and strips formatting', () => {
  assert.equal(ok('phone', { phone: '+1 (555) 123-4567' }).payload, 'tel:+15551234567');
  assert.equal(ok('phone', { phone: '020 7946 0958' }).payload, 'tel:02079460958');
  assert.equal(ok('phone', { phone: '911' }).payload, 'tel:911');
  assert.equal(errorFor('phone', { phone: '' }).empty, true);
  for (const bad of ['12', '1234567890123456', '555-CALL-NOW', '1+555', '555;ext=2']) {
    assert.equal(errorFor('phone', { phone: bad }).field, 'phone', bad);
  }
});

test('Wi-Fi: escapes special characters', () => {
  assert.equal(escapeWifi('a\\b;c,d:e"f'), 'a\\\\b\\;c\\,d\\:e\\"f');
  assert.equal(
    ok('wifi', { ssid: 'My;Net', password: 'p@ss:word,"1"\\', security: 'WPA' }).payload,
    'WIFI:T:WPA;S:My\\;Net;P:p@ss\\:word\\,\\"1\\"\\\\;;'
  );
});

test('Wi-Fi: WPA, WEP, open and hidden networks', () => {
  assert.equal(ok('wifi', { ssid: 'Home', password: 'correcthorse', security: 'WPA' }).payload,
    'WIFI:T:WPA;S:Home;P:correcthorse;;');
  assert.equal(ok('wifi', { ssid: 'Old', password: 'abcde', security: 'WEP' }).payload, 'WIFI:T:WEP;S:Old;P:abcde;;');
  assert.equal(ok('wifi', { ssid: 'Old', password: '0123456789', security: 'WEP' }).payload, 'WIFI:T:WEP;S:Old;P:0123456789;;');
  assert.equal(ok('wifi', { ssid: 'Cafe', security: 'nopass' }).payload, 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(ok('wifi', { ssid: 'Secret', password: 'hunter2hunter2', security: 'WPA', hidden: true }).payload,
    'WIFI:T:WPA;S:Secret;P:hunter2hunter2;H:true;;');
  assert.equal(ok('wifi', { ssid: 'Café ☕', password: 'motdepasse', security: 'WPA' }).payload,
    'WIFI:T:WPA;S:Café ☕;P:motdepasse;;');
});

test('Wi-Fi: catches missing SSID and password/security mismatches', () => {
  assert.equal(errorFor('wifi', { ssid: ' ', password: 'longenough', security: 'WPA' }).field, 'ssid');
  assert.equal(errorFor('wifi', { ssid: 'x'.repeat(33), password: 'longenough', security: 'WPA' }).field, 'ssid');
  const missing = errorFor('wifi', { ssid: 'Home', password: '', security: 'WPA' });
  assert.equal(missing.field, 'password');
  assert.equal(missing.empty, true);
  assert.equal(errorFor('wifi', { ssid: 'Home', password: 'short', security: 'WPA' }).field, 'password');
  assert.equal(errorFor('wifi', { ssid: 'Home', password: 'x'.repeat(64), security: 'WPA' }).field, 'password');
  assert.ok(ok('wifi', { ssid: 'Home', password: 'a'.repeat(64), security: 'WPA' }).payload); // 64 hex = raw key
  assert.equal(errorFor('wifi', { ssid: 'Home', password: 'abcdef', security: 'WEP' }).field, 'password');

  const open = ok('wifi', { ssid: 'Cafe', password: 'leftover', security: 'nopass' });
  assert.equal(open.payload, 'WIFI:T:nopass;S:Cafe;;');
  assert.equal(open.warnings.length, 1);
  assert.equal(ok('wifi', { ssid: ' Spaced ', password: 'longenough', security: 'WPA' }).warnings.length, 1);
});

test('contrast() reports ratio and inversion', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff').ratio), 21);
  assert.equal(contrast('#000000', '#ffffff').inverted, false);
  assert.equal(contrast('#ffffff', '#000000').inverted, true);
  assert.equal(contrast('#777777', '#777777').ratio, 1);
});

test('toSvg() draws exactly the dark modules with the requested margin and colours', () => {
  const qr = qrcode(0, 'M');
  qr.addData('https://example.com/');
  qr.make();
  const n = qr.getModuleCount();
  const svg = toSvg(qr, { margin: 4, fg: '#112233', bg: '#fefefe', size: 512 }, true);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, new RegExp(`viewBox="0 0 ${n + 8} ${n + 8}" width="512" height="512"`));
  assert.match(svg, /fill="#fefefe"/);
  assert.match(svg, /fill="#112233"/);

  // Re-rasterise the path and compare it with the library's module grid.
  const grid = Array.from({ length: n + 8 }, () => new Array(n + 8).fill(false));
  for (const [, x, y, w] of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < +w; i++) grid[+y][+x + i] = true;
  }
  for (let r = 0; r < n + 8; r++) {
    for (let c = 0; c < n + 8; c++) {
      const inside = r >= 4 && c >= 4 && r < n + 4 && c < n + 4;
      assert.equal(grid[r][c], inside && qr.isDark(r - 4, c - 4), `module ${r},${c}`);
    }
  }
});
