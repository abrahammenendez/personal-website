export interface ExperimentMetadata {
  /** URL segment. The experiment lives at `/lab/{slug}`. */
  slug: string
  title: string
  description: string
  /** ISO date (YYYY-MM-DD). Orders the index and sets the sitemap `lastmod`. */
  createdAt: string
  /**
   * Unpublished experiments are left out of the index and the sitemap, but
   * their route is still prerendered, so they stay shareable by link.
   */
  published: boolean
}
