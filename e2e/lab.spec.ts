import { expect, test } from '@playwright/test'
// Read from the registry, so adding an experiment does not fail these tests.
import { findAllPublishedExperiments } from '@/lab'

const EXPERIMENTS = findAllPublishedExperiments()

test.describe('/lab', () => {
  test('renders every published experiment, newest first', async ({ page }) => {
    await page.goto('/lab')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Playing with ideas and tech' }),
    ).toBeVisible()

    const entries = page.getByRole('main').getByRole('listitem')
    await expect(entries).toHaveCount(EXPERIMENTS.length)

    const hrefs = await entries
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toEqual(EXPERIMENTS.map((experiment) => `/lab/${experiment.slug}`))

    for (const experiment of EXPERIMENTS) {
      const entry = entries.filter({ has: page.locator(`a[href="/lab/${experiment.slug}"]`) })

      await expect(entry).toContainText(experiment.title)
      await expect(entry).toContainText(experiment.description)
    }
  })

  test('opens an experiment, and the experiment links back to the list', async ({ page }) => {
    await page.goto('/lab')

    await page.getByRole('main').locator('a[href="/lab/hello-server"]').click()
    await expect(page).toHaveURL('/lab/hello-server')
    await expect(page.getByRole('heading', { level: 1, name: 'Hello, server' })).toBeVisible()

    // Scoped to `main`: the site header also has a "Lab" nav link.
    await page.getByRole('main').getByRole('link', { name: 'Lab' }).click()
    await expect(page).toHaveURL('/lab')
  })

  test('is readable with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    await page.goto('/lab')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(EXPERIMENTS.length)

    await context.close()
  })
})
