/*
 * Page wiring: reads the form, builds the QR code with qrcode-generator,
 * renders the preview and handles PNG/SVG downloads. Everything stays in the
 * browser; nothing is sent over the network.
 */
(function () {
  'use strict';

  var qrcode = window.qrcode;
  var QRLogic = window.QRLogic;
  // Encode text as UTF-8 so accents, non-Latin scripts and emoji survive.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

  var DENSE_VERSION = 15;      // above this, warn that the code is hard to scan
  var MIN_PX_PER_MODULE = 2;   // below this, a PNG module is too small to read
  var LOW_CONTRAST = 4;        // warn below this contrast ratio
  var MIN_CONTRAST = 1.5;      // refuse below this: the code would be invisible
  var DEBOUNCE_MS = 150;
  var ERROR_FIELDS = ['url', 'text', 'email', 'subject', 'body', 'phone', 'ssid', 'password'];

  function $(id) { return document.getElementById(id); }

  var form = $('qr-form');
  var preview = $('preview');
  var statusEl = $('status');
  var metaEl = $('meta');
  var payloadDetails = $('payload-details');
  var payloadEl = $('payload');
  var pngButton = $('download-png');
  var svgButton = $('download-svg');
  var sizeSelect = $('size');

  var current = null;   // { qr, payload, opts } for the code on screen
  var touched = {};     // fields the user has changed and left
  var showAll = false;  // after Generate is pressed, show "required" errors too
  var timer = 0;

  function currentType() {
    return form.elements.type.value;
  }

  function readValues() {
    var values = {};
    ERROR_FIELDS.forEach(function (id) { values[id] = $(id).value; });
    values.security = $('security').value;
    values.hidden = $('hidden').checked;
    return values;
  }

  function hexColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  }

  function readOptions() {
    return {
      size: parseInt(sizeSelect.value, 10),
      ec: $('ec').value,
      margin: parseInt($('margin').value, 10),
      fg: hexColor($('fg').value, '#000000'),
      bg: hexColor($('bg').value, '#ffffff')
    };
  }

  // --- Rendering -----------------------------------------------------------

  function showFieldErrors(errors) {
    var byField = {};
    errors.forEach(function (e) { if (!byField[e.field]) byField[e.field] = e; });
    ERROR_FIELDS.forEach(function (field) {
      var e = byField[field];
      var show = !!e && (showAll || touched[field]);
      var input = $(field);
      var message = $(field + '-error');
      if (show) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
      message.textContent = show ? e.message : '';
      message.hidden = !show;
    });
  }

  function setStatus(messages, level) {
    statusEl.textContent = '';
    statusEl.className = 'status' + (messages.length ? ' status-' + level : '');
    if (messages.length === 1) {
      statusEl.textContent = messages[0];
    } else if (messages.length > 1) {
      var list = document.createElement('ul');
      messages.forEach(function (text) {
        var item = document.createElement('li');
        item.textContent = text;
        list.appendChild(item);
      });
      statusEl.appendChild(list);
    }
  }

  function showPlaceholder(text, messages, level) {
    current = null;
    preview.className = 'preview is-empty';
    preview.removeAttribute('role');
    preview.removeAttribute('aria-label');
    preview.textContent = '';
    var p = document.createElement('p');
    p.textContent = text;
    preview.appendChild(p);
    setStatus(messages || [], level || 'error');
    metaEl.textContent = '';
    payloadDetails.hidden = true;
    pngButton.disabled = true;
    svgButton.disabled = true;
  }

  function describe(type, payload, values) {
    if (type === 'wifi') return 'Wi-Fi network ' + values.ssid;
    return payload.length > 120 ? payload.slice(0, 120) + '…' : payload;
  }

  function smallestSizeFor(totalModules) {
    var sizes = Array.prototype.map.call(sizeSelect.options, function (o) { return parseInt(o.value, 10); });
    for (var i = 0; i < sizes.length; i++) {
      if (sizes[i] / totalModules >= MIN_PX_PER_MODULE) return sizes[i];
    }
    return null;
  }

  function update() {
    clearTimeout(timer);
    timer = 0;

    var type = currentType();
    var values = readValues();
    var opts = readOptions();
    var result = QRLogic.build(type, values, opts.ec);

    $('fg-value').textContent = opts.fg;
    $('bg-value').textContent = opts.bg;
    showFieldErrors(result.errors);

    if (!result.payload) {
      var visible = result.errors.some(function (e) { return showAll || touched[e.field]; });
      var unfinished = result.errors.some(function (e) { return !e.empty; });
      return showPlaceholder(visible
        ? 'Fix the highlighted field to create your QR code.'
        : unfinished ? 'Finish entering the details to see your QR code.' : 'Your QR code will appear here.');
    }

    var colors = QRLogic.contrast(opts.fg, opts.bg);
    if (colors.ratio < MIN_CONTRAST) {
      return showPlaceholder('Choose more contrasting colours.',
        ['The foreground and background colours are too similar for a scanner to tell apart.'], 'error');
    }

    var qr;
    try {
      qr = qrcode(0, opts.ec);
      qr.addData(result.payload);
      qr.make();
    } catch (e) {
      return showPlaceholder('Too much data for one QR code.',
        ['Shorten the content, or choose a lower error-correction level.'], 'error');
    }

    var count = qr.getModuleCount();
    var version = (count - 17) / 4;
    var totalModules = count + 2 * opts.margin;
    var pngReadable = opts.size / totalModules >= MIN_PX_PER_MODULE;
    var warnings = result.warnings.slice();

    if (!pngReadable) {
      var needed = smallestSizeFor(totalModules);
      warnings.push('At ' + opts.size + ' px the PNG would be too blurry to scan. ' +
        (needed ? 'Choose an image size of at least ' + needed + ' px, or download the SVG.' : 'Download the SVG instead.'));
    }
    if (version >= DENSE_VERSION) {
      warnings.push('This code is very dense (' + count + ' × ' + count + ' modules) and may be hard to scan, ' +
        'especially from a screen. Shorten the content or print it large.');
    }
    if (colors.inverted) {
      warnings.push('Light-on-dark codes can’t be read by some scanners. A dark foreground on a light background is safest.');
    } else if (colors.ratio < LOW_CONTRAST) {
      warnings.push('Low colour contrast can make the code hard to scan. Try a darker foreground or a lighter background.');
    }
    if (opts.margin === 0) {
      warnings.push('Without a quiet zone, the code may not scan unless it sits on a plain background with space around it.');
    }

    current = { qr: qr, payload: result.payload, opts: opts };
    preview.className = 'preview';
    preview.setAttribute('role', 'img');
    preview.setAttribute('aria-label', 'QR code for ' + describe(type, result.payload, values));
    preview.innerHTML = QRLogic.toSvg(qr, opts, false);

    setStatus(warnings, 'warning');
    metaEl.textContent = count + ' × ' + count + ' modules · PNG ' + opts.size + ' × ' + opts.size + ' px · Error correction ' + opts.ec;
    payloadEl.textContent = result.payload;
    payloadDetails.hidden = false;
    pngButton.disabled = !pngReadable;
    svgButton.disabled = false;
  }

  function scheduleUpdate() {
    clearTimeout(timer);
    timer = setTimeout(update, DEBOUNCE_MS);
  }

  function flush() {
    if (timer) update();
  }

  // --- Downloads -----------------------------------------------------------

  function toPngBlob(qr, opts, done) {
    var n = qr.getModuleCount();
    var m = opts.margin;
    var scale = opts.size / (n + 2 * m);
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = opts.size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, opts.size, opts.size);
    ctx.fillStyle = opts.fg;
    // Snap module edges to whole pixels so the image stays crisp at any size.
    for (var row = 0; row < n; row++) {
      var y0 = Math.round((row + m) * scale);
      var y1 = Math.round((row + m + 1) * scale);
      for (var col = 0; col < n; col++) {
        if (!qr.isDark(row, col)) continue;
        var run = 1;
        while (col + run < n && qr.isDark(row, col + run)) run++;
        var x0 = Math.round((col + m) * scale);
        var x1 = Math.round((col + m + run) * scale);
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        col += run - 1;
      }
    }
    canvas.toBlob(done, 'image/png');
  }

  function toSvgBlob(qr, opts) {
    return new Blob([QRLogic.toSvg(qr, opts, true)], { type: 'image/svg+xml' });
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  pngButton.addEventListener('click', function () {
    flush();
    if (!current || pngButton.disabled) return;
    toPngBlob(current.qr, current.opts, function (blob) {
      if (blob) saveBlob(blob, 'qr-code.png');
      else setStatus(['Your browser couldn’t create the PNG. Try downloading the SVG instead.'], 'error');
    });
  });

  svgButton.addEventListener('click', function () {
    flush();
    if (!current) return;
    saveBlob(toSvgBlob(current.qr, current.opts), 'qr-code.svg');
  });

  // --- Form events ---------------------------------------------------------

  function syncType() {
    var type = currentType();
    Array.prototype.forEach.call(form.querySelectorAll('.fields'), function (group) {
      group.hidden = group.getAttribute('data-type') !== type;
    });
  }

  function syncWifi() {
    var open = $('security').value === 'nopass';
    $('password').disabled = open;
    $('show-password').disabled = open;
    $('password').type = $('show-password').checked ? 'text' : 'password';
  }

  form.addEventListener('input', function (event) {
    if (event.target.type === 'radio' || event.target.tagName === 'SELECT' || event.target.type === 'checkbox') return;
    scheduleUpdate();
  });

  form.addEventListener('change', function (event) {
    var target = event.target;
    if (target.name === 'type') {
      showAll = false;
      syncType();
    } else if (target.id === 'security' || target.id === 'show-password') {
      syncWifi();
    }
    if (target.id) touched[target.id] = true;
    update();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    showAll = true;
    update();
    if (!current) {
      var invalid = form.querySelector('[aria-invalid="true"]');
      if (invalid) invalid.focus();
      return;
    }
    if (!statusEl.textContent) setStatus(['QR code ready. Scan it to check, then download.'], 'ok');
    // On narrow screens the preview sits below the form; bring it into view.
    var box = preview.getBoundingClientRect();
    if (box.bottom > window.innerHeight || box.top < 0) $('output').scrollIntoView({ block: 'start' });
  });

  form.addEventListener('reset', function () {
    var type = currentType();
    // Let the browser restore default values first, then keep the chosen type.
    setTimeout(function () {
      $('type-' + type).checked = true;
      touched = {};
      showAll = false;
      syncType();
      syncWifi();
      update();
    }, 0);
  });

  syncType();
  syncWifi();
  update();
})();
