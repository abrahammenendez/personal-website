import { expect, test } from '@playwright/test'

const PAGES = ['/', '/lab', '/lab/peelr', '/lab/hello-server']

test.describe('site header', () => {
  test('offers the same two destinations on every page', async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path)

      const nav = page.getByRole('navigation', { name: 'Main' })
      await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible()
      await expect(nav.getByRole('link', { name: 'Lab' })).toBeVisible()
    }
  })

  test('marks the current page for assistive tech', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' })
    const home = nav.getByRole('link', { name: 'Home' })
    const lab = nav.getByRole('link', { name: 'Lab' })

    await page.goto('/')
    await expect(home).toHaveAttribute('aria-current', 'page')
    await expect(lab).not.toHaveAttribute('aria-current', 'page')

    await page.goto('/lab')
    await expect(lab).toHaveAttribute('aria-current', 'page')
    // Only correct because Home matches exactly; `/` prefix-matches every route.
    await expect(home).not.toHaveAttribute('aria-current', 'page')

    await page.goto('/lab/peelr')
    await expect(lab).toHaveAttribute('aria-current', 'page')
    await expect(home).not.toHaveAttribute('aria-current', 'page')
  })

  test('navigates between pages without reloading the document', async ({ page }) => {
    const marker = '__sameDocument'

    await page.goto('/')
    await page.evaluate((key) => {
      Object.assign(window, { [key]: true })
    }, marker)

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Lab' }).click()
    await expect(page).toHaveURL('/lab')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Playing with ideas and tech' }),
    ).toBeVisible()

    // A full page load would have thrown the marker away with the old document.
    expect(await page.evaluate((key) => key in window, marker)).toBe(true)
  })

  test('ships the nav as real anchors in the prerendered HTML', async ({ request }) => {
    // The raw response, not the hydrated DOM: it must work before any JS runs.
    const html = await (await request.get('/')).text()

    expect(html).toMatch(/<a[^>]+href="\/"[^>]*>Home<\/a>/)
    expect(html).toMatch(/<a[^>]+href="\/lab"[^>]*>Lab<\/a>/)
  })
})

test('serves a styled 404 for an unknown URL', async ({ page }) => {
  const response = await page.goto('/nope')

  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1, name: 'Not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})
