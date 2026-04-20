import { useState } from 'react'
import { api } from '../api'
import { Heart, Thermometer, Wind } from 'lucide-react'

export default function VitalsRecorder({ patientId, onRecorded }) {
  const [vitals, setVitals] = useState({ heartRate: '', spO2: '', temperature: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const payload = {
        heartRate: parseFloat(vitals.heartRate),
        spO2: parseFloat(vitals.spO2),
        temperature: parseFloat(vitals.temperature),
      }
      const res = await api.recordVitals(patientId, payload)
      setResult(res)
      onRecorded?.(res)
      setVitals({ heartRate: '', spO2: '', temperature: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const severityColor = (status) => {
    if (status === 'normal') return 'text-green-700 bg-green-50'
    if (status === 'high' || status === 'low') return 'text-amber-700 bg-amber-50'
    return 'text-red-700 bg-red-50'
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
      <h3 className="text-lg font-semibold mb-4">Record Vital Signs</h3>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Heart className="w-4 h-4 text-red-500" /> Heart Rate (BPM)
            </label>
            <input required type="number" step="1" min="20" max="250" placeholder="e.g. 72"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
              value={vitals.heartRate} onChange={e => setVitals(v => ({ ...v, heartRate: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Wind className="w-4 h-4 text-blue-500" /> SpO2 (%)
            </label>
            <input required type="number" step="0.1" min="70" max="100" placeholder="e.g. 98"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
              value={vitals.spO2} onChange={e => setVitals(v => ({ ...v, spO2: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Thermometer className="w-4 h-4 text-orange-500" /> Temperature (°C)
            </label>
            <input required type="number" step="0.1" min="30" max="44" placeholder="e.g. 36.6"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none"
              value={vitals.temperature} onChange={e => setVitals(v => ({ ...v, temperature: e.target.value }))} />
          </div>
        </div>
        <button type="submit" disabled={loading}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
          {loading ? 'Recording...' : 'Record Vitals'}
        </button>
      </form>

      {result?.prediction && (
        <div className="mt-6 space-y-4">
          {/* Risk + Prediction */}
          <div className={`p-4 rounded-lg border-2 ${
            result.prediction.risk?.category === 'CRITICAL' ? 'bg-red-50 border-red-300' :
            result.prediction.risk?.category === 'HIGH' ? 'bg-orange-50 border-orange-300' :
            result.prediction.risk?.category === 'MEDIUM' ? 'bg-amber-50 border-amber-300' :
            'bg-green-50 border-green-300'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">AI Prediction</div>
                <div className="text-xl font-bold capitalize">{result.prediction.prediction.replace(/_/g, ' ')}</div>
                <div className="text-sm text-gray-600">Confidence: {(result.prediction.confidence * 100).toFixed(1)}%</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-black">{result.prediction.risk?.numeric_score}</div>
                <div className="text-xs text-gray-500">/100 risk</div>
                <div className="text-xs font-bold mt-0.5">{result.prediction.risk?.category}</div>
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              MEWS: {result.prediction.derived_vitals?.mews} |
              SI: {result.prediction.derived_vitals?.shock_index} |
              ODI: {result.prediction.derived_vitals?.odi} |
              Urgency: {result.prediction.recommendations?.overall_urgency}
            </div>
          </div>

          {/* Risk flags */}
          {result.prediction.risk?.flags?.length > 0 && (
            <div className="space-y-2">
              {result.prediction.risk.flags.map((flag, i) => (
                <div key={i} className="p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200">
                  {flag}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
