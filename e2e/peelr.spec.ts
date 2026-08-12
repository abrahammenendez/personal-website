import { expect, test } from '@playwright/test'

test.describe('/lab/peelr', () => {
  test('explains the WebGPU requirement when it is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined })
    })
    await page.goto('/lab/peelr')

    await expect(page.getByRole('heading', { level: 1, name: 'peelr' })).toBeVisible()
    await expect(
      page.getByText(
        'This needs WebGPU in Chrome or Edge. Firefox and Safari are not supported yet.',
      ),
    ).toBeVisible()
  })
})
