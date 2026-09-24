# Free QR Code Generator

A small static web app that creates QR codes for:

- **URL**: `example.com` works as well as `https://example.com`
- **Plain text**: any language, emoji and line breaks
- **Email**: a `mailto:` link with an optional subject and message
- **Phone**: a `tel:` link
- **Wi-Fi**: WPA/WPA2, WEP or open networks, including hidden networks

The preview updates as you type. You can download the code as **PNG** (`qr-code.png`) or **SVG** (`qr-code.svg`), and set the image size, colours, quiet zone (margin) and error-correction level.

## Privacy: everything happens in the browser

The QR code is built by JavaScript on the user's device. There is no backend, database, account, analytics or third-party request. Nothing the user types leaves the browser, and downloads are made locally from in-memory blobs.

On Cloudflare Pages, the `_headers` file adds a Content-Security-Policy with `connect-src 'none'`, so the page *cannot* send data anywhere, even by mistake.

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

## Deploy to Cloudflare Pages

1. **Set your domain.** Replace `example.com` in `robots.txt` and `sitemap.xml` with your real domain.
2. **Deploy.** Use either option:
   - **Direct upload (no Git):** in the Cloudflare dashboard, go to *Workers & Pages → Create → Pages → Upload assets*, then drag in this folder.
   - **From Git:** push this folder to a GitHub or GitLab repository, then *Workers & Pages → Create → Pages → Connect to Git*. Use framework preset **None**, leave the **build command empty**, and set the **build output directory** to `/`.
   - Or from the command line:

     ```bash
     npx wrangler pages deploy . --project-name=free-qr-code-generator
     ```

Cloudflare Pages reads `_headers` (security and caching headers) and uses `404.html` for unknown paths automatically. `README.md` and `tests/` also get uploaded. That's harmless, but you can deploy from a copy without them if you prefer.

## Project structure

```
index.html                         Page markup, SEO meta tags, FAQ content
styles.css                         All styles (light and dark themes)
js/logic.js                        Payload building, validation, contrast check, SVG output (no DOM)
js/app.js                          Form handling, live preview, PNG/SVG downloads
vendor/qrcode-generator-2.0.4.js   QR encoder library (pinned, unmodified)
vendor/qrcode-generator-LICENSE.txt
tests/logic.test.js                Unit tests for js/logic.js
favicon.svg, favicon.ico, apple-touch-icon.png
robots.txt, sitemap.xml            Replace example.com before deploying
_headers                           Cloudflare Pages headers (CSP, caching)
404.html                           Not-found page
```

## Dependencies

- **[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4** by Kazuhiko Arase (MIT). It's vendored in `vendor/` with the version in the filename, so the site never loads code from a CDN. Text is encoded as UTF-8 through the library's built-in `UTF-8` encoder.

There is nothing else: no framework, bundler or npm install.

## Adding an ad later

`index.html` has an empty `<aside class="ad-slot" id="ad-slot" hidden>` between the generator and the help section. It's hidden and takes up no space. To use it:

1. Put the ad markup inside it and remove the `hidden` attribute (`.ad-slot` already centres content up to 728 px wide).
2. Loosen the Content-Security-Policy in `_headers` for the ad network's domains (usually `script-src`, `img-src`, `frame-src` and `connect-src`).
3. Review the privacy wording on the page. Most ad networks collect data, so "no tracking" in the footer would need to change.

## Limitations

- **Static codes only.** The content is stored in the code itself. It can't be edited or tracked after printing, and that's by design.
- **UTF-8 without an ECI marker.** Modern iOS and Android scanners detect UTF-8 automatically, but some very old scanners may show non-Latin text incorrectly.
- **Wi-Fi quirks depend on the device.** Special characters (`\ ; , : "`) are escaped according to the standard `WIFI:` format. Hidden-network codes and WPA3-only networks behave differently across phones. SSIDs that look like hexadecimal aren't wrapped in quotes, because many phones would then include the quotes in the name.
- **Capacity.** The generator refuses content larger than a QR code can hold (for example 2,331 bytes at Medium error correction). It warns when a code gets very dense (77 × 77 modules or more), and turns off PNG download when the chosen image size would make modules smaller than 2 px. The SVG download is still available.
- **Colours.** Colours that are nearly identical are refused. Low-contrast and light-on-dark colours trigger a warning but are still allowed.
- Requires a modern browser with JavaScript (any current Chrome, Edge, Firefox or Safari).
