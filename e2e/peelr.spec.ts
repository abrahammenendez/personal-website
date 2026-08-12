import { expect, type Page, test } from '@playwright/test'

/** Forced either way, because headless Chromium may or may not expose WebGPU. */
function stubWebGpu(page: Page, available: boolean) {
  return page.addInitScript(
    (value) => {
      Object.defineProperty(navigator, 'gpu', { configurable: true, value })
    },
    (available ? {} : undefined) as unknown,
  )
}

test.describe('/lab/peelr', () => {
  test('explains the WebGPU requirement when it is unavailable', async ({ page }) => {
    await stubWebGpu(page, false)
    await page.goto('/lab/peelr')

    await expect(page.getByRole('heading', { level: 1, name: 'peelr' })).toBeVisible()
    await expect(
      page.getByText(
        'This needs WebGPU in Chrome or Edge. Firefox and Safari are not supported yet.',
      ),
    ).toBeVisible()
  })

  test('carries the licence notice for the weights it redistributes', async ({ page }) => {
    await page.goto('/lab/peelr')

    const credit = page.getByText(/Separation by Demucs/)
    await expect(credit).toContainText('MIT licensed')
    await expect(credit.getByRole('link', { name: 'Demucs' })).toHaveAttribute(
      'href',
      'https://github.com/adefossez/demucs',
    )
  })

  test('states the limits and takes a file without dragging', async ({ page }) => {
    await stubWebGpu(page, true)
    await page.goto('/lab/peelr')

    // Drag and drop sits on top of a real labelled input, so keyboard users are not
    // locked out.
    await expect(page.getByLabel(/Drop a song here, or choose one/)).toHaveAttribute('type', 'file')
    await expect(page.getByText(/Up to 6 minutes/)).toBeVisible()
    await expect(page.getByText(/downloads the model, about 90 MB/)).toBeVisible()
  })
})
