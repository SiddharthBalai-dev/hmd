import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api'
import VitalsChart from '../components/VitalsChart'
import AlertsPanel from '../components/AlertsPanel'
import { Heart, Wind, Thermometer, FileText, Activity, User, Shield } from 'lucide-react'

export default function PatientDashboard() {
  const { user } = useAuth()
  const [patient, setPatient] = useState(null)
  const [vitals, setVitals] = useState([])
  const [prediction, setPrediction] = useState(null)
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)

  const patientId = user.patient_link_id

  useEffect(() => {
    loadData()
  }, [patientId])

  const loadData = async () => {
    if (!patientId) {
      setLoading(false)
      return
    }
    try {
      const [p, v] = await Promise.all([api.getPatient(patientId), api.getVitals(patientId)])
      setPatient(p)
      setVitals(v)
      if (v.length > 0) {
        try { setPrediction(await api.predict(patientId)) } catch {}
      }
      if (v.length >= 2) {
        try { setTrends(await api.getTrends(patientId)) } catch {}
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Loading your health data...</div>

  if (!patientId) {
    return (
      <div className="text-center py-20">
        <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-700">No Health Profile Found</h2>
        <p className="text-gray-500 mt-2">Your patient profile hasn't been set up yet. Contact your doctor.</p>
      </div>
    )
  }

  const latest = vitals.length > 0 ? vitals[vitals.length - 1] : null
  const latestAssessment = latest?.assessment

  return (
    <div className="space-y-6">
      {/* Patient header */}
      <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm opacity-80">
              <Shield className="w-4 h-4" /> My Health Dashboard
            </div>
            <h1 className="text-2xl font-bold mt-1">{user.name}</h1>
            <div className="text-sm opacity-80 mt-0.5">
              {patient?.age}y {patient?.gender === 'M' ? 'Male' : 'Female'} | BMI: {patient?.bmi} | {patient?.age_group?.replace(/_/g, ' ')}
            </div>
          </div>
          <Link to={`/patient/${patientId}/report`}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 font-medium transition-colors">
            <FileText className="w-4 h-4" /> My Health Report
          </Link>
        </div>
      </div>

      {/* Current vitals */}
      {latest ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <VitalCard icon={Heart} color="red" label="Heart Rate"
              value={`${latest.heart_rate}`} unit="BPM"
              status={latestAssessment?.heart_rate?.status} />
            <VitalCard icon={Wind} color="blue" label="SpO2"
              value={`${latest.spo2}`} unit="%"
              status={latestAssessment?.spo2?.status} />
            <VitalCard icon={Thermometer} color="orange" label="Temperature"
              value={`${latest.temperature}`} unit="°C"
              status={latestAssessment?.temperature?.status} />
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">NEWS2 Score</div>
              <div className={`text-3xl font-bold ${
                latest.news2_score >= 7 ? 'text-red-600' :
                latest.news2_score >= 5 ? 'text-orange-600' :
                latest.news2_score >= 1 ? 'text-yellow-600' : 'text-green-600'
              }`}>{latest.news2_score}<span className="text-base font-normal text-gray-400">/8</span></div>
              <div className="text-xs text-gray-500 capitalize mt-1">
                {latestAssessment?.news2?.risk_level} risk
              </div>
            </div>
          </div>

          {/* AI Prediction */}
          {prediction && (
            <div className={`p-5 rounded-xl border-2 ${
              prediction.prediction === 'healthy' ? 'bg-green-50 border-green-300' :
              ['critical', 'cardiac_event', 'sepsis'].includes(prediction.prediction) ? 'bg-red-50 border-red-300' :
              'bg-amber-50 border-amber-300'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase">Current Health Status</div>
                  <div className="text-2xl font-bold capitalize mt-1">
                    {prediction.prediction.replace(/_/g, ' ')}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    AI Confidence: {(prediction.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <div>SIRS: {prediction.derived_parameters?.sirs_flag ? <span className="text-red-600 font-bold">POSITIVE</span> : 'Negative'}</div>
                  <div>Stress Index: {prediction.derived_parameters?.metabolic_stress}</div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts */}
          {latestAssessment?.alerts?.length > 0 && (
            <div>
              <h3 className="text-base font-semibold mb-3">Health Alerts</h3>
              <AlertsPanel alerts={[
                ...(latestAssessment.alerts || []),
                ...(trends?.trend_alerts || []),
              ]} />
            </div>
          )}

          {/* Trends */}
          {trends && (
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
              <h3 className="text-base font-semibold mb-3">Your Health Trends</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <TrendBox label="Heart Rate" value={trends.hr_trend} />
                <TrendBox label="SpO2" value={trends.spo2_trend} />
                <TrendBox label="Temperature" value={trends.temp_trend} />
                <TrendBox label="Overall" value={trends.deterioration_trend} />
              </div>
            </div>
          )}

          {/* Chart */}
          <VitalsChart vitals={vitals} />

          {/* Readings count */}
          <div className="text-center text-sm text-gray-500">
            {vitals.length} reading{vitals.length !== 1 ? 's' : ''} recorded |
            Latest: {latest.timestamp ? new Date(latest.timestamp).toLocaleString() : 'N/A'}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-10 text-center">
          <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700">No Readings Yet</h2>
          <p className="text-gray-500 mt-1">
            Your doctor will record your vitals, or they will come from your connected device.
          </p>
        </div>
      )}
    </div>
  )
}

function VitalCard({ icon: Icon, color, label, value, unit, status }) {
  const statusColor = status === 'normal' ? 'text-green-600' : status ? 'text-red-600' : 'text-gray-600'
  const bgColors = { red: 'bg-red-50', blue: 'bg-blue-50', orange: 'bg-orange-50' }
  const iconColors = { red: 'text-red-500', blue: 'text-blue-500', orange: 'text-orange-500' }
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 ${bgColors[color]} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColors[color]}`} />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span></div>
      <div className={`text-xs capitalize mt-1 ${statusColor}`}>{status || 'N/A'}</div>
    </div>
  )
}

function TrendBox({ label, value }) {
  const color = (v) => {
    if (v === 'deteriorating') return 'text-red-700 bg-red-50'
    if (v === 'improving') return 'text-green-700 bg-green-50'
    if (v === 'increasing' || v === 'decreasing') return 'text-amber-700 bg-amber-50'
    return 'bg-gray-50'
  }
  return (
    <div className={`p-3 rounded-lg ${color(value)}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold capitalize">{value}</div>
    </div>
  )
}
