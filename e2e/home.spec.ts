import { expect, test } from '@playwright/test'

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders the bio', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Hi!' })).toBeVisible()
    await expect(page.getByText('Spanish software developer based in Amsterdam')).toBeVisible()
  })

  test('opens external links in a new tab', async ({ page }) => {
    const linkedin = page.getByRole('link', { name: 'my full work history on LinkedIn' })

    await expect(linkedin).toHaveAttribute('target', '_blank')
    await expect(linkedin).toHaveAttribute('rel', /noopener/)
  })
})
