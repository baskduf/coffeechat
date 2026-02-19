import type { PropsWithChildren, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

type ButtonProps = PropsWithChildren<{
  type?: 'button' | 'submit'
  variant?: ButtonVariant
  onClick?: () => void
  disabled?: boolean
  full?: boolean
}>

export function Button({ children, type = 'button', variant = 'primary', onClick, disabled = false, full = false }: ButtonProps) {
  return (
    <button type={type} className={`btn btn-${variant}${full ? ' btn-full' : ''}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

export function Card({ title, subtitle, action, children }: PropsWithChildren<{ title: string; subtitle?: string; action?: ReactNode }>) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="card-body">{children}</div>
    </section>
  )
}

export function InputField({ label, children, hint }: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function Badge({ tone = 'neutral', children }: PropsWithChildren<{ tone?: 'neutral' | 'good' | 'warn' | 'bad' }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Notice({ type, message }: { type: 'idle' | 'success' | 'error'; message: string }) {
  return (
    <div className={`notice notice-${type}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-wrap" aria-hidden="true">
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="skeleton-line" />
      ))}
    </div>
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p className="empty">{message}</p>
    </div>
  )
}
