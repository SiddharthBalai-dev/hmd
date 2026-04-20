import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { gatePrediction } from '../utils/predictionGate'
import { Play, Square, Heart, Wind, Thermometer, Loader, Settings, SignalHigh, SignalMedium, SignalLow, ShieldCheck, ShieldAlert, AlertCircle } from 'lucide-react'

// Realistic vital sign simulator based on clinical patterns
function generateVitals(profile, prevVitals, readingNum) {
  const { age, scenario } = profile

  // Base ranges by scenario
  const scenarios = {
    healthy: { hr: [68, 82], spo2: [96, 99], temp: [36.3, 37.0] },
    mild_fever: { hr: [85, 100], spo2: [95, 98], temp: [37.5, 38.5] },
    high_fever: { hr: [100, 120], spo2: [93, 96], temp: [38.5, 39.8] },
    respiratory: { hr: [95, 125], spo2: [86, 93], temp: [37.0, 38.5] },
    cardiac: { hr: [45, 65], spo2: [90, 95], temp: [36.5, 37.2] },
    deteriorating: { hr: [75, 90], spo2: [94, 98], temp: [36.5, 37.5] },
    sepsis: { hr: [105, 130], spo2: [91, 96], temp: [38.5, 40.2] },
    recovering: { hr: [90, 105], spo2: [93, 96], temp: [37.5, 38.2] },
  }

  let base = scenarios[scenario] || scenarios.healthy

  // Deteriorating pattern: vitals worsen over time
  if (scenario === 'deteriorating') {
    const progress = Math.min(readingNum / 15, 1)
    base = {
      hr: [75 + progress * 35, 90 + progress * 40],
      spo2: [94 - progress * 8, 98 - progress * 6],
      temp: [36.5 + progress * 2, 37.5 + progress * 2.5],
    }
  }

  // Recovering pattern: vitals improve over time
  if (scenario === 'recovering') {
    const progress = Math.min(readingNum / 15, 1)
    base = {
      hr: [105 - progress * 25, 115 - progress * 25],
      spo2: [92 + progress * 5, 95 + progress * 4],
      temp: [38.5 - progress * 1.5, 39.0 - progress * 1.5],
    }
  }

  // Add realistic noise + continuity from previous reading
  const noise = () => (Math.random() - 0.5) * 2
  const drift = 0.7 // How much previous reading influences next

  let hr, spo2, temp
  const randInRange = (lo, hi) => lo + Math.random() * (hi - lo)

  if (prevVitals) {
    hr = Math.round(prevVitals.hr * drift + randInRange(base.hr[0], base.hr[1]) * (1 - drift) + noise() * 2)
    spo2 = Math.round((prevVitals.spo2 * drift + randInRange(base.spo2[0], base.spo2[1]) * (1 - drift) + noise() * 0.5) * 10) / 10
    temp = Math.round((prevVitals.temp * drift + randInRange(base.temp[0], base.temp[1]) * (1 - drift) + noise() * 0.1) * 10) / 10
  } else {
    hr = Math.round(randInRange(base.hr[0], base.hr[1]))
    spo2 = Math.round(randInRange(base.spo2[0], base.spo2[1]) * 10) / 10
    temp = Math.round(randInRange(base.temp[0], base.temp[1]) * 10) / 10
  }

  // Clamp to valid ranges
  hr = Math.max(30, Math.min(200, hr))
  spo2 = Math.max(75, Math.min(100, spo2))
  temp = Math.max(34, Math.min(41, temp))

  return { hr, spo2, temp }
}

const SCENARIOS = [
  { value: 'healthy', label: 'Routine Checkup' },
  { value: 'mild_fever', label: 'Mild Fever' },
  { value: 'high_fever', label: 'High Fever / Infection' },
  { value: 'respiratory', label: 'Respiratory Distress' },
  { value: 'cardiac', label: 'Cardiac Irregularity' },
  { value: 'deteriorating', label: 'Gradual Deterioration' },
  { value: 'sepsis', label: 'Sepsis Pattern' },
  { value: 'recovering', label: 'Post-Treatment Recovery' },
]

