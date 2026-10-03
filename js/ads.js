/*
 * Small Adsterra banner below the generator.
 *
 * Ads stay off, and the box stays hidden, until a banner code is added to
 * js/ads-config.js. Each ad runs in its own sandboxed frame (ad/index.html)
 * with an opaque origin, so ad code can't read this page or anything typed
 * into it. Add ?adpreview to the address to see the box without loading an ad.
 */
(function () {
  'use strict';

  var BANNER = /^(?:https?:)?\/\/([a-z0-9.:-]+)\/([a-z0-9]+)\/invoke\.js$/i;
  var banners = (window.ADS && window.ADS.banners) || {};
  var slot = document.getElementById('ad-slot');
  if (!slot) return;

  function isLive(size) {
    return BANNER.test(banners[size] || '');
  }

  Object.keys(banners).forEach(function (size) {
    if (banners[size] && !isLive(size)) {
      console.error('js/ads-config.js: the ' + size + ' entry doesn’t look like an Adsterra invoke.js address.');
    }
  });

  var sizes = slot.getAttribute('data-ad-sizes').split(' ');
  var preview = /[?&]adpreview(&|=|$)/.test(location.search);
  if (!preview && !sizes.some(isLive)) return;

  // Use the largest size that fits (phones get 320×50). The slot must be shown to be measured.
  slot.hidden = false;
  var size = sizes.filter(function (s) { return parseInt(s, 10) <= slot.clientWidth; })[0] || sizes[sizes.length - 1];
  var live = isLive(size);
  if (!live && !preview) {
    slot.hidden = true;
    return;
  }

  var dims = size.split('x');
  var box = slot.querySelector('.ad-box');
  box.style.width = dims[0] + 'px';
  box.style.height = dims[1] + 'px';

  if (!live) {
    box.classList.add('ad-placeholder');
    box.textContent = 'Ad space ' + dims[0] + ' × ' + dims[1] + ' (preview)';
    return;
  }

  var frame = document.createElement('iframe');
  frame.title = 'Advertisement';
  frame.width = dims[0];
  frame.height = dims[1];
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-popups-to-escape-sandbox');
  frame.src = 'ad/?unit=' + size;
  box.appendChild(frame);
})();
