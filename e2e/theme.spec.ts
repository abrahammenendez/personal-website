import { expect, test } from '@playwright/test'

test.describe('colour scheme', () => {
  test('follows the OS preference when nothing has been chosen', async ({ page }) => {
    const html = page.locator('html')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(html).toHaveClass(/dark/)

    // No reload: with no stored preference, THEME_INIT_SCRIPT's matchMedia
    // listener keeps following the OS.
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(html).toHaveClass(/light/)
  })

  test('an explicit choice overrides the OS and survives a reload', async ({ page }) => {
    const html = page.locator('html')

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(html).toHaveClass(/dark/)

    await page.getByRole('button', { name: /toggle color scheme/i }).click()
    await expect(html).toHaveClass(/light/)

    await page.emulateMedia({ colorScheme: 'light' })
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(html).toHaveClass(/light/)

    await page.reload()
    await expect(html).toHaveClass(/light/)
  })

  test('ships both toggle glyphs, so the prerendered HTML guesses no scheme', async ({ page }) => {
    await page.goto('/')

    const toggle = page.getByRole('button', { name: /toggle color scheme/i })
    await expect(toggle).toContainText('🌕')
    await expect(toggle).toContainText('🌑')
    await expect(toggle.locator('span:visible')).toHaveCount(1)
  })
})
