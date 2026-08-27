import { expect, test } from '@playwright/test'
// Read from the registry, so adding an experiment does not fail these tests.
import { buildExperimentHref, findAllPublishedExperiments } from '@/lab'

const EXPERIMENTS = findAllPublishedExperiments()

test.describe('/lab', () => {
  test('renders every published experiment in the order they are declared', async ({ page }) => {
    await page.goto('/lab')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Playing with ideas and tech' }),
    ).toBeVisible()

    const entries = page.getByRole('main').getByRole('listitem')
    await expect(entries).toHaveCount(EXPERIMENTS.length)

    const hrefs = await entries
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toEqual(EXPERIMENTS.map(buildExperimentHref))

    for (const experiment of EXPERIMENTS) {
      const entry = entries.filter({
        has: page.locator(`a[href="${buildExperimentHref(experiment)}"]`),
      })

      await expect(entry).toContainText(experiment.title)
      await expect(entry).toContainText(experiment.description)
    }
  })

  test('opens an off-site experiment in a new tab', async ({ page }) => {
    await page.goto('/lab')

    for (const experiment of EXPERIMENTS) {
      if (!experiment.href) continue

      const link = page.getByRole('main').locator(`a[href="${experiment.href}"]`)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  test('is readable with JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()

    await page.goto('/lab')
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(EXPERIMENTS.length)

    await context.close()
  })
})
