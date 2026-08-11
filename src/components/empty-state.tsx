import Link from 'next/link'
import { Plus } from 'lucide-react'

export function EmptyState({ title, description, actionHref, actionLabel }: { title: string; description: string; actionHref?: string; actionLabel?: string }) {
  return <div className="np-card flex min-h-64 flex-col items-center justify-center p-8 text-center">
    <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#e6f5ee] text-[#167451]"><Plus /></div>
    <h2 className="text-lg font-bold">{title}</h2><p className="mt-2 max-w-md text-sm text-[#607269]">{description}</p>
    {actionHref && actionLabel && <Link className="np-button mt-5" href={actionHref}><Plus size={17}/>{actionLabel}</Link>}
  </div>
}
