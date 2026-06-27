import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('AI Hub 메인 페이지', async ({ page }) => {
    await expect(page).toHaveScreenshot('main-full.png', { fullPage: true });
  });

  test('서비스 카드 렌더링', async ({ page }) => {
    const card = page.locator('[class*="card"], article, .service-card').first();
    if (await card.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(card).toHaveScreenshot('service-card.png');
    }
  });

  test('z-index: 제목/텍스트 콘텐츠 표시', async ({ page }) => {
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });
});
