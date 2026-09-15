const { chromium } = require('C:/Users/ME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const accounts = (process.env.UI_SMOKE_ACCOUNTS || 'admin,men.manager,women.manager,emp1005').split(',');
const password = process.env.UI_SMOKE_PASSWORD || 'noamany@123';
const baseUrl = process.env.UI_SMOKE_BASE_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const results = [];
  for (const username of accounts) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const logicalFailures = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
    });
    page.on('requestfailed', (request) => {
      failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.slice(0, 400));
    });
    page.on('response', async (response) => {
      if (!response.url().includes('/api/')) return;
      if (response.status() >= 400) {
        logicalFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
        return;
      }
      const type = response.headers()['content-type'] || '';
      if (!type.includes('application/json')) return;
      try {
        const body = await response.json();
        if (Number(body?.status) >= 400) {
          logicalFailures.push(`logical ${body.status} ${new URL(response.url()).pathname}: ${String(body.message || '').slice(0, 100)}`);
        }
      } catch {}
    });

    let outcome;
    try {
      await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#username').fill(username);
      await page.locator('#password').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      outcome = {
        username,
        landedPath: new URL(page.url()).pathname,
        title: await page.title(),
        bodyVisible: await page.locator('body').isVisible(),
        consoleErrors: [...new Set(consoleErrors)],
        failedRequests: [...new Set(failedRequests)],
        logicalFailures: [...new Set(logicalFailures)],
      };
    } catch (error) {
      outcome = {
        username,
        landedPath: new URL(page.url()).pathname,
        error: String(error?.message || error).slice(0, 500),
        consoleErrors: [...new Set(consoleErrors)],
        failedRequests: [...new Set(failedRequests)],
        logicalFailures: [...new Set(logicalFailures)],
      };
    }
    results.push(outcome);
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
