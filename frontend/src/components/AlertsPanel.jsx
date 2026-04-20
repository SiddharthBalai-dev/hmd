import { AlertTriangle, AlertCircle, Info } from 'lucide-react'

export default function AlertsPanel({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm">
        No active alerts. All vitals within acceptable parameters.
      </div>
    )
  }

  const Icon = ({ level }) => {
    if (level === 'critical') return <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
    if (level === 'warning') return <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
    return <Info className="w-5 h-5 text-blue-600 shrink-0" />
  }

  const colors = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${colors[alert.level] || colors.info}`}>
          <Icon level={alert.level} />
          <div>
            <span className="font-semibold text-xs uppercase mr-2">{alert.level}</span>
            <span className="text-sm">{alert.message}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
