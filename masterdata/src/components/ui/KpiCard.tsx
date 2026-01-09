'use client'

interface KpiCardProps {
  label: string
  value: number | string
  className?: string
}

export function KpiCard({ label, value, className = '' }: KpiCardProps) {
  return (
    <div className={`kpi-card ${className}`} style={{ flex: 1 }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  )
}

interface KpiGridProps {
  children: React.ReactNode
}

export function KpiGrid({ children }: KpiGridProps) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      {children}
    </div>
  )
}
