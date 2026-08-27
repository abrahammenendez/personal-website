export interface ExperimentMetadata {
  /** URL segment. An experiment hosted here lives at `/lab/{slug}`. */
  slug: string
  title: string
  description: string
  /** ISO date (YYYY-MM-DD) the experiment shipped. */
  createdAt: string
  /** Set when the experiment lives off-site instead of on a page here. */
  href?: string
  /**
   * Unpublished experiments are left out of the index, but their route is
   * still prerendered and still listed in the sitemap, so they stay shareable
   * by link.
   */
  published: boolean
}
