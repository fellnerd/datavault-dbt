'use client'

interface KpiCardProps {
  /** Beschriftung */
  label: string
  /** Wert (Zahl oder Text) */
  value: number | string
  /** Optional: Zusätzliche CSS-Klassen */
  className?: string
}

/**
 * Einheitliche KPI-Karte für Statistiken.
 * 
 * @example
 * <KpiCard label="Total" value={42} />
 */
export function KpiCard({ label, value, className = '' }: KpiCardProps) {
  return (
    <div className={`kpi-card ${className}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
    </div>
  )
}

interface KpiGridProps {
  children: React.ReactNode
}

/**
 * Grid-Container für KPI-Karten.
 * 
 * @example
 * <KpiGrid>
 *   <KpiCard label="Total" value={10} />
 *   <KpiCard label="Active" value={8} intent="success" />
 * </KpiGrid>
 */
export function KpiGrid({ children }: KpiGridProps) {
  return (
    <div className="kpi-grid">
      {children}
    </div>
  )
}

