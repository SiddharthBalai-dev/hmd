import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import PatientForm from '../components/PatientForm'
import { Users, Activity, Brain, Plus, Trash2, ChevronRight } from 'lucide-react'

export default function Dashboard() {
  const [patients, setPatients] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [modelStatus, setModelStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [pts, ms] = await Promise.all([api.listPatients(), api.modelStatus()])
      setPatients(pts)
      setModelStatus(ms)
    } catch (err) {
      console.error('Failed to load data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTrain = async () => {
    setTraining(true)
    try {
      const res = await api.trainModel()
      setModelStatus({ status: 'ready', classes: res.classes })
      alert(`Model trained successfully! Accuracy: ${(res.accuracy * 100).toFixed(1)}%`)
    } catch (err) {
      alert('Training failed: ' + err.message)
    } finally {
      setTraining(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this patient and all their records?')) return
    try {
      await api.deletePatient(id)
      setPatients(pts => pts.filter(p => p.id !== id))
    } catch (err) {
      alert(err.message)
    }
  }

  const statusBadge = (vitals) => {
    if (!vitals) return null
    const pred = vitals.prediction
    if (!pred) return null
    const colors = {
      healthy: 'bg-green-100 text-green-800',
      fever: 'bg-amber-100 text-amber-800',
      critical: 'bg-red-100 text-red-800',
    }
    const color = colors[pred] || (
      ['pneumonia', 'respiratory_distress', 'cardiac_event', 'hypoxia', 'sepsis'].includes(pred)
        ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
    )
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${color}`}>
        {pred.replace(/_/g, ' ')}
      </span>
    )
  }

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{patients.length}</div>
              <div className="text-sm text-gray-500">Registered Patients</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">
                {patients.reduce((sum, p) => sum + (p.readings_count || 0), 0)}
              </div>
              <div className="text-sm text-gray-500">Total Readings</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              modelStatus?.status === 'ready' ? 'bg-green-100' : 'bg-amber-100'
            }`}>
              <Brain className={`w-5 h-5 ${modelStatus?.status === 'ready' ? 'text-green-600' : 'text-amber-600'}`} />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {modelStatus?.status === 'ready' ? 'Model Ready' : 'Model Not Trained'}
              </div>
              <div className="text-xs text-gray-500">
                {modelStatus?.status === 'ready'
                  ? `${modelStatus.classes.length} scenarios`
                  : 'Train to enable predictions'}
              </div>
              {modelStatus?.status !== 'ready' && (
                <button onClick={handleTrain} disabled={training}
                  className="mt-1 text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {training ? 'Training...' : 'Train Now'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add patient */}
      {showForm ? (
        <PatientForm
          onCreated={(p) => { setPatients(pts => [p, ...pts]); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">
          <Plus className="w-4 h-4" /> Register New Patient
        </button>
      )}

      {/* Patient list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold">Patients</h2>
        </div>
        {patients.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No patients registered yet. Click "Register New Patient" to get started.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {patients.map(p => (
              <div key={p.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <Link to={`/patient/${p.id}`} className="font-medium text-blue-700 hover:text-blue-800">
                      {p.name}
                    </Link>
                    {statusBadge(p.latest_vitals)}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {p.age}y {p.gender === 'M' ? 'Male' : 'Female'} | BMI: {p.bmi} | {p.age_group?.replace(/_/g, ' ')}
                    {p.comorbidities && ` | ${p.comorbidities}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {p.readings_count} reading{p.readings_count !== 1 ? 's' : ''} recorded
                    {p.latest_vitals && ` | Latest NEWS2: ${p.latest_vitals.news2_score}/8`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleDelete(p.id)} title="Delete patient"
                    className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <Link to={`/patient/${p.id}`}
                    className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
