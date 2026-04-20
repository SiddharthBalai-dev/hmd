import { useState, useEffect, useRef } from 'react'
import { listenToDeviceVitals } from '../firebase'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { gatePrediction } from '../utils/predictionGate'
import { Radio, Heart, Wind, Thermometer, Loader, AlertCircle, Link2, SignalHigh, SignalMedium, SignalLow, ShieldCheck, ShieldAlert } from 'lucide-react'

export default function LiveMonitor({ patientId, deviceId, onNewReading }) {
  const { user } = useAuth()
  const role = user?.role || 'doctor'

  const [connected, setConnected] = useState(false)
  const [readings, setReadings] = useState([])
  const [latest, setLatest] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [deviceInput, setDeviceInput] = useState('')
  const [linking, setLinking] = useState(false)
  const [history, setHistory] = useState([])  // For gating
  const [display, setDisplay] = useState(null)  // Gated display data
  const lastProcessedRef = useRef(null)

  const handleLinkDevice = async () => {
    if (!deviceInput.trim()) return
    setLinking(true)
    try {
      await fetch(`/api/patients/${patientId}/device`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceInput.trim() })
      })
      onNewReading?.()
    } catch (err) {
      setError('Failed to link device: ' + err.message)
    } finally {
      setLinking(false)
    }
  }

  useEffect(() => {
    if (!deviceId) return
    setConnected(true)
    setError('')

    const unsubscribe = listenToDeviceVitals(deviceId, async (newReadings) => {
      setReadings(newReadings)
      if (newReadings.length === 0) return

      const lastReading = newReadings[newReadings.length - 1]
      setLatest(lastReading)

      if (lastReading.firebaseKey !== lastProcessedRef.current && patientId) {
        lastProcessedRef.current = lastReading.firebaseKey
        setProcessing(true)
        try {
          const result = await api.recordVitals(patientId, {
            heartRate: lastReading.heartRate,
            spO2: lastReading.spO2,
            temperature: lastReading.temperature,
          })
          // Append to history for gating logic
          setHistory(prev => {
            const entry = {
              hr: lastReading.heartRate,
              spo2: lastReading.spO2,
              temp: lastReading.temperature,
              prediction: result.prediction?.prediction,
              riskCategory: result.prediction?.risk?.category,
              confidence: result.prediction?.confidence,
              raw: result.prediction,
            }
            const updated = [...prev, entry].slice(-20)
            // Compute gated display
            const gated = gatePrediction(result.prediction, updated, role)
            setDisplay(gated)
            return updated
          })
          onNewReading?.(result)
          setError('')
        } catch (err) {
          setError(err.message)
        } finally {
          setProcessing(false)
        }
      }
    })

    return () => {
      unsubscribe()
      setConnected(false)
    }
  }, [deviceId, patientId, onNewReading, role])

  // ── No device linked
  if (!deviceId) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-5 h-5 text-teal-600" />
          <h3 className="text-lg font-semibold">Link ESP32 Device</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Enter the Device ID configured in your Arduino sketch to link this patient with their hardware.
        </p>
        <div className="flex gap-2">
          <input
            placeholder="e.g. PATIENT_001"
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
            value={deviceInput}
            onChange={e => setDeviceInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLinkDevice()}
          />
          <button onClick={handleLinkDevice} disabled={linking || !deviceInput.trim()}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center gap-1.5">
            {linking ? <Loader className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} Link
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    )
  }

  const statusColors = {
    analyzing: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: 'text-blue-500' },
    stable: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', icon: 'text-green-500' },
    caution: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' },
    uncertain: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: 'text-amber-500' },
    warning: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', icon: 'text-orange-500' },
    critical: { bg: 'bg-red-50', border: 'border-red-400', text: 'text-red-700', icon: 'text-red-500' },
  }

  const SignalIcon = ({ quality }) => {
    if (quality === 'good') return <SignalHigh className="w-4 h-4 text-green-500" />
    if (quality === 'fair') return <SignalMedium className="w-4 h-4 text-amber-500" />
    if (quality === 'poor') return <SignalLow className="w-4 h-4 text-red-500" />
    return <SignalLow className="w-4 h-4 text-gray-400" />
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Radio className={`w-5 h-5 ${connected && latest ? 'text-green-500 animate-pulse' : 'text-gray-400'}`} />
            Live ESP32 Device Monitor
          </h3>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${connected && latest ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-sm text-gray-500 font-mono">{deviceId}</span>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        {!latest ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <Loader className="w-6 h-6 animate-spin mx-auto mb-3" />
            <p className="font-medium">Waiting for sensor data...</p>
            <p className="text-xs mt-1">Power on your ESP32 and place your finger on the MAX30102 sensor.</p>
          </div>
        ) : (
          <>
            {/* Live vitals */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
                <Heart className="w-5 h-5 text-red-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-red-700">{latest.heartRate}</div>
                <div className="text-xs text-red-500">BPM</div>
              </div>
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
                <Wind className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-blue-700">{latest.spO2}</div>
                <div className="text-xs text-blue-500">SpO2 %</div>
              </div>
              <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-center">
                <Thermometer className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                <div className="text-3xl font-bold text-orange-700">{Number(latest.temperature).toFixed(1)}</div>
                <div className="text-xs text-orange-500">°C</div>
              </div>
            </div>

            {/* Signal Quality Badge */}
            {display?.signalQuality && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                <SignalIcon quality={display.signalQuality.quality} />
                <span className="text-gray-600 capitalize font-medium">Signal: {display.signalQuality.quality}</span>
                {display.signalQuality.quality !== 'good' && (
                  <span className="text-gray-500 text-xs ml-auto">{display.signalQuality.reason}</span>
                )}
              </div>
            )}

            {processing && (
              <div className="flex items-center gap-2 text-sm text-gray-500 p-3 bg-gray-50 rounded-lg mb-3">
                <Loader className="w-4 h-4 animate-spin" /> Running AI analysis...
              </div>
            )}

            {/* Gated display */}
            {display && !processing && (
              <div className={`p-4 rounded-xl border-2 ${statusColors[display.status]?.border} ${statusColors[display.status]?.bg}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-500 uppercase mb-1">Health Status</div>
                    <div className={`text-xl font-bold ${statusColors[display.status]?.text}`}>
                      {display.label}
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{display.message}</p>
                  </div>
                  {display.status === 'critical' ? (
                    <ShieldAlert className={`w-12 h-12 ${statusColors[display.status]?.icon}`} />
                  ) : display.status === 'stable' ? (
                    <ShieldCheck className={`w-12 h-12 ${statusColors[display.status]?.icon}`} />
                  ) : (
                    <AlertCircle className={`w-12 h-12 ${statusColors[display.status]?.icon}`} />
                  )}
                </div>

                {/* Doctor-only details */}
                {display.showDetails && display.rawPrediction && (
                  <div className="text-xs text-gray-600 mt-3 pt-3 border-t border-white/50">
                    <span className="font-semibold">Raw ML: </span>
                    {display.rawPrediction.prediction} ({(display.rawPrediction.confidence * 100).toFixed(1)}%)
                    {' | '}
                    Risk: {display.rawPrediction.risk?.numeric_score}/100 ({display.rawPrediction.risk?.category})
                    {' | '}
                    MEWS: {display.rawPrediction.derived_vitals?.mews}
                    {display.unconfirmed && <span className="ml-1 font-bold text-orange-700">[Unconfirmed]</span>}
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-gray-400 mt-3 text-center">
              {readings.length} reading{readings.length !== 1 ? 's' : ''} from device
              {history.length > 0 && ` | ${history.length} analyzed`}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
