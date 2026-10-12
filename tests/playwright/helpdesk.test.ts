import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';

/**
 * The help desk's browser cover: users sign in, find the business pages from the navigation, and act on a ticket. It
 * runs against a built application at APP_URL; `APP_SAMPLE_DATA=true` must have seeded the demonstration tickets and
 * the `alice`, `bob` and `dave` accounts.
 */
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:13000/main';
const APP_BASE = new URL(APP_URL).pathname;

/** Sign in over the API and plant the session cookie, so each test starts authenticated without the login form. */
async function signIn(
  request: APIRequestContext,
  context: BrowserContext,
  email: string,
): Promise<void> {
  let response = await request.post(`${APP_URL}/api/auth/sign-in/email`, {
    data: { email, password: 'Helpdesk123!' },
  });
  // Better Auth rate-limits sign-in; the suite signs in three users back to back, so wait out the window.
  for (
    let attempt = 0;
    !response.ok() && response.status() === 429 && attempt < 5;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    response = await request.post(`${APP_URL}/api/auth/sign-in/email`, {
      data: { email, password: 'Helpdesk123!' },
    });
  }
  expect(response.ok()).toBeTruthy();
  const cookie = /(__Secure[^=]*\.session_token)=([^;]+)/.exec(
    response.headers()['set-cookie'] ?? '',
  );
  expect(cookie).not.toBeNull();
  await context.addCookies([
    {
      name: cookie![1],
      value: cookie![2],
      domain: new URL(APP_URL).hostname,
      path: APP_BASE,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test('the service desk reaches the help desk from the navigation and opens a ticket', async ({
  page,
  request,
  context,
}) => {
  await signIn(request, context, 'dave@example.com');

  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Help desk' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Awaiting assignment')).toBeVisible();

  const helpDesk = page.getByRole('link', { name: 'Help desk' });
  await expect(helpDesk).toBeVisible({ timeout: 30_000 });
  await helpDesk.click();

  await expect(page).toHaveURL(/\/tickets$/, { timeout: 15_000 });
  await expect(page.getByText('Laptop will not turn on')).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('link', { name: 'Laptop will not turn on' }).click();
  await expect(
    page.getByRole('heading', { name: 'Laptop will not turn on' }),
  ).toBeVisible({ timeout: 15_000 });
  // The service desk can dispatch from the ticket, not just see it.
  await expect(page.getByRole('button', { name: 'Assign' })).toBeVisible({
    timeout: 15_000,
  });
});

test('an engineer only sees the tickets assigned to them', async ({
  page,
  request,
  context,
}) => {
  await signIn(request, context, 'bob@example.com');

  await page.goto(`${APP_URL}/tickets`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('VPN client disconnects every few minutes'),
  ).toBeVisible({ timeout: 30_000 });
  // "Laptop will not turn on" is unassigned, so it is not the engineer's to see.
  await expect(page.getByText('Laptop will not turn on')).toHaveCount(0);
});

test('an employee can report a problem', async ({ page, request, context }) => {
  await signIn(request, context, 'alice@example.com');

  const title = `Coffee machine leaks ${Date.now()}`;
  await page.goto(`${APP_URL}/tickets/new`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Title').fill(title);
  await page
    .getByLabel('Description')
    .fill('Water pools under the machine every morning.');
  await page.getByRole('button', { name: 'Submit ticket' }).click();

  // Submitting closes the form and returns to the list, where the new ticket now appears.
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
});
