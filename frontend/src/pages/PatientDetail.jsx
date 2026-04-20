import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import VitalsChart from '../components/VitalsChart'
import AutoMonitor from '../components/AutoMonitor'
import LiveMonitor from '../components/LiveMonitor'
import WifiManager from '../components/WifiManager'
import { ArrowLeft, FileText, TrendingUp, User, HeartPulse, Radio } from 'lucide-react'

export default function PatientDetail() {
  const { id } = useParams()
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [trends, setTrends] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('live')

  const loadPatient = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([api.getPatient(id), api.getVitals(id)])
      setPatient(p)
      setVitals(v)
      if (v.length >= 2) {
        try { setTrends(await api.getTrends(id)) } catch {}
      }
      if (v.length > 0) {
        try { setPrediction(await api.predict(id)) } catch {}
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadPatient() }, [loadPatient])

  if (loading) return <div className="text-center py-20 text-gray-500">Loading patient data...</div>
  if (!patient) return <div className="text-center py-20 text-red-500">Patient not found</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <User className="w-6 h-6 text-blue-600" />
            {patient.name}
          </h1>
          <div className="text-sm text-gray-500">
            {patient.age}y {patient.gender === 'M' ? 'Male' : 'Female'} | BMI: {patient.bmi} ({patient.age_group?.replace(/_/g, ' ')})
            {patient.comorbidities && ` | ${patient.comorbidities}`}
          </div>
        </div>
        <Link to={`/patient/${id}/report`}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm">
          <FileText className="w-4 h-4" /> View Report
        </Link>
      </div>

      {/* Quick Stats */}
      {vitals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(() => {
            const last = vitals[vitals.length - 1]
            return (
              <>
                <StatCard label="Heart Rate" value={`${last.heart_rate} BPM`}
                  color="gray" />
                <StatCard label="SpO2" value={`${last.spo2}%`}
                  color="gray" />
                <StatCard label="Temperature" value={`${last.temperature}°C`}
                  color="gray" />
                <StatCard label="Risk Score" value={`${last.news2_score}/100`}
                  color={last.news2_score >= 60 ? 'red' : last.news2_score >= 35 ? 'orange' : last.news2_score >= 15 ? 'yellow' : 'green'} />
                <StatCard label="Prediction"
                  value={prediction ? prediction.prediction.replace(/_/g, ' ') : 'N/A'}
                  color={prediction?.risk?.category === 'LOW' ? 'green' : prediction?.risk?.category === 'CRITICAL' ? 'red' : 'orange'}
                  capitalize />
              </>
            )
          })()}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {[
          { key: 'live', label: 'Live Device', icon: Radio },
          { key: 'continuous', label: 'Continuous Monitoring', icon: HeartPulse },
          { key: 'trends', label: 'Trends', icon: TrendingUp },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'live' && (
        <div className="space-y-4">
          <LiveMonitor patientId={id} deviceId={patient?.device_id} onNewReading={loadPatient} />
          {patient?.device_id && <WifiManager deviceId={patient.device_id} />}
        </div>
      )}

      {tab === 'continuous' && (
        <AutoMonitor patientId={id} patient={patient} onNewReading={loadPatient} />
      )}

      {tab === 'trends' && (
        <div className="space-y-6">
          <VitalsChart vitals={vitals} />

          {trends && (
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h3 className="text-base font-semibold mb-4">Trend Analysis</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <TrendItem label="HR Trend" value={trends.hr_trend} />
                <TrendItem label="SpO2 Trend" value={trends.spo2_trend} />
                <TrendItem label="Temp Trend" value={trends.temp_trend} />
                <TrendItem label="Deterioration" value={trends.deterioration_trend} />
                <TrendItem label="HRV (SDNN)" value={trends.hrv_sdnn ? `${trends.hrv_sdnn} ms` : 'N/A'} />
                <TrendItem label="Temp Rate" value={`${trends.temp_rate_of_change}°C/hr`} />
                <TrendItem label="SpO2 Desat" value={trends.spo2_desaturation_flag ? 'DETECTED' : 'None'} />
              </div>
            </div>
          )}

          {!trends && vitals.length < 2 && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-500">
              Record at least 2 vital readings to see trend analysis.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color = 'gray', capitalize = false }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  }
  return (
    <div className={`p-3 rounded-xl border ${colors[color] || colors.gray}`}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className={`text-lg font-bold ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  )
}

function DerivedRow({ label, value, highlight = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${highlight ? 'text-red-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  )
}

function TrendItem({ label, value }) {
  const trendColor = (v) => {
    if (typeof v !== 'string') return 'text-gray-900'
    if (v === 'deteriorating' || v === 'DETECTED') return 'text-red-600'
    if (v === 'increasing' || v === 'decreasing') return 'text-amber-600'
    if (v === 'improving') return 'text-green-600'
    return 'text-gray-900'
  }
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`font-semibold capitalize ${trendColor(value)}`}>{value}</div>
    </div>
  )
}
