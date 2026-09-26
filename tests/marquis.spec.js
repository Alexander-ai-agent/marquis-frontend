// Playwright coverage for the Sep 24 redesign (DEMO_MODE).
// Run from frontend/:  npm install && npx playwright install chromium && npm test
// The config starts `python -m http.server 4173` for you.

import { test, expect } from '@playwright/test';

const SEED = () => {
  localStorage.setItem('marquis_token', 'demo-token');
  localStorage.setItem('marquis_user', JSON.stringify({ name: 'Pranav Rao', email: 'p@example.com' }));
  localStorage.setItem('marquis_profile', JSON.stringify({ type: 'SaaS / Software', stage: 'Launched' }));
  localStorage.setItem('marquis_onboarded', 'true');
  sessionStorage.setItem('marquis_intro_seen', '1');
};

async function nav(page, target) {
  await page.evaluate((t) => document.querySelector(`.nav-item[data-page="${t}"]`).click(), target);
}

test('fresh visitor: intro -> sign up -> onboarding (validated) -> dashboard', async ({ page }) => {
  await page.goto('/');
  await page.locator('#intro').click(); // any click skips the intro
  await expect(page.locator('#auth-screen')).toHaveClass(/active/);

  await page.click('#login-submit');
  await expect(page.locator('#login-error')).toHaveClass(/show/); // inline error, not native validation

  await page.click('#show-signup');
  await page.fill('#signup-name', 'Pranav Rao');
  await page.fill('#signup-email', 'pranav@example.com');
  await page.fill('#signup-pass', 'longpassword');
  await page.click('#signup-submit');

  await expect(page.locator('#obNext1')).toBeDisabled();
  await page.click('.ob-option[data-val="Other"]');
  await expect(page.locator('#obOther')).toBeVisible();
  await expect(page.locator('#obNext1')).toBeDisabled();
  await page.fill('#obOther', 'Hardware');
  await page.click('#obNext1');
  await page.click('.ob-option[data-val="Idea only"]');
  await page.click('#obNext2');
  await expect(page.locator('#obToClarify')).toBeDisabled();
  await page.fill('#obDesc', 'A small sensor for greenhouse humidity, sold to hobby growers.');
  await page.click('#obToClarify');
  await expect(page.locator('.ob-q')).toHaveCount(3);
  await page.click('#obToReveal');
  await expect(page.locator('#obThinking5')).toBeHidden();
  await expect(page.locator('.ob-phase-name')).not.toBeEmpty();
  await page.click('#obEnter');

  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
  await expect(page.locator('.dash-greeting')).toContainText('Pranav');
  await expect(page.locator('#statRow .stat-card')).toHaveCount(3);
  await expect(page.locator('.intel-row')).toHaveCount(4);
});

test('every page renders content and is visible', async ({ page }) => {
  await page.addInitScript(SEED);
  await page.goto('/');
  for (const target of ['conversation', 'progress', 'analytics', 'settings', 'dashboard']) {
    await nav(page, target);
    const section = page.locator(`#page-${target}`);
    await expect(section).toHaveClass(/active/);
    await expect(section).toHaveCSS('opacity', '1');
    expect((await section.innerText()).trim().length).toBeGreaterThan(40);
  }
});

test('butler: the reply arrives in paragraphs and the canvas follows it', async ({ page }) => {
  await page.addInitScript(SEED);
  await page.goto('/');
  await nav(page, 'conversation');
  await expect(page.locator('#butlerCanvas')).toHaveAttribute('data-canvas-mounted', 'true');
  await expect(page.locator('.mq-presence')).toHaveCount(4);

  await page.click('.conv-modes [data-mode-option="text"]');
  await page.fill('#convInput', 'Why am I behind on my phases?');
  await page.press('#convInput', 'Enter');
  await expect(page.locator('#convInput')).toHaveValue('');
  await expect(page.locator('.mq-canvas')).toHaveAttribute('data-state', 'active', { timeout: 5000 });
  await expect(page.locator('.mq-view-title')).toHaveText('Each phase against its estimate');
  expect(await page.locator('#convScroll .msg:not(.user):not(#thinkMsg)').last().locator('p').count()).toBeGreaterThan(1);

  await page.click('.mq-return');
  await expect(page.locator('.mq-canvas')).toHaveAttribute('data-state', 'idle');
});

test('progress: completing a phase asks once, then shows the milestone', async ({ page }) => {
  await page.addInitScript(SEED);
  await page.goto('/');
  await nav(page, 'progress');
  await expect(page.locator('.tl-row')).toHaveCount(5);
  await page.click('[data-complete]');
  await expect(page.locator('[data-complete]')).toContainText('Confirm');
  await page.click('[data-complete]');
  await expect(page.locator('#milestone')).toBeVisible();
  await page.locator('#milestone').click();
  await expect(page.locator('#milestone')).toBeHidden({ timeout: 3000 });
  await expect(page.locator('#progTitle')).toHaveText('First Revenue');
});

test('settings: mode syncs with the butler page; sign out clears the session', async ({ page }) => {
  // Seed once (not via addInitScript, which would re-seed after sign-out's reload).
  await page.goto('/');
  await page.evaluate(SEED);
  await page.reload();
  await nav(page, 'settings');
  await expect(page.locator('#setName')).toHaveText('Pranav Rao');
  await page.click('#page-settings [data-mode-option="text"]');
  await nav(page, 'conversation');
  await expect(page.locator('#page-conversation')).toHaveAttribute('data-mode', 'text');
  await nav(page, 'settings');
  await page.click('#signOutBtn');
  await expect(page.locator('#auth-screen')).toHaveClass(/active/, { timeout: 8000 });
  expect(await page.evaluate(() => localStorage.getItem('marquis_token'))).toBeNull();
});

test('resilience: GSAP and the chart bundle both missing, still fully usable', async ({ page }) => {
  await page.route(/gsap\.min\.js|CustomEase|marquis-canvas\.js/, (route) => route.abort());
  await page.addInitScript(SEED);
  await page.goto('/');
  for (const target of ['conversation', 'progress', 'analytics', 'settings', 'dashboard']) {
    await nav(page, target);
    await expect(page.locator(`#page-${target}`)).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('.dash-greeting')).toContainText('Pranav');
});

test('phone: no horizontal overflow, hamburger opens navigation', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(SEED);
  await page.goto('/');
  await expect(page.locator('#page-dashboard')).toHaveClass(/active/);
  expect(await page.evaluate(() => document.querySelector('#page-dashboard .scroll').scrollWidth <= window.innerWidth)).toBe(true);
  await page.tap('#menuBtn');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
  await page.tap('.nav-item[data-page="progress"]');
  await expect(page.locator('#page-progress')).toHaveClass(/active/);
  await ctx.close();
});
