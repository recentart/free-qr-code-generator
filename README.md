# Free QR Code Generator

A small static web app that creates QR codes for:

- **URL**: `example.com` works as well as `https://example.com`
- **Plain text**: any language, emoji and line breaks
- **Email**: a `mailto:` link with an optional subject and message
- **Phone**: a `tel:` link
- **Wi-Fi**: WPA/WPA2, WEP or open networks, including hidden networks

The preview updates as you type. You can download the code as **PNG** (`qr-code.png`) or **SVG** (`qr-code.svg`), and set the image size, colours, quiet zone (margin) and error-correction level.

## Privacy: everything happens in the browser

The QR code is built by JavaScript on the user's device. There is no backend, database, account or analytics. The QR tool makes no network requests: nothing the user types leaves the browser, and downloads are made locally from in-memory blobs.

The only third-party content is the optional Adsterra banner (see [Ads](#ads-adsterra)), and it runs in a sandboxed frame that can't read the page. On Cloudflare, the `_headers` file gives the generator page a Content-Security-Policy with `connect-src 'none'`, so the page itself *cannot* send data anywhere, even by mistake.

## Run it locally

No build step is needed. Either:

- open `index.html` directly in a browser, or
- serve the folder with any static server, for example:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

### Tests

The payload and validation logic (`js/logic.js`) has unit tests that use Node's built-in test runner (Node 18 or newer, no packages needed):

```bash
node --test tests/logic.test.js
```

## Deploy

The live site is https://free-qr-code-generator.freewebtoolss.workers.dev/, a Cloudflare Worker that serves this folder as static files. To publish changes, run this from the folder (you need to be logged in to Cloudflare with `npx wrangler login`):

```bash
npx wrangler deploy
```

The settings live in `wrangler.jsonc`. `.assetsignore` keeps the README, tests and deploy config off the live site. Cloudflare reads `_headers` (security and caching headers) and shows `404.html` for unknown paths.

The GitHub repo [recentart/free-qr-code-generator](https://github.com/recentart/free-qr-code-generator) holds the source. It is **not** connected to Cloudflare, so pushing to GitHub does not update the live site. **Keep the folders when uploading to GitHub:** the page loads `js/…`, `vendor/…` and `ad/…`, and a flattened upload breaks the generator.

If the site moves to its own domain, update the addresses in `robots.txt` and `sitemap.xml`.

## Project structure

```
index.html                         Page markup, SEO meta tags, FAQ content
styles.css                         All styles (light and dark themes)
js/logic.js                        Payload building, validation, contrast check, SVG output (no DOM)
js/app.js                          Form handling, live preview, PNG/SVG downloads
js/ads-config.js                   Adsterra banner codes; ads are off while empty
js/ads.js                          Shows the banner box and its sandboxed ad frame
ad/index.html, ad/frame.js         The ad frame: runs one Adsterra banner, sandboxed
vendor/qrcode-generator-2.0.4.js   QR encoder library (pinned, unmodified)
vendor/qrcode-generator-LICENSE.txt
tests/logic.test.js                Unit tests for js/logic.js
favicon.svg, favicon.ico, apple-touch-icon.png
robots.txt, sitemap.xml            Point at the live address
wrangler.jsonc, .assetsignore      Cloudflare deploy settings (npx wrangler deploy)
privacy.html                       Privacy policy, including the Adsterra disclosure
_headers                           Cloudflare Pages headers (CSP, caching)
404.html                           Not-found page
```

## Dependencies

- **[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4** by Kazuhiko Arase (MIT). It's vendored in `vendor/` with the version in the filename, so the site never loads code from a CDN. Text is encoded as UTF-8 through the library's built-in `UTF-8` encoder.

There is nothing else: no framework, bundler or npm install.

## Ads (Adsterra)

There is one small banner below the generator, labelled "Advertisement": 468×60 on wider screens and 320×50 on phones. Its size is fixed, so the page doesn't jump when an ad loads. It never covers the form or the preview.

**Each ad runs in its own sandboxed frame** (`ad/index.html`, opened with `sandbox` and no `allow-same-origin`). The ad code gets an opaque origin, so it can't read the generator page, what people type (including Wi-Fi passwords) or the downloads. The generator page keeps its strict policy. Only `/ad/*` gets a separate one in `_headers`.

**Ads are off until you add banner codes.** Until then the box is hidden and takes up no space. To see where the banner goes and how big it is, add `?adpreview` to the end of the address. This shows an empty dashed box and loads nothing.

### Turning on ads

1. In Adsterra, go to *Websites → your site → Add ad unit* and create a **Banner 468×60** unit and a **Banner 320×50** unit. Don't use Popunder or Social Bar units; they aren't supported here.
2. Each unit's code contains a line like this:

   ```html
   <script src="//www.highperformanceformat.com/0123456789abcdef0123456789abcdef/invoke.js"></script>
   ```

   Paste just the `src` address into `js/ads-config.js` next to the matching size:

   ```js
   '468x60': '//www.highperformanceformat.com/0123456789abcdef0123456789abcdef/invoke.js',
   ```

3. Run `npx wrangler deploy`, then push to GitHub as a backup.

If only one size is filled in, screens that need the other size show no ad. If an entry doesn't look like an Adsterra address, the browser console shows an error naming it.

## Limitations

- **Static codes only.** The content is stored in the code itself. It can't be edited or tracked after printing, and that's by design.
- **UTF-8 without an ECI marker.** Modern iOS and Android scanners detect UTF-8 automatically, but some very old scanners may show non-Latin text incorrectly.
- **Wi-Fi quirks depend on the device.** Special characters (`\ ; , : "`) are escaped according to the standard `WIFI:` format. Hidden-network codes and WPA3-only networks behave differently across phones. SSIDs that look like hexadecimal aren't wrapped in quotes, because many phones would then include the quotes in the name.
- **Capacity.** The generator refuses content larger than a QR code can hold (for example 2,331 bytes at Medium error correction). It warns when a code gets very dense (77 × 77 modules or more), and turns off PNG download when the chosen image size would make modules smaller than 2 px. The SVG download is still available.
- **Colours.** Colours that are nearly identical are refused. Low-contrast and light-on-dark colours trigger a warning but are still allowed.
- Requires a modern browser with JavaScript (any current Chrome, Edge, Firefox or Safari).
