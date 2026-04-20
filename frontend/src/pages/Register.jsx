import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { api } from '../api'
import { Activity, UserPlus } from 'lucide-react'

const COMORBIDITIES = [
  'asthma', 'hypertension', 'diabetes', 'copd',
  'heart_disease', 'obesity', 'chronic_kidney_disease',
]

export default function Register() {
  const [role, setRole] = useState('doctor')
  const [form, setForm] = useState({
    email: '', password: '', name: '', specialization: '',
    age: '', gender: 'M', bmi: '', comorbidities: [],
    activity_level: 'light', doctor_id: '',
  })
  const [doctors, setDoctors] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    api.listDoctors().then(setDoctors).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        email: form.email,
        password: form.password,
        name: form.name,
        role,
      }
      if (role === 'doctor') {
        payload.specialization = form.specialization
      } else {
        payload.age = parseInt(form.age)
        payload.gender = form.gender
        payload.bmi = parseFloat(form.bmi)
        payload.comorbidities = form.comorbidities.join(',')
        payload.activity_level = form.activity_level
        if (form.doctor_id) payload.doctor_id = parseInt(form.doctor_id)
      }
      const user = await api.register(payload)
      login(user)
      navigate('/')
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
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 pt-20 flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold text-teal-700 mb-2">
            <Activity className="w-8 h-8" />
            HealthMonitor
          </div>
          <p className="text-gray-500">Create your account</p>
        </div>

        {/* Role selector */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-6">
          <button onClick={() => setRole('doctor')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              role === 'doctor' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-600'}`}>
            Doctor
          </button>
          <button onClick={() => setRole('patient')}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              role === 'patient' ? 'bg-white shadow-sm text-teal-700' : 'text-gray-600'}`}>
            Patient
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input required className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input required type="email" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input required type="password" minLength={6} className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>

          {role === 'doctor' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Specialization</label>
              <input placeholder="e.g. General Physician, Pulmonologist"
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                value={form.specialization} onChange={e => setForm(f => ({ ...f, specialization: e.target.value }))} />
            </div>
          )}

          {role === 'patient' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  <input required type="number" min="0" max="120"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BMI (kg/m²)</label>
                  <input required type="number" step="0.1" min="10" max="70"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    value={form.bmi} onChange={e => setForm(f => ({ ...f, bmi: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Activity Level</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    value={form.activity_level} onChange={e => setForm(f => ({ ...f, activity_level: e.target.value }))}>
                    <option value="sedentary">Sedentary</option>
                    <option value="light">Light</option>
                    <option value="moderate">Moderate</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Doctor</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  value={form.doctor_id} onChange={e => setForm(f => ({ ...f, doctor_id: e.target.value }))}>
                  <option value="">-- Select Doctor --</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>Dr. {d.name}{d.specialization ? ` (${d.specialization})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comorbidities</label>
                <div className="flex flex-wrap gap-2">
                  {COMORBIDITIES.map(c => (
                    <button type="button" key={c} onClick={() => toggleComorb(c)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        form.comorbidities.includes(c)
                          ? 'bg-teal-100 border-teal-400 text-teal-800'
                          : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                      }`}>
                      {c.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            <UserPlus className="w-4 h-4" />
            {loading ? 'Creating account...' : `Register as ${role === 'doctor' ? 'Doctor' : 'Patient'}`}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-teal-600 hover:underline font-medium">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
