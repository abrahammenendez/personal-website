import { expect, test } from '@playwright/test'

// `--text-body` and `max-w-[40em]` have to move together; changing one alone
// silently changes the measure. The bounds are loose on purpose: they catch a
// layout that has broken, not a measure that differs from taste.
const VIEWPORTS = [
  { label: 'mobile', width: 375, height: 812 },
  { label: 'laptop', width: 1440, height: 900 },
  { label: '4K-class', width: 2560, height: 1440 },
] as const

const MIN_CHARACTERS_PER_LINE = 40
const MAX_CHARACTERS_PER_LINE = 100

for (const { label, width, height } of VIEWPORTS) {
  test(`holds its measure on ${label} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')

    const charactersPerLine = await page.evaluate(() => {
      const paragraph = [...document.querySelectorAll('main p')].find((element) =>
        element.textContent?.includes('Spanish software developer'),
      )
      if (!paragraph) throw new Error('bio paragraph not found')

      // Measure the rendered text unwrapped, to get an average glyph width.
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'
      probe.style.font = getComputedStyle(paragraph).font
      probe.textContent = paragraph.textContent
      document.body.appendChild(probe)
      const averageGlyphWidth =
        probe.getBoundingClientRect().width / (paragraph.textContent?.length ?? 1)
      probe.remove()

      return Math.round(paragraph.getBoundingClientRect().width / averageGlyphWidth)
    })

    expect(charactersPerLine, `${charactersPerLine} characters per line`).toBeGreaterThanOrEqual(
      MIN_CHARACTERS_PER_LINE,
    )
    expect(charactersPerLine, `${charactersPerLine} characters per line`).toBeLessThanOrEqual(
      MAX_CHARACTERS_PER_LINE,
    )

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows, 'document scrolls horizontally').toBe(false)
  })
}

test('gives header links a 24px tap target', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')

  for (const name of ['Home', 'Lab']) {
    const box = await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name })
      .boundingBox()

    expect(box?.height, `${name} tap target`).toBeGreaterThanOrEqual(24)
  }
})
