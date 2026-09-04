import { createRequire } from 'node:module';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const requireFromWorkspace = createRequire(
  path.resolve(args.workspace, 'package.json'),
);
const { chromium } = requireFromWorkspace('@playwright/test');

const requestedChannel = process.env.FACTORY_BROWSER_CHANNEL || 'chrome';
const browser = await chromium.launch({
  ...(requestedChannel === 'bundled' ? {} : { channel: requestedChannel }),
  headless: true,
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const response = await page.goto(args.url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  if (!response || response.status() >= 400) {
    throw new Error(
      `Application returned HTTP ${response?.status() ?? 'no response'}.`,
    );
  }

  await page.locator('body').waitFor({ state: 'visible', timeout: 30_000 });
  const body = (await page.locator('body').innerText()).trim();
  if (!body) throw new Error('Application rendered an empty body.');
  if (/Internal Server Error|Application error/i.test(body)) {
    throw new Error('Application rendered a server error page.');
  }

  await page.screenshot({ path: args.screenshot, fullPage: true });
  console.log(`Browser smoke passed: ${page.url()}`);
} finally {
  await browser.close();
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    parsed[argv[index]?.replace(/^--/, '')] = argv[index + 1];
  }
  for (const name of ['workspace', 'url', 'screenshot']) {
    if (!parsed[name]) throw new Error(`Missing --${name}`);
  }
  return parsed;
}