export default function AutoMonitor({ patientId, patient, onNewReading }) {
  const { user } = useAuth()
  const role = user?.role || 'doctor'

  const [running, setRunning] = useState(false)
  const [scenario, setScenario] = useState('healthy')
  const [interval, setInterval_] = useState(3)
  const [readings, setReadings] = useState([])
  const [latest, setLatest] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [showSettings, setShowSettings] = useState(true)
  const [display, setDisplay] = useState(null)

  const intervalRef = useRef(null)
  const prevVitalsRef = useRef(null)
  const readingNumRef = useRef(0)

  const takeReading = useCallback(async () => {
    const vitals = generateVitals(
      { age: patient?.age || 40, scenario },
      prevVitalsRef.current,
      readingNumRef.current
    )
    prevVitalsRef.current = vitals
    readingNumRef.current++

    setLatest(vitals)
    setProcessing(true)

    try {
      const result = await api.recordVitals(patientId, {
        heartRate: vitals.hr,
        spO2: vitals.spo2,
        temperature: vitals.temp,
      })
      setPrediction(result.prediction)

      setReadings(prev => {
        const newEntry = {
          ...vitals,
          prediction: result.prediction?.prediction,
          riskScore: result.prediction?.risk?.numeric_score,
          riskCategory: result.prediction?.risk?.category,
          confidence: result.prediction?.confidence,
          mews: result.prediction?.derived_vitals?.mews,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
        const updated = [...prev.slice(-29), newEntry]
        // Gate the prediction display
        const gated = gatePrediction(result.prediction, updated, role)
        setDisplay(gated)
        return updated
      })

      onNewReading?.()
    } catch (err) {
      console.error('Failed to record:', err)
    } finally {
      setProcessing(false)
    }
  }, [patientId, patient, scenario, onNewReading, role])

  const start = () => {
    setRunning(true)
    setShowSettings(false)
    readingNumRef.current = 0
    prevVitalsRef.current = null
    setReadings([])
    takeReading()
    intervalRef.current = window.setInterval(takeReading, interval * 1000)
  }

  const stop = () => {
    setRunning(false)
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [])

  const severityColor = (s) => {
    if (!s) return 'border-gray-200 bg-gray-50'
    if (s === 'healthy') return 'border-green-300 bg-green-50'
    if (['critical', 'cardiac_event', 'sepsis'].includes(s)) return 'border-red-300 bg-red-50'
    return 'border-amber-300 bg-amber-50'
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Heart className={`w-5 h-5 ${running ? 'text-red-500 animate-pulse' : 'text-gray-400'}`} />
          Continuous Monitoring
        </h3>
        <div className="flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Recording — {readings.length} readings
            </span>
          )}
          {!running && (
            <button onClick={() => setShowSettings(s => !s)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      {showSettings && !running && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Clinical Scenario</label>
            <select value={scenario} onChange={e => setScenario(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
              {SCENARIOS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Simulates realistic vital sign patterns for the selected clinical scenario
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reading Interval: {interval}s
            </label>
            <input type="range" min="2" max="15" value={interval}
              onChange={e => setInterval_(Number(e.target.value))}
              className="w-full" />
            <div className="flex justify-between text-xs text-gray-400">
              <span>2s (fast)</span><span>15s (realistic)</span>
            </div>
          </div>
        </div>
      )}

      {/* Start / Stop */}
      <div className="flex gap-2">
        {!running ? (
          <button onClick={start}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            <Play className="w-4 h-4" /> Start Monitoring
          </button>
        ) : (
          <button onClick={stop}
            className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
            <Square className="w-4 h-4" /> Stop
          </button>
        )}
      </div>

      {/* Live vitals display */}
      {latest && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
              <Heart className="w-5 h-5 text-red-500 mx-auto mb-1" />
              <div className="text-3xl font-bold text-red-700">{latest.hr}</div>
              <div className="text-xs text-red-500">BPM</div>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
              <Wind className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <div className="text-3xl font-bold text-blue-700">{latest.spo2}</div>
              <div className="text-xs text-blue-500">SpO2 %</div>
            </div>
            <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-center">
              <Thermometer className="w-5 h-5 text-orange-500 mx-auto mb-1" />
              <div className="text-3xl font-bold text-orange-700">{latest.temp}</div>
              <div className="text-xs text-orange-500">°C</div>
            </div>
          </div>

          {/* Signal Quality */}
          {display?.signalQuality && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
              {display.signalQuality.quality === 'good' && <SignalHigh className="w-4 h-4 text-green-500" />}
              {display.signalQuality.quality === 'fair' && <SignalMedium className="w-4 h-4 text-amber-500" />}
              {display.signalQuality.quality === 'poor' && <SignalLow className="w-4 h-4 text-red-500" />}
              <span className="text-gray-600 capitalize font-medium">Signal: {display.signalQuality.quality}</span>
            </div>
          )}

          {/* Prediction */}
          {processing && (
            <div className="flex items-center gap-2 text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">
              <Loader className="w-4 h-4 animate-spin" /> Analyzing...
            </div>
          )}
          {display && !processing && (() => {
            const statusColors = {
              analyzing: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: 'text-blue-500' },
              stable: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', icon: 'text-green-500' },
              caution: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' },
              uncertain: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' },
              warning: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', icon: 'text-orange-500' },
              critical: { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', icon: 'text-red-500' },
            }
            const c = statusColors[display.status] || statusColors.stable
            return (
              <div className={`p-4 rounded-xl border-2 ${c.border} ${c.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1">Health Status</div>
                    <div className={`text-xl font-bold ${c.text}`}>{display.label}</div>
                    <p className="text-sm text-gray-700 mt-1">{display.message}</p>
                  </div>
                  {display.status === 'critical'
                    ? <ShieldAlert className={`w-12 h-12 ${c.icon}`} />
                    : display.status === 'stable'
                      ? <ShieldCheck className={`w-12 h-12 ${c.icon}`} />
                      : <AlertCircle className={`w-12 h-12 ${c.icon}`} />}
                </div>
                {display.showDetails && display.rawPrediction && (
                  <div className="text-xs text-gray-600 mt-3 pt-3 border-t border-white/50">
                    <span className="font-semibold">Raw ML:</span> {display.rawPrediction.prediction} ({(display.rawPrediction.confidence * 100).toFixed(1)}%)
                    {' | '}Risk: {display.rawPrediction.risk?.numeric_score}/100
                    {' | '}MEWS: {display.rawPrediction.derived_vitals?.mews}
                    {display.unconfirmed && <span className="ml-1 font-bold text-orange-700">[Unconfirmed]</span>}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Rolling readings table */}
          {readings.length > 1 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left text-gray-600">Time</th>
                    <th className="px-3 py-1.5 text-right text-gray-600">HR</th>
                    <th className="px-3 py-1.5 text-right text-gray-600">SpO2</th>
                    <th className="px-3 py-1.5 text-right text-gray-600">Temp</th>
                    <th className="px-3 py-1.5 text-center text-gray-600">Risk</th>
                    <th className="px-3 py-1.5 text-left text-gray-600">Prediction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...readings].reverse().map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-500">{r.time}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.hr}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.spo2}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{r.temp}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          r.riskCategory === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                          r.riskCategory === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                          r.riskCategory === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>{r.riskScore}</span>
                      </td>
                      <td className="px-3 py-1.5 capitalize">{r.prediction?.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
