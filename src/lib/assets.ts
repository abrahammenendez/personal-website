/**
 * Static files under `public/`, referenced from `<head>`.
 *
 * Plain strings, no Vite import syntax: `vite.config.ts` reaches this module
 * through `seo.ts` under plain Node, so nothing here may need Vite to resolve.
 * That is why the `?url` font preloads live in `fonts.ts`.
 */
export const OG_IMAGE = '/og-image.png'
export const FAVICON_SVG = '/logo.svg'
export const FAVICON_PNG = '/favicon.png'
export const APPLE_TOUCH_ICON = '/apple-touch-icon.png'
