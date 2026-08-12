import { expect, test } from '@playwright/test'

const PAGES = ['/', '/lab', '/lab/hello-server', '/lab/peelr']

test.describe('site header', () => {
  test('renders on every page', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path)

      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
    }
  })

  test('marks the current page for assistive tech', async ({ page }) => {
    const home = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' })

    await page.goto('/')
    await expect(home).toHaveAttribute('aria-current', 'page')

    // Only correct because Home matches exactly; `/` prefix-matches every route.
    await page.goto('/lab')
    await expect(home).not.toHaveAttribute('aria-current', 'page')
  })

  test('navigates between pages without reloading the document', async ({ page }) => {
    const marker = '__sameDocument'

    await page.goto('/lab/hello-server')
    await page.evaluate((key) => {
      Object.assign(window, { [key]: true })
    }, marker)

    await page.getByRole('main').getByRole('link', { name: 'Lab' }).click()
    await expect(page).toHaveURL('/lab')

    // A full page load would have thrown the marker away with the old document.
    expect(await page.evaluate((key) => key in window, marker)).toBe(true)
  })

  test('ships the nav as a real anchor in the prerendered HTML', async ({ request }) => {
    // The raw response, not the hydrated DOM: it must work before any JS runs.
    const html = await (await request.get('/lab')).text()

    expect(html).toMatch(/<a[^>]+href="\/"[^>]*>Home<\/a>/)
  })
})

test('serves a styled 404 for an unknown URL', async ({ page }) => {
  const response = await page.goto('/nope')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})
