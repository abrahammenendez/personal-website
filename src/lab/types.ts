export interface ExperimentMetadata {
  /** URL segment. The experiment lives at `/lab/{slug}`. */
  slug: string
  title: string
  description: string
  /** ISO date (YYYY-MM-DD). Orders the index and sets the sitemap `lastmod`. */
  createdAt: string
  /**
   * Unpublished experiments are left out of the index, but their route is
   * still prerendered and still listed in the sitemap, so they stay shareable
   * by link.
   */
  published: boolean
}
