import { expect, test } from '@playwright/test'

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/

test.describe('/lab/hello-server', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lab/hello-server')
  })

  test('loads server info from the server function', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Hello, server' })).toBeVisible()

    await expect(page.getByText(TIMESTAMP)).toBeVisible()
  })

  test('re-fetches fresh data on demand', async ({ page }) => {
    const timestamp = page.getByText(TIMESTAMP)
    await expect(timestamp).toBeVisible()
    const first = await timestamp.textContent()

    await page.getByRole('button', { name: /fetch again/i }).click()

    await expect(async () => {
      expect(await timestamp.textContent()).not.toBe(first)
    }).toPass()
  })

  test('posts a message and renders what the server echoed back', async ({ page }) => {
    // pressSequentially, not fill(): Base UI's Input reports changes through
    // onValueChange, which a single fill() event bypasses.
    const input = page.getByLabel('Message')
    await input.click()
    await input.pressSequentially('hello world')
    await page.getByRole('button', { name: /send to server/i }).click()

    // In the card, not the toast: that auto-dismisses. `exact` so it cannot
    // match the transient "Server echoed: …" toast either.
    await expect(page.getByText('HELLO WORLD', { exact: true })).toBeVisible()
  })

  test('surfaces the server-side rejection of an empty message', async ({ page }) => {
    // No client-side validation: this error came back from the Worker.
    await page.getByRole('button', { name: /send to server/i }).click()

    await expect(page.getByRole('alert')).toContainText('Say something')
  })

  test('confirms the Sentry test error with a toast', async ({ page }) => {
    await page.getByRole('button', { name: /trigger test error/i }).click()

    await expect(page.getByText('Sent a test error to Sentry')).toBeVisible()
  })
})
