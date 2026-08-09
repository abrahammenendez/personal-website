import { Link, type LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function BackLink({ to, children }: Readonly<{ to: LinkProps['to']; children: ReactNode }>) {
  return (
    <Link
      to={to}
      className="font-heading text-meta text-muted-foreground transition-colors hover:text-foreground hover:no-underline"
    >
      ← {children}
    </Link>
  )
}
