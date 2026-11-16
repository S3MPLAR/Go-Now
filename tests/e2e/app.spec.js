const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const paletteKey = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';

async function waitForPlanner(app) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => candidate.url().includes('planner.html'));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('planner window not found');
}

test('planner can add, search, toggle, archive and use the command palette', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gonow-e2e-'));
  const args = ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    cwd: root,
    env: { ...process.env, GONOW_USER_DATA: userData, PP_NOLOCK: '1', PP_DEBUG: '1' }
  });

  try {
    const planner = await waitForPlanner(app);
    const errors = [];
    planner.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    planner.on('pageerror', (error) => errors.push(String(error)));

    await expect(planner.locator('#titleInput')).toBeVisible();
    const title = `E2E task ${Date.now()}`;
    await planner.locator('#titleInput').fill(title);
    await planner.locator('#addSubmit').click();
    await expect(planner.locator('#dayList')).toContainText(title);

    const repeatTitle = `E2E repeat ${Date.now()}`;
    await planner.locator('#titleInput').fill(repeatTitle);
    await planner.locator('#repeatBtn').click();
    await planner.locator('.pp-choice[data-value="everyN"]').click();
    await planner.locator('#repeatInterval').fill('3');
    await planner.locator('#addSubmit').click();
    const repeatRow = planner.locator('#dayList .day-item', { hasText: repeatTitle }).first();
    await expect(repeatRow.locator('.badge')).toContainText('каждые 3');

    await planner.locator('#searchInput').fill(title);
    await expect(planner.locator('#searchResults')).toContainText(title);
    await planner.locator('#searchClear').click();

    const row = planner.locator('#dayList .day-item', { hasText: title }).first();
    await row.locator('.checkbox').click();
    await expect(row).toHaveClass(/done/);

    await planner.locator('.filter-chip[data-filter="done"]').click();
    planner.once('dialog', (dialog) => dialog.accept());
    await planner.locator('#clearDoneBtn').click();
    await planner.locator('.filter-chip[data-filter="archived"]').click();
    const archivedRow = planner.locator('#searchResults .day-item', { hasText: title }).first();
    await expect(archivedRow).toBeVisible();
    await archivedRow.locator('.restore-btn').click();
    await expect(planner.locator('#searchResults .day-item', { hasText: title })).toHaveCount(0);
    await planner.locator('.filter-chip[data-filter="all"]').click();
    await expect(planner.locator('#dayList')).toContainText(title);

    await planner.keyboard.press(paletteKey);
    await expect(planner.locator('#paletteOverlay')).toBeVisible();
    await planner.locator('#paletteInput').fill('архив');
    await expect(planner.locator('#paletteList')).toContainText('Открыть архив');
    await planner.keyboard.press('Enter');
    await expect(planner.locator('.filter-chip[data-filter="archived"]')).toHaveClass(/active/);
    await expect(planner.locator('#paletteOverlay')).toBeHidden();

    await planner.keyboard.press(paletteKey);
    await expect(planner.locator('#paletteOverlay')).toBeVisible();
    await planner.keyboard.press('Escape');
    await expect(planner.locator('#paletteOverlay')).toBeHidden();

    await planner.keyboard.press(paletteKey);
    await planner.locator('#paletteInput').fill('новое');
    await planner.keyboard.press('Enter');
    await expect(planner.locator('#titleInput')).toBeFocused();

    expect(errors).toEqual([]);
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
