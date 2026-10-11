import { createRequire } from 'node:module';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const requireFromWorkspace = createRequire(
  path.resolve(args.workspace, 'package.json'),
);
const { chromium, expect } = requireFromWorkspace('@playwright/test');

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

  // The bootstrap text may disappear while the router redirects to login.
  // Wait for the actual login/application surface before inspecting its body.
  await ensureAuthenticated(page);
  await expect(page.locator('main')).toContainText(/\S/u, { timeout: 30_000 });

  const authenticatedBody = (await page.locator('body').innerText()).trim();
  if (!authenticatedBody) {
    throw new Error('Authenticated application rendered an empty body.');
  }
  if (/Internal Server Error|Application error/i.test(authenticatedBody)) {
    throw new Error('Application rendered a server error page.');
  }
  if (/Welcome back|Create an account/i.test(authenticatedBody)) {
    throw new Error(
      'Browser smoke never reached the authenticated application.',
    );
  }

  await page.screenshot({ path: args.screenshot, fullPage: true });
  console.log(`Authenticated browser smoke passed: ${page.url()}`);
} finally {
  await browser.close();
}

async function ensureAuthenticated(page) {
  const loginHeading = page.getByRole('heading', { name: 'Welcome back' });
  const initialSurface = await Promise.race([
    loginHeading
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'login'),
    page
      .locator('main')
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'application'),
  ]);
  if (initialSurface === 'application') return;

  await page
    .getByLabel('Username or email', { exact: true })
    .fill(process.env.FACTORY_SMOKE_USERNAME || 'nocobase');
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.FACTORY_SMOKE_PASSWORD || 'admin123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForFunction(
    () => !/\/(?:login|register)\/?$/u.test(globalThis.location.pathname),
    undefined,
    { timeout: 30_000 },
  );
  await page.locator('main').waitFor({ state: 'visible', timeout: 30_000 });
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
