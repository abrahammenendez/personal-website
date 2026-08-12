import { Link, type LinkProps } from '@tanstack/react-router'
import { ThemeToggle } from '@/components/ThemeToggle'

export function SiteHeader() {
  return (
    <header className="mt-6 mb-7 flex items-center justify-between gap-6">
      <nav aria-label="Main" className="flex items-center gap-6">
        {/* `exact`, or `/` matches every route and Home always reads as current. */}
        <NavLink to="/" activeOptions={{ exact: true }}>
          Home
        </NavLink>
        <NavLink to="/lab">Lab</NavLink>
      </nav>
      <ThemeToggle />
    </header>
  )
}

/**
 * Styled off `data-status`, not `activeProps`: that merges classes instead of
 * replacing them, leaving both colours applied. Weight carries the active
 * state too, since in dark the colours alone miss WCAG 1.4.11.
 */
function NavLink({
  to,
  activeOptions,
  children,
}: Readonly<Pick<LinkProps, 'to' | 'activeOptions' | 'children'>>) {
  return (
    <Link
      to={to}
      activeOptions={activeOptions}
      // `py-1`: the text alone is a ~20px box, under WCAG 2.5.8's 24px target.
      className="-my-1 py-1 font-heading font-medium text-meta text-muted-foreground transition-colors hover:text-foreground hover:no-underline data-[status=active]:font-semibold data-[status=active]:text-foreground"
    >
      {children}
    </Link>
  )
}
