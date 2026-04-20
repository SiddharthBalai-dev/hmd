import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api'
import { ArrowLeft, FileText, Printer, Shield, Stethoscope, AlertTriangle, Activity, Clock, TrendingUp } from 'lucide-react'

export default function ReportView() {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getReport(id)
      .then(setReport)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="text-center py-20 text-gray-500">Generating report...</div>
  if (error) return (
    <div className="text-center py-20">
      <div className="text-red-500 mb-4">{error}</div>
      <Link to={`/patient/${id}`} className="text-teal-600 hover:underline">Back to patient</Link>
    </div>
  )
  if (!report) return null

  const pred = report.prediction || {}
  const risk = pred.risk || {}
  const derived = pred.derived_vitals || {}
  const recs = pred.recommendations || {}
  const protocol = recs.scenario_protocol || {}
  const guidance = recs.vital_guidance || []
  const patient = report.patient || {}
  const vitals = report.vitals_summary || {}
  const trends = report.trends

  const urgencyColors = {
    emergency: 'bg-red-100 text-red-800 border-red-200',
    urgent: 'bg-orange-100 text-orange-800 border-orange-200',
    watch: 'bg-amber-100 text-amber-800 border-amber-200',
    routine: 'bg-green-100 text-green-800 border-green-200',
  }

  const riskBg = {
    CRITICAL: 'from-red-600 to-red-700',
    HIGH: 'from-orange-500 to-orange-600',
    MEDIUM: 'from-amber-500 to-yellow-500',
    LOW: 'from-green-500 to-emerald-500',
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link to={`/patient/${id}`} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-teal-600" />
              Health Assessment Report
            </h1>
            <div className="text-sm text-gray-500">
              {report.report_id} | {new Date(report.generated_at).toLocaleString()}
            </div>
          </div>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      {/* Patient Info */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-600" /> Patient Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Info label="Name" value={patient.name} />
          <Info label="Patient ID" value={patient.id} />
          <Info label="Age" value={`${patient.age}y (${patient.age_group?.replace(/_/g, ' ')})`} />
          <Info label="Gender" value={patient.gender === 'M' ? 'Male' : 'Female'} />
          <Info label="BMI" value={patient.bmi} />
          <Info label="Comorbidities" value={patient.comorbidities || 'None'} />
          <Info label="Readings" value={report.readings_count} />
        </div>
      </div>

      {/* Risk Score Banner */}
      <div className={`bg-gradient-to-r ${riskBg[risk.category] || riskBg.LOW} rounded-xl p-6 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80 uppercase tracking-wider">Risk Category</div>
            <div className="text-3xl font-bold mt-1">{risk.category}</div>
            <div className="text-sm opacity-90 mt-1">{risk.description}</div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-black">{risk.numeric_score}</div>
            <div className="text-sm opacity-80">/100 risk score</div>
          </div>
        </div>
        {risk.flags?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {risk.flags.map((f, i) => (
              <span key={i} className="bg-white/20 px-3 py-1 rounded-full text-xs">{f}</span>
            ))}
          </div>
        )}
      </div>

      {/* Prediction */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-teal-600" /> AI Clinical Prediction
        </h2>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
          <div>
            <div className="text-2xl font-bold capitalize">{pred.prediction?.replace(/_/g, ' ')}</div>
            <div className="text-sm text-gray-500">Confidence: {(pred.confidence * 100).toFixed(1)}%</div>
          </div>
          <div className={`px-4 py-2 rounded-lg text-sm font-bold uppercase ${urgencyColors[recs.overall_urgency] || ''} border`}>
            {recs.overall_urgency}
          </div>
        </div>
        {/* Top probabilities */}
        {pred.probabilities && (
          <div>
            <div className="text-sm font-medium text-gray-600 mb-2">Differential</div>
            {Object.entries(pred.probabilities).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <div className="w-36 text-xs capitalize text-gray-600">{k.replace(/_/g, ' ')}</div>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-teal-500 h-2 rounded-full" style={{ width: `${v * 100}%` }} />
                </div>
                <div className="text-xs text-gray-500 w-14 text-right">{(v * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vital Signs + Derived Parameters */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-teal-600" /> Vitals & Derived Parameters
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <VitalCard label="Heart Rate" value={vitals.heart_rate} unit="BPM" color="red" />
          <VitalCard label="SpO2" value={vitals.spo2} unit="%" color="blue" />
          <VitalCard label="Temperature" value={vitals.temperature} unit="°C" color="orange" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DerivedCard label="Shock Index" value={derived.shock_index} ref_text="Allgower 1967" warn={derived.shock_index >= 1.0} />
          <DerivedCard label="Oxygen Delivery" value={derived.odi} ref_text="Vincent 2004" warn={derived.odi < 60} />
          <DerivedCard label="STRS" value={derived.strs} ref_text="SpO2-Temp Risk" warn={derived.strs > 15} />
          <DerivedCard label="MAP (mmHg)" value={derived.map_est} ref_text="SSC 2021" warn={derived.map_est < 65} />
          <DerivedCard label="MEWS" value={derived.mews} ref_text="Subbe 2001" warn={derived.mews >= 5} />
          <DerivedCard label="RR Proxy" value={derived.rr_proxy} ref_text="Tarassenko 2006" />
          <DerivedCard label="RPP" value={derived.rpp} ref_text="Robinson 1967" warn={derived.rpp > 12} />
          <DerivedCard label="BSA (m²)" value={derived.bsa} ref_text="DuBois 1916" />
        </div>
      </div>

      {/* Trends */}
      {trends && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-teal-600" /> Temporal Trends
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <TrendBox label="HR Trend" value={trends.hr_trend} />
            <TrendBox label="SpO2 Trend" value={trends.spo2_trend} />
            <TrendBox label="Temp Trend" value={trends.temp_trend} />
            <TrendBox label="Overall" value={trends.deterioration_trend} />
            {trends.hrv_sdnn && <TrendBox label="HRV SDNN" value={`${trends.hrv_sdnn} ms`} />}
            <TrendBox label="Temp Rate" value={`${trends.temp_rate_of_change}°C/hr`} />
          </div>
        </div>
      )}

      {/* Scenario Protocol */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-3">Clinical Protocol — {protocol.scenario?.replace(/_/g, ' ')}</h2>
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase mb-4 border ${urgencyColors[protocol.urgency] || ''}`}>
          {protocol.urgency}
        </div>
        <ol className="space-y-3">
          {protocol.steps?.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-7 h-7 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{i + 1}</span>
              <span className="text-sm text-gray-700 pt-1">{step}</span>
            </li>
          ))}
        </ol>
        <div className="text-xs text-gray-400 mt-4">Reference: {protocol.reference}</div>
      </div>

      {/* Vital Sign Guidance */}
      {guidance.length > 0 && (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Real-time Vital Sign Guidance
          </h2>
          <div className="space-y-3">
            {guidance.map((g, i) => (
              <div key={i} className={`p-4 rounded-lg border ${urgencyColors[g.urgency] || 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase">{g.urgency}</span>
                  <span className="font-semibold text-sm">{g.message}</span>
                </div>
                <p className="text-sm mt-1">{g.action}</p>
                {g.ref && <div className="text-xs opacity-60 mt-2">Ref: {g.ref}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
        <span className="font-semibold">Disclaimer:</span> {recs.disclaimer || report.disclaimer}
      </div>
    </div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium">{value || 'N/A'}</div>
    </div>
  )
}

function VitalCard({ label, value, unit, color }) {
  const colors = { red: 'bg-red-50 border-red-200', blue: 'bg-blue-50 border-blue-200', orange: 'bg-orange-50 border-orange-200' }
  return (
    <div className={`p-4 rounded-lg border ${colors[color] || 'bg-gray-50 border-gray-200'} text-center`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value} <span className="text-sm font-normal text-gray-400">{unit}</span></div>
    </div>
  )
}

function DerivedCard({ label, value, ref_text, warn }) {
  return (
    <div className={`p-3 rounded-lg border ${warn ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${warn ? 'text-red-700' : 'text-gray-800'}`}>{value}</div>
      <div className="text-[10px] text-gray-400">{ref_text}</div>
    </div>
  )
}

function TrendBox({ label, value }) {
  const color = (v) => {
    if (typeof v !== 'string') return 'bg-gray-50'
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
