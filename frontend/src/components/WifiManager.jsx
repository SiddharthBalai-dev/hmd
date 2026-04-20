import { useState, useEffect } from 'react'
import { listenToWifiList, addWifiNetwork, removeWifiNetwork } from '../firebase'
import { Wifi, Plus, Trash2, Eye, EyeOff, Loader, Info } from 'lucide-react'

export default function WifiManager({ deviceId }) {
  const [networks, setNetworks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!deviceId) { setLoading(false); return }
    const unsubscribe = listenToWifiList(deviceId, (list) => {
      setNetworks(list)
      setLoading(false)
    })
    return unsubscribe
  }, [deviceId])

  const handleAdd = async () => {
    if (!ssid.trim() || !password.trim()) {
      setError('Both SSID and password are required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      await addWifiNetwork(deviceId, ssid.trim(), password.trim())
      setSsid('')
      setPassword('')
      setShowForm(false)
    } catch (err) {
      setError('Failed to add: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (key, ssidName) => {
    if (!confirm(`Remove "${ssidName}" from device's WiFi list?`)) return
    try {
      await removeWifiNetwork(deviceId, key)
    } catch (err) {
      alert('Failed to remove: ' + err.message)
    }
  }

  if (!deviceId) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        Link an ESP32 device first to manage its WiFi networks.
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Wifi className="w-5 h-5 text-teal-600" />
          Device WiFi Networks
        </h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium">
            <Plus className="w-4 h-4" /> Add Network
          </button>
        )}
      </div>

      {/* Info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Add WiFi networks the device should remember. The ESP32 will try each saved network in order on boot
          and connect to the first one available. New networks sync to the device every 2 minutes while it's online.
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3 border border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">WiFi Name (SSID)</label>
            <input placeholder="e.g. HomeWiFi"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              value={ssid} onChange={e => setSsid(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password (min 8 chars)</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="WiFi password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm font-medium">
              {saving ? 'Saving...' : 'Save Network'}
            </button>
            <button onClick={() => { setShowForm(false); setError(''); setSsid(''); setPassword('') }}
              className="px-4 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Networks list */}
      {loading ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Loader className="w-5 h-5 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : networks.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          No networks added yet. Add one to let your device connect automatically.
        </div>
      ) : (
        <div className="space-y-2">
          {networks.map(n => (
            <div key={n.key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-teal-600" />
                <div>
                  <div className="font-medium text-sm">{n.ssid}</div>
                  <div className="text-xs text-gray-400 font-mono">
                    {'•'.repeat(Math.min(n.password?.length || 8, 12))}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(n.key, n.ssid)}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {networks.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          {networks.length} network{networks.length !== 1 ? 's' : ''} synced to device <span className="font-mono">{deviceId}</span>
        </div>
      )}
    </div>
  )
}
