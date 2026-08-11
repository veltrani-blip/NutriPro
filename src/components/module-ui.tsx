import Link from 'next/link'

export function PageHeader({ eyebrow, title, description, actionHref, actionLabel }: { eyebrow: string; title: string; description?: string; actionHref?: string; actionLabel?: string }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[#167451]">{eyebrow}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm text-[#607269]">{description}</p>}</div>{actionHref && actionLabel && <Link className="np-button" href={actionHref}>{actionLabel}</Link>}</div>
}

export function Feedback({ message, error }: { message?: string; error?: string }) {
  if (!message && !error) return null
  return <div className={`mt-5 rounded-2xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error ?? message}</div>
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="np-card p-10 text-center text-sm text-[#607269]">{children}</div>
}
