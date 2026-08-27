import { expect, test } from '@playwright/test'
import { findAllPublishedExperiments } from '@/lab'

const SITE_URL = 'https://abrahammenendez.com'

const PAGES = [
  { path: '/', canonical: `${SITE_URL}/`, title: 'Abraham Menéndez' },
  { path: '/lab', canonical: `${SITE_URL}/lab`, title: 'Lab — Abraham Menéndez' },
  {
    path: '/lab/hello-server',
    canonical: `${SITE_URL}/lab/hello-server`,
    title: 'Hello, server — Abraham Menéndez',
  },
  {
    path: '/lab/peelr',
    canonical: `${SITE_URL}/lab/peelr`,
    title: 'peelr — Abraham Menéndez',
  },
]

test.describe('per-page metadata', () => {
  for (const { path, canonical, title } of PAGES) {
    test(`${path} declares its own title and a single canonical`, async ({ page }) => {
      await page.goto(path)

      await expect(page).toHaveTitle(title)

      const canonicalLink = page.locator('link[rel="canonical"]')
      await expect(canonicalLink).toHaveCount(1)
      await expect(canonicalLink).toHaveAttribute('href', canonical)
    })
  }

  test('og:image is absolute, which link previews require', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^https:\/\//,
    )
  })
})

test.describe('crawlable surface', () => {
  test('lists every experiment hosted here in the sitemap', async ({ request }) => {
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.ok()).toBe(true)

    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${SITE_URL}/`)
    expect(xml).toContain(`<loc>${SITE_URL}/lab</loc>`)

    for (const { slug } of findAllPublishedExperiments().filter(({ href }) => !href)) {
      expect(xml).toContain(`<loc>${SITE_URL}/lab/${slug}</loc>`)
    }
  })

  test('points robots.txt at the sitemap', async ({ request }) => {
    const robots = await request.get('/robots.txt')

    expect(robots.ok()).toBe(true)
    expect(await robots.text()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
  })

  test('resolves every URL the sitemap advertises', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) => match[1] ?? [])

    expect(locs.length).toBeGreaterThan(1)

    for (const loc of locs) {
      const response = await request.get(new URL(loc).pathname)
      expect(response.status(), `${loc} is in the sitemap but does not resolve`).toBe(200)
    }
  })

  test('serves each page at the exact URL its canonical claims', async ({ request }) => {
    // Guards `html_handling` in wrangler.jsonc: on the default setting
    // Cloudflare serves these at `/<slug>/`, so every canonical would point at
    // a URL that redirects.
    for (const path of ['/lab', '/lab/hello-server', '/lab/peelr']) {
      const direct = await request.get(path, { maxRedirects: 0 })
      expect(direct.status(), `${path} should be served, not redirected`).toBe(200)

      const withSlash = await request.get(`${path}/`, { maxRedirects: 0 })
      expect(withSlash.status()).toBe(307)
      expect(withSlash.headers().location).toBe(path)
    }
  })
})
