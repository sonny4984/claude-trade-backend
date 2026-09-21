import type { ReactNode } from 'react'

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-32 pt-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight">{title}</h1>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-black/15 p-4 ${className}`}>{children}</div>
}

type BtnProps = {
  children: ReactNode
  onClick?: () => void
  variant?: 'solid' | 'outline' | 'accent'
  disabled?: boolean
  type?: 'button' | 'submit'
  full?: boolean
}

export function Button({
  children,
  onClick,
  variant = 'outline',
  disabled,
  type = 'button',
  full = true,
}: BtnProps) {
  const base =
    'min-h-[60px] px-4 text-[17px] font-semibold leading-snug border disabled:opacity-35 ' +
    (full ? 'w-full ' : '')
  const styles: Record<string, string> = {
    solid: 'bg-black text-white border-black',
    outline: 'bg-white text-black border-black/30',
    accent: 'bg-accent text-white border-accent',
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={base + styles[variant]}>
      {children}
    </button>
  )
}

export function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border border-black/15 px-3 py-4 text-center">
      <div className="text-[13px] text-black/55">{label}</div>
      <div className={`mt-1 text-[26px] font-bold tabular-nums ${accent ? 'text-accent' : ''}`}>
        {value}
      </div>
    </div>
  )
}

/** 정답률 막대 */
export function Bar({ label, correct, total }: { label: string; correct: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100)
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between text-[14px]">
        <span>{label}</span>
        <span className="tabular-nums text-black/60">
          {pct}% <span className="text-black/40">({correct}/{total})</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full bg-black/10">
        <div
          className={`h-2 ${pct < 70 ? 'bg-accent' : 'bg-black'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[14px] font-semibold">{label}</span>
      {children}
    </label>
  )
}

export const inputCls =
  'w-full min-h-[52px] border border-black/30 px-3 py-2 text-[16px] bg-white'
