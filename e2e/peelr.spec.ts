import { expect, type Page, test } from '@playwright/test'

/**
 * `DEMO_TRACK.url`, copied because importing `@/lab/peelr` here also loads `Peelr.tsx`,
 * and its `import.meta.env` is undefined outside Vite.
 */
const DEMO_TRACK_URL = '/peelr/demo.mp3'

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

    const credit = page.getByText(/Model: Demucs/)
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
    await expect(page.getByLabel(/Drop a song here/)).toHaveAttribute('type', 'file')
    await expect(page.getByText(/Up to 6 minutes/)).toBeVisible()
    await expect(page.getByText(/downloads the model, about 90 MB/)).toBeVisible()
  })

  test('offers a demo track to visitors with no song of their own', async ({ page, request }) => {
    await stubWebGpu(page, true)
    await page.goto('/lab/peelr')

    await expect(page.getByRole('button', { name: 'Try a demo track' })).toBeVisible()

    const track = await request.get(DEMO_TRACK_URL)
    expect(track.status()).toBe(200)
    expect(track.headers()['content-type']).toContain('audio/')
  })
})
