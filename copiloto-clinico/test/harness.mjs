// Shared helpers: wrap the built page in the publish skeleton, inject the mock, route the CDN to the local morphdom copy.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PAGE = fs.readFileSync(path.join(ROOT, 'dist/copiloto-clinico.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(ROOT, 'test/mock-claude.js'), 'utf8');
const MORPH = fs.readFileSync(process.env.MORPHDOM_PATH || path.join(ROOT, 'vendor/morphdom-umd.min.js'), 'utf8');
export function wrap(mockCfg, { withMock = true } = {}) {
  const pre = withMock ? '<script>window.__MOCK=' + JSON.stringify(mockCfg || {}) + ';</script><script>' + MOCK + '</script>' : '';
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + pre + PAGE + '</body></html>';
}
export async function open({ mock = {}, withMock = true, viewport = { width: 1280, height: 900 }, colorScheme = 'light' } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const ctx = await browser.newContext({ viewport, colorScheme, ignoreHTTPSErrors: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://app.local' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('morphdom')) return route.fulfill({ status: 200, contentType: 'application/javascript', body: MORPH });
    if (u.includes('fonts.googleapis.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts stub */' });
    if (u.startsWith('https://app.local/')) return route.fulfill({ status: 200, contentType: 'text/html', body: wrap(mock, { withMock }) });
    return route.abort();
  });
  await page.goto('https://app.local/index.html');
  await page.waitForTimeout(400);
  return { browser, ctx, page, errors };
}

export async function flushed(page) {
  await page.waitForFunction(() => typeof ErrorLog !== 'undefined' && ErrorLog.dirty.size === 0 && ErrorLog.inflight.size === 0, null, { timeout: 6000 }).catch(() => {});
}
