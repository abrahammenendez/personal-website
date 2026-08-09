import { toggleScheme } from '@/lib/theme'

/**
 * Both glyphs stay in the markup and CSS picks one, so the prerendered HTML
 * never guesses a scheme and flips after hydration.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      onClick={toggleScheme}
      aria-label="Toggle color scheme"
      title="Toggle color scheme"
      className="cursor-pointer bg-transparent text-2xl leading-none"
    >
      <span aria-hidden="true" className="hidden dark:inline">
        🌕
      </span>
      <span aria-hidden="true" className="dark:hidden">
        🌑
      </span>
    </button>
  )
}
