export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="NutriPro">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#167451] text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 20V9m0 0 6 11V4m0 0 6 7v9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && <span className="text-xl font-black tracking-[-.04em] text-[#10251d]">NutriPro</span>}
    </div>
  )
}
