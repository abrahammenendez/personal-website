import type { ReactNode } from 'react'

export function PageHeader({ title, children }: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-bold font-heading text-title">{title}</h1>
      {children ? <p className="font-heading text-note">{children}</p> : null}
    </div>
  )
}
