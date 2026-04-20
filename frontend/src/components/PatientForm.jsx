import { useState } from 'react'
import { api } from '../api'
import { UserPlus } from 'lucide-react'

const COMORBIDITIES = [
  'asthma', 'hypertension', 'diabetes', 'copd',
  'heart_disease', 'obesity', 'chronic_kidney_disease',
]

export default function PatientForm({ onCreated, onCancel, doctorId }) {
  const [form, setForm] = useState({
    name: '', age: '', gender: 'M', bmi: '',
    comorbidities: [], activity_level: 'light',
    device_id: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        ...form,
        age: parseInt(form.age),
        bmi: parseFloat(form.bmi),
        comorbidities: form.comorbidities.join(','),
        doctor_id: doctorId || undefined,
      }
      const patient = await api.createPatient(payload)
      onCreated(patient)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleComorb = (c) => {
    setForm(f => ({
      ...f,
      comorbidities: f.comorbidities.includes(c)
        ? f.comorbidities.filter(x => x !== c)
        : [...f.comorbidities, c],
    }))
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-blue-600" /> Register New Patient
      </h2>
      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Age (years)</label>
            <input required type="number" min="0" max="120"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BMI (kg/m²)</label>
            <input required type="number" step="0.1" min="10" max="70"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form.bmi} onChange={e => setForm(f => ({ ...f, bmi: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Level</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              value={form.activity_level} onChange={e => setForm(f => ({ ...f, activity_level: e.target.value }))}>
              <option value="sedentary">Sedentary</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ESP32 Device ID <span className="text-gray-400 text-xs">(optional — for hardware monitoring)</span>
          </label>
          <input placeholder="e.g. PATIENT_001"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none font-mono text-sm"
            value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} />
          <p className="text-xs text-gray-500 mt-1">
            Match the DEVICE_ID configured in your Arduino sketch to receive live sensor readings via Firebase.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Comorbidities</label>
          <div className="flex flex-wrap gap-2">
            {COMORBIDITIES.map(c => (
              <button type="button" key={c}
                onClick={() => toggleComorb(c)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  form.comorbidities.includes(c)
                    ? 'bg-blue-100 border-blue-400 text-blue-800'
                    : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}>
                {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
            {loading ? 'Registering...' : 'Register Patient'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
