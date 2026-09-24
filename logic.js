/*
 * QR payload building, validation and colour/SVG helpers.
 * Pure functions with no DOM access, so they can be unit-tested in Node
 * (see tests/logic.test.js). Exposed as window.QRLogic in the browser.
 */
(function (root) {
  'use strict';

  // Byte-mode capacity of the largest QR code (version 40) per error-correction level.
  var MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };

  // Which field gets the "too long" error for each type.
  var MAIN_FIELD = { url: 'url', text: 'text', email: 'body', phone: 'phone', wifi: 'ssid' };

  var ATEXT = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
  var EMAIL_RE = new RegExp(
    '^' + ATEXT + '(\\.' + ATEXT + ')*' +
    '@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+' +
    '([A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$'
  );

  function utf8Length(s) {
    return new TextEncoder().encode(s).length;
  }

  function fail(r, field, message, empty) {
    r.errors.push({ field: field, message: message, empty: !!empty });
    return null;
  }

  // --- URL -----------------------------------------------------------------

  function buildUrl(v, r) {
    var raw = (v.url || '').trim();
    if (!raw) return fail(r, 'url', 'Enter a website address.', true);
    if (/\s/.test(raw)) return fail(r, 'url', 'Web addresses can’t contain spaces. Check the address for typos.');

    var hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
    if (hasScheme && !/^https?:\/\//i.test(raw)) {
      return fail(r, 'url', 'Only http:// and https:// web addresses are supported.');
    }
    if (!hasScheme && /^https?:/i.test(raw)) {
      return fail(r, 'url', 'Check the start of the address. It should begin with https:// (two slashes).');
    }
    if (!hasScheme && /^(mailto|tel|sms|smsto|javascript|data|file|ftp|wifi):/i.test(raw)) {
      return fail(r, 'url', 'That isn’t a web address. For email or phone numbers, choose the Email or Phone type.');
    }

    var url;
    try {
      url = new URL(hasScheme ? raw : 'https://' + raw.replace(/^\/+/, ''));
    } catch (e) {
      return fail(r, 'url', 'That doesn’t look like a valid web address. Try something like example.com.');
    }

    var host = url.hostname;
    var isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.charAt(0) === '[';
    var isDomain = /^([a-z0-9-]+\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(host);
    if (!isIp && !isDomain && host !== 'localhost') {
      return fail(r, 'url', 'Enter a complete address that includes a domain ending, such as example.com.');
    }
    return url.href;
  }

  // --- Plain text ----------------------------------------------------------

  function buildText(v, r) {
    var text = (v.text || '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return fail(r, 'text', 'Enter some text.', true);
    return text;
  }

  // --- Email (RFC 6068 mailto:) --------------------------------------------

  function buildEmail(v, r) {
    var email = (v.email || '').trim();
    if (!email) return fail(r, 'email', 'Enter an email address.', true);
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return fail(r, 'email', 'Enter a valid email address, such as name@example.com.');
    }

    var subject = (v.subject || '').trim();
    var body = (v.body || '').replace(/\r?\n/g, '\r\n');
    var query = [];
    if (subject) query.push('subject=' + encodeURIComponent(subject));
    if (body.trim()) query.push('body=' + encodeURIComponent(body));

    // '%', '?' and '#' are legal in an address but would break the URI.
    var address = email.replace(/[%?#]/g, encodeURIComponent);
    return 'mailto:' + address + (query.length ? '?' + query.join('&') : '');
  }

  // --- Phone (RFC 3966 tel:) -----------------------------------------------

  function buildPhone(v, r) {
    var raw = (v.phone || '').trim();
    if (!raw) return fail(r, 'phone', 'Enter a phone number.', true);
    if (/[^\d\s()+.\-\/]/.test(raw)) {
      return fail(r, 'phone', 'Use only digits, spaces, +, -, dots and brackets.');
    }
    if (raw.lastIndexOf('+') > 0) return fail(r, 'phone', 'A + can only appear at the start of the number.');

    var digits = raw.replace(/\D/g, '');
    if (digits.length < 3 || digits.length > 15) {
      return fail(r, 'phone', 'Enter a phone number with 3 to 15 digits.');
    }
    return 'tel:' + (raw.charAt(0) === '+' ? '+' : '') + digits;
  }

  // --- Wi-Fi (ZXing "WIFI:" format) ----------------------------------------

  // Backslash-escape the characters that are special in the WIFI: format.
  function escapeWifi(s) {
    return s.replace(/([\\;,:"])/g, '\\$1');
  }

  function buildWifi(v, r) {
    var ssid = v.ssid || '';
    var password = v.password || '';
    var security = v.security === 'WEP' || v.security === 'nopass' ? v.security : 'WPA';

    if (!ssid.trim()) {
      fail(r, 'ssid', 'Enter the network name (SSID).', true);
    } else if (utf8Length(ssid) > 32) {
      fail(r, 'ssid', 'Network names can be at most 32 bytes long. Check the name for typos.');
    } else if (ssid !== ssid.trim()) {
      r.warnings.push('The network name starts or ends with a space. Keep it only if your network name really has one.');
    }

    if (security === 'WPA') {
      var hex64 = /^[0-9a-f]{64}$/i.test(password);
      if (!password) {
        fail(r, 'password', 'Enter the Wi-Fi password, or set Security to “None” for an open network.', true);
      } else if (!hex64 && (password.length < 8 || password.length > 63)) {
        fail(r, 'password', 'WPA/WPA2 passwords are 8 to 63 characters long. Check the password, or pick a different security type.');
      }
    } else if (security === 'WEP') {
      var validWep = /^(.{5}|.{13})$/.test(password) || /^([0-9a-f]{10}|[0-9a-f]{26})$/i.test(password);
      if (!password) {
        fail(r, 'password', 'Enter the WEP key, or set Security to “None” for an open network.', true);
      } else if (!validWep) {
        fail(r, 'password', 'WEP keys are 5 or 13 characters, or 10 or 26 hexadecimal digits. Check the key, or pick a different security type.');
      }
    } else if (password) {
      r.warnings.push('The password isn’t included because Security is set to “None”.');
    }

    if (r.errors.length) return null;

    return 'WIFI:T:' + security +
      ';S:' + escapeWifi(ssid) + ';' +
      (security === 'nopass' ? '' : 'P:' + escapeWifi(password) + ';') +
      (v.hidden ? 'H:true;' : '') + ';';
  }

  var BUILDERS = { url: buildUrl, text: buildText, email: buildEmail, phone: buildPhone, wifi: buildWifi };

  /**
   * Build the string to encode for a QR type.
   * Returns { payload, errors: [{ field, message, empty }], warnings: [string] }.
   * `empty` marks "required field left blank" errors, which the UI only shows
   * once the user has interacted with the field or pressed Generate.
   */
  function build(type, values, ecLevel) {
    var r = { payload: null, errors: [], warnings: [] };
    var builder = BUILDERS[type];
    if (!builder) {
      fail(r, 'type', 'Choose a QR code type.');
      return r;
    }
    var payload = builder(values || {}, r);
    if (r.errors.length) return r;

    var max = MAX_BYTES[ecLevel] || MAX_BYTES.M;
    var bytes = utf8Length(payload);
    if (bytes > max) {
      fail(r, MAIN_FIELD[type], 'This is too long for one QR code (' + bytes.toLocaleString('en-US') +
        ' bytes; the limit is ' + max.toLocaleString('en-US') +
        ' at this error-correction level). Shorten it, or choose a lower error-correction level.');
      return r;
    }
    r.payload = payload;
    return r;
  }

  // --- Colour contrast (WCAG relative luminance) ---------------------------

  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    var weights = [0.2126, 0.7152, 0.0722];
    return [n >> 16, (n >> 8) & 255, n & 255].reduce(function (sum, c, i) {
      c /= 255;
      return sum + weights[i] * (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    }, 0);
  }

  function contrast(fg, bg) {
    var f = luminance(fg);
    var b = luminance(bg);
    return { ratio: (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05), inverted: f > b };
  }

  // --- SVG -----------------------------------------------------------------

  /**
   * Render a made qrcode object as SVG, one unit per module.
   * opts: { margin, fg, bg, size }. With `standalone`, adds the XML header and
   * pixel width/height for a downloadable file.
   */
  function toSvg(qr, opts, standalone) {
    var n = qr.getModuleCount();
    var m = opts.margin;
    var total = n + 2 * m;
    var d = [];
    for (var row = 0; row < n; row++) {
      for (var col = 0; col < n; col++) {
        if (!qr.isDark(row, col)) continue;
        var run = 1;
        while (col + run < n && qr.isDark(row, col + run)) run++;
        d.push('M' + (col + m) + ' ' + (row + m) + 'h' + run + 'v1h-' + run + 'z');
        col += run - 1;
      }
    }
    return (standalone ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '') +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '"' +
      (standalone ? ' width="' + opts.size + '" height="' + opts.size + '"' : ' aria-hidden="true" focusable="false"') +
      ' shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + opts.bg + '"/>' +
      '<path fill="' + opts.fg + '" d="' + d.join('') + '"/></svg>';
  }

  var api = {
    MAX_BYTES: MAX_BYTES,
    build: build,
    escapeWifi: escapeWifi,
    contrast: contrast,
    toSvg: toSvg,
    utf8Length: utf8Length
  };

  root.QRLogic = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
