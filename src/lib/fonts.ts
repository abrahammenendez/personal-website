import ebGaramondWoff2 from '@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2?url'
import geistWoff2 from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'

/**
 * The two weight-variable latin subsets, preloaded so body copy does not reflow
 * after first paint. Separate from `assets.ts` because `?url` only resolves
 * under Vite; see the note there.
 */
export const FONT_PRELOAD_LINKS = [geistWoff2, ebGaramondWoff2].map(
  (href) =>
    ({
      rel: 'preload',
      href,
      as: 'font',
      type: 'font/woff2',
      crossOrigin: 'anonymous',
    }) as const,
)
