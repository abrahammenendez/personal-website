export type Scheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'userColorSchemePreference'

/**
 * Puts the resolved `light`/`dark` class on `<html>` before first paint.
 * Serialised to a string because it has to run before any bundle loads; the
 * `change` listener survives `ScriptOnce` removing the `<script>` element,
 * since the closure is what holds it.
 */
export const THEME_INIT_SCRIPT = `(${applyStoredOrSystemScheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)});`

/** An absent storage key means "follow the OS", so there is no third state. */
function applyStoredOrSystemScheme(storageKey: string) {
  try {
    const query = window.matchMedia('(prefers-color-scheme: dark)')

    function apply() {
      let stored: string | null = null
      try {
        stored = localStorage.getItem(storageKey)
      } catch {
        // Private browsing with storage disabled.
      }
      const scheme =
        stored === 'light' || stored === 'dark' ? stored : query.matches ? 'dark' : 'light'
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(scheme)
    }

    apply()
    query.addEventListener('change', apply)
  } catch {
    // matchMedia unavailable; the CSS default scheme stands.
  }
}

/**
 * Watches the class attribute, because it also changes from the `matchMedia`
 * handler inside `THEME_INIT_SCRIPT`, which has no way to call back into React.
 */
export function subscribeToScheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })

  return () => observer.disconnect()
}

export function getScheme(): Scheme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Matches the `:root` fallback in styles.css, so SSR markup agrees. */
export function getServerScheme(): Scheme {
  return 'light'
}

/** Storing an explicit preference also ends the OS live-following above. */
export function toggleScheme(): void {
  const root = document.documentElement
  const next: Scheme = root.classList.contains('dark') ? 'light' : 'dark'

  root.classList.remove('light', 'dark')
  root.classList.add(next)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Private browsing with storage disabled: the toggle still works for this
    // page, it just will not persist.
  }
}
